'use strict';

/**
 * Appointment -> AI call matching.
 *
 * Matching order (never falls back to "latest call by phone"):
 *   1. exact interaction_id / conversation_id from booking metadata;
 *   2. same phone + outcome='booked' inside
 *      [booking.createdAt - 60min, booking.createdAt + 5min],
 *      closest call to booking.createdAt wins;
 *   3. same phone whose summary / transcript mentions the appointment
 *      date + time;
 *   4. no call.
 */

const { resolveInteractionId, bookingMetadata } = require('./booking-metadata');

function phoneLast10(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function appointmentCreatedAt(appointment) {
  const a = appointment || {};
  const explicit = toDate(a.booking_created_at || a.bookingCreatedAt);
  if (explicit) return explicit;
  // For synced Cal bookings `created_at` is the sync time, not the booking
  // creation time, so using it for the +/- window would attach wrong calls.
  if (a._table === 'calendly_events') return null;
  return toDate(a.created_at || a.createdAt);
}

function appointmentInteractionId(appointment) {
  const a = appointment || {};
  if (a.interaction_id) return String(a.interaction_id);
  const md = a.booking_metadata || a.metadata;
  if (md && typeof md === 'object') {
    const direct = md.interaction_id || md.conversation_id || md.interactionId || md.conversationId;
    if (direct) return String(direct);
  }
  return resolveInteractionId({ metadata: md || {} });
}

function istParts(value) {
  const d = toDate(value);
  if (!d) return null;
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map(p => [p.type, p.value]));
  const hour12 = Number(parts.hour);
  const minute = parts.minute || '00';
  const dayPeriod = (parts.dayPeriod || '').toLowerCase();
  return {
    day: Number(parts.day),
    month: (parts.month || '').toLowerCase(),
    hour12,
    hour24: dayPeriod === 'pm' ? (hour12 % 12) + 12 : (hour12 % 12),
    minute,
    dayPeriod,
  };
}

function textMatchesSlot(text, appointment) {
  const t = String(text || '').toLowerCase();
  if (!t) return false;
  const slot = istParts(appointment && (appointment.starts_at || appointment.start_time));
  if (!slot) return false;

  const dayMatch = new RegExp(`(^|\\D)${slot.day}(\\D|$)`).test(t);
  const monthMatch = t.includes(slot.month);
  if (!dayMatch || !monthMatch) return false;

  const hh = slot.hour12;
  const mm = slot.minute;
  const exactTime = new RegExp(`(^|\\D)${hh}:${mm}(\\D|$)`).test(t);
  const hourMeridiem = new RegExp(`(^|\\D)${hh}\\s*${slot.dayPeriod}(\\D|$)`).test(t);
  return exactTime || hourMeridiem;
}

const MONTHS = {
  january: 'jan', february: 'feb', march: 'mar', april: 'apr', may: 'may', june: 'jun',
  july: 'jul', august: 'aug', september: 'sep', october: 'oct', november: 'nov', december: 'dec',
};

/**
 * True when the call text clearly names a different date or time than the
 * appointment. Stops the +/- window rule from attaching a call that booked a
 * different slot for the same phone number.
 */
function textConflictsWithSlot(text, appointment) {
  const t = String(text || '').toLowerCase();
  if (!t) return false;
  const slot = istParts(appointment && (appointment.starts_at || appointment.start_time));
  if (!slot) return false;

  const monthAlt = [...Object.keys(MONTHS), ...Object.values(MONTHS)].join('|');
  const monthMatch = new RegExp(`\\b(${monthAlt})\\b`, 'i').exec(t);
  if (!monthMatch) return false;

  const mentionedMonth = MONTHS[monthMatch[1].toLowerCase()] || monthMatch[1].toLowerCase();
  if (mentionedMonth !== slot.month) return true;

  // Same month: check the day if one is written next to the month.
  const dayMatch = new RegExp(`\\b(${monthAlt})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b|\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthAlt})\\b`, 'i').exec(t);
  if (dayMatch) {
    const mentionedDay = Number(dayMatch[2] || dayMatch[3]);
    if (mentionedDay && mentionedDay !== slot.day) return true;
  }

  // Same date (or no day): a different written clock time means another slot.
  const timeMatch = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/.exec(t);
  if (timeMatch) {
    const h = Number(timeMatch[1]) % 12;
    const hour24 = timeMatch[3].toLowerCase() === 'pm' ? h + 12 : h;
    const minute = timeMatch[2] || '00';
    if (hour24 !== slot.hour24 || minute !== slot.minute) return true;
  }

  return false;
}

function callSlotText(call) {
  const c = call || {};
  let transcript = '';
  if (typeof c.transcript === 'string') {
    transcript = c.transcript;
  } else if (Array.isArray(c.transcript)) {
    transcript = c.transcript.map(t => (t && (t.text || t.content || t.transcript)) || '').join(' ');
  }
  return `${c.transcript_summary || ''} ${c.summary || ''} ${transcript}`;
}

function pickCallForAppointment(appointment, calls) {
  const a = appointment || {};
  const candidates = Array.isArray(calls) ? calls.filter(Boolean) : [];
  if (candidates.length === 0) return null;

  // 1. Exact interaction / conversation id from booking metadata.
  const interactionId = appointmentInteractionId(a);
  if (interactionId) {
    const exact = candidates.find(c => String(c.conversation_id || '') === interactionId);
    if (exact) return exact;
  }

  const phone = phoneLast10(a.phone || a.invitee_phone);
  if (!phone) return null;
  const samePhone = candidates.filter(c => phoneLast10(c.to_phone) === phone);
  if (samePhone.length === 0) return null;

  // 2. Booking window: call must have booked and finished around booking creation.
  const createdAt = appointmentCreatedAt(a);
  if (createdAt) {
    const min = new Date(createdAt.getTime() - 60 * 60 * 1000);
    const max = new Date(createdAt.getTime() + 5 * 60 * 1000);
    const inWindow = samePhone
      .filter(c => {
        if (String(c.outcome || '').toLowerCase() !== 'booked') return false;
        const started = toDate(c.started_at);
        if (!started || started < min || started > max) return false;
        // Same phone can book several slots; never attach a call that clearly
        // mentions a different date/time than this appointment.
        return !textConflictsWithSlot(callSlotText(c), a);
      })
      .sort((x, y) => {
        const dx = Math.abs(toDate(x.started_at).getTime() - createdAt.getTime());
        const dy = Math.abs(toDate(y.started_at).getTime() - createdAt.getTime());
        return dx - dy;
      });
    if (inWindow.length > 0) return inWindow[0];
  }

  // 3. Summary / transcript mentions the appointment date + time.
  const slotMatches = samePhone.filter(c => textMatchesSlot(callSlotText(c), a));
  if (slotMatches.length > 0) {
    const before = createdAt
      ? slotMatches.filter(c => {
          const started = toDate(c.started_at);
          return !started || started <= createdAt;
        })
      : slotMatches;
    const pool = before.length > 0 ? before : slotMatches;
    pool.sort((x, y) => {
      const dx = toDate(x.started_at)?.getTime() || 0;
      const dy = toDate(y.started_at)?.getTime() || 0;
      return dy - dx; // most recent first
    });
    return pool[0];
  }

  // 4. No reliable match. Never fall back to the latest call by phone.
  return null;
}

module.exports = {
  phoneLast10,
  pickCallForAppointment,
  textMatchesSlot,
  textConflictsWithSlot,
  appointmentCreatedAt,
  appointmentInteractionId,
};
