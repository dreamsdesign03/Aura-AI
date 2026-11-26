/**
 * Cal.com API v2 integration service
 * Handles live sync, rescheduling, and cancellation with Cal.com
 */

function getCalApiKey() {
  return process.env.CAL_API_KEY || process.env.CALCOM_API_KEY || 'cal_live_92ae6d6107040c70be9b0930559ffa17';
}

async function resolveCalBookingUid(row) {
  if (!row) return null;
  if (row.metadata && row.metadata.cal_uid) {
    return String(row.metadata.cal_uid).trim();
  }
  const rawUri = String(row.calendly_uri || '').trim();
  if (!rawUri) return null;
  const stripped = rawUri.replace(/^cal_/, '');
  // If it's already an alphanumeric Cal.com UID (contains letters and digits, >= 10 chars)
  if (stripped.length >= 10 && /[a-zA-Z]/.test(stripped)) {
    return stripped;
  }

  // If it's numeric, query Cal.com API bookings to find its matching UID
  try {
    const apiKey = getCalApiKey();
    const res = await fetch('https://api.cal.com/v2/bookings', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'cal-api-version': '2024-08-13',
      }
    });
    if (res.ok) {
      const body = await res.json();
      const bookings = body.data || [];
      const found = bookings.find(b => String(b.id) === String(stripped) || String(b.uid) === String(stripped));
      if (found && found.uid) {
        return found.uid;
      }
    }
  } catch (err) {
    console.warn('[resolveCalBookingUid] lookup error:', err.message);
  }

  return stripped;
}

async function rescheduleCalBooking(uid, newStartIso) {
  if (!uid) return { ok: false, error: 'No Cal.com booking UID available' };
  const apiKey = getCalApiKey();
  const start = new Date(newStartIso).toISOString();

  try {
    const res = await fetch(`https://api.cal.com/v2/bookings/${encodeURIComponent(uid)}/reschedule`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'cal-api-version': '2024-08-13',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ start })
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = body.error?.message || body.message || `Cal.com reschedule failed (${res.status})`;
      console.warn(`[rescheduleCalBooking] Cal.com API error (${res.status}):`, errMsg);
      return { ok: false, status: res.status, error: errMsg };
    }

    return { ok: true, data: body.data };
  } catch (err) {
    console.warn('[rescheduleCalBooking] Network/API exception:', err.message);
    return { ok: false, error: err.message };
  }
}

async function cancelCalBooking(uid, reason = 'Cancelled by clinic admin') {
  if (!uid) return { ok: false, error: 'No Cal.com booking UID available' };
  const apiKey = getCalApiKey();

  try {
    const res = await fetch(`https://api.cal.com/v2/bookings/${encodeURIComponent(uid)}/cancel`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'cal-api-version': '2024-08-13',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ cancellationReason: reason })
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = body.error?.message || body.message || `Cal.com cancel failed (${res.status})`;
      console.warn(`[cancelCalBooking] Cal.com API error (${res.status}):`, errMsg);
      return { ok: false, status: res.status, error: errMsg };
    }

    return { ok: true, data: body.data };
  } catch (err) {
    console.warn('[cancelCalBooking] Network/API exception:', err.message);
    return { ok: false, error: err.message };
  }
}

const CAL_EVENT_TYPES = {
  ria: 7316960,   // https://cal.com/aura-laser-cosmetic-clinic/30min (Aura Consultation)
  misha: 8029367, // https://cal.com/aura-laser-cosmetic-clinic/skinnonest (Skinnonest Makeup Artist Partnership)
};

function formatE164Phone(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (trimmed.startsWith('+')) return `+${digits}`;
  return `+${digits}`;
}

async function createCalBooking({
  category,
  patientName,
  email,
  phone,
  startsAt,
  treatment,
  branch,
  notes,
}) {
  const apiKey = getCalApiKey();
  const isSkinnonest = category === 'misha'
    || /skinnonest|makeup\s*artist|vishw/i.test(`${treatment || ''} ${notes || ''}`);
  const eventTypeId = isSkinnonest ? CAL_EVENT_TYPES.misha : CAL_EVENT_TYPES.ria;
  const start = new Date(startsAt).toISOString();
  const phoneNumber = formatE164Phone(phone);
  const digits = String(phone || '').replace(/\D/g, '');

  const cleanEmail = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())
    ? String(email).trim()
    : null;
  const attendeeEmail = cleanEmail
    || (digits.length >= 10 ? `${digits.length === 10 ? `91${digits}` : digits}@sms.cal.com` : `booking.${Date.now()}@aura.clinic`);

  const provider = isSkinnonest ? 'Vishw' : 'Dr. Aditya Shah';
  const concern = treatment || (isSkinnonest ? 'Skinnonest Makeup Artist Partnership' : 'Clinical Consultation');
  const resolvedBranch = branch || (isSkinnonest ? 'Online (Google Meet)' : 'Alkapuri Main Clinic');

  const payload = {
    eventTypeId,
    start,
    attendee: {
      name: String(patientName || 'Patient').trim(),
      email: attendeeEmail,
      timeZone: 'Asia/Kolkata',
      language: 'en',
      ...(phoneNumber ? { phoneNumber } : {}),
    },
    metadata: {
      channel: 'manual_aura_dashboard',
      branch: resolvedBranch,
      provider,
      concern,
      event_slug: isSkinnonest ? 'skinnonest' : '30min',
      agent_type: isSkinnonest ? 'makeup_artist' : 'clinic_consultation',
      ...(notes ? { notes: String(notes).slice(0, 500) } : {}),
    },
  };

  try {
    const res = await fetch('https://api.cal.com/v2/bookings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'cal-api-version': '2024-08-13',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = body.error?.message || body.message || `Cal.com booking failed (${res.status})`;
      console.warn(`[createCalBooking] Cal.com API error (${res.status}):`, errMsg);
      return { ok: false, status: res.status, error: errMsg };
    }

    return { ok: true, data: body.data, isSkinnonest, attendeeEmail, phoneNumber };
  } catch (err) {
    console.warn('[createCalBooking] Network/API exception:', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = {
  CAL_EVENT_TYPES,
  getCalApiKey,
  resolveCalBookingUid,
  createCalBooking,
  rescheduleCalBooking,
  cancelCalBooking,
};

