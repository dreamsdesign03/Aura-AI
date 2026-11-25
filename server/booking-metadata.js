'use strict';

/**
 * Single source of truth for turning a Cal.com booking (or a stored booking
 * row) into clinic fields.
 *
 * Rules:
 *  - branch: metadata.branch -> "Branch: X" in notes -> null. NEVER Cal.com
 *    `location` / `address`; never the currently selected branch.
 *  - provider / concern: metadata first, then "With:" / "Service:" in notes.
 *  - source: metadata.channel === 'ai_voice_agent' -> "AI Call"
 *    (booking_type proposal_call -> "AI Call · Proposal"), else "Online Booking".
 */

const VALID_BRANCHES = ['alkapuri', 'waghodia', 'manjalpur', 'vasna'];

function normalizeBranch(branch) {
  if (!branch) return '';
  const b = String(branch).toLowerCase().trim();
  if (b.includes('alkapuri')) return 'Alkapuri';
  if (b.includes('waghodia')) return 'Waghodia';
  if (b.includes('manjalpur')) return 'Manjalpur';
  if (b.includes('vasna')) return 'Vasna';
  return '';
}

function isValidBranch(branch) {
  return VALID_BRANCHES.includes(String(branch || '').toLowerCase().trim());
}

function parseBranchFromNotes(notes) {
  if (!notes) return '';
  const m = /Branch:\s*([A-Za-z ]+?)(?:\s*\||$)/i.exec(String(notes || ''));
  return m ? m[1].trim() : '';
}

function parseProviderFromNotes(notes) {
  if (!notes) return '';
  const m = /With:\s*([A-Za-z .]+?)(?:\s*\||$)/i.exec(String(notes || ''));
  return m ? m[1].trim() : '';
}

function parseServiceFromNotes(notes) {
  if (!notes) return '';
  const m = /Service:\s*([A-Za-z ]+?)(?:\s*\||$)/i.exec(String(notes || ''));
  return m ? m[1].trim() : '';
}

function isSkinnonestBooking(booking) {
  if (!booking) return false;
  if (booking.eventType?.slug === 'skinnonest') return true;
  if (booking.eventTypeId === 8029367) return true;
  if (booking.metadata?.event_slug === 'skinnonest' || booking.metadata?.coordinator === 'Misha') return true;
  if (typeof booking.title === 'string' && /^skinnonest\b/i.test(booking.title.trim())) return true;
  if (typeof booking.event_name === 'string' && /^skinnonest\b/i.test(booking.event_name.trim())) return true;
  return false;
}

function bookingMetadata(booking) {
  const b = booking || {};
  let direct = b.metadata;
  let md = {};
  if (direct && typeof direct === 'object') md = { ...direct };
  else if (typeof direct === 'string' && direct.trim()) {
    try { md = JSON.parse(direct); } catch { /* ignore */ }
  } else {
    const bfr = b.bookingFieldsResponses || {};
    for (const key of ['metadata', 'Metadata']) {
      const value = bfr[key];
      if (value && typeof value === 'object') { md = { ...value }; break; }
      if (typeof value === 'string' && value.trim()) {
        try { md = JSON.parse(value); break; } catch { /* ignore */ }
      }
    }
  }

  if (isSkinnonestBooking(b)) {
    md.agent_type = md.agent_type || 'makeup_artist';
    md.coordinator = md.coordinator || 'Misha';
    md.event_slug = md.event_slug || 'skinnonest';
  }
  return md;
}

function bookingNotes(booking) {
  const b = booking || {};
  const bfr = b.bookingFieldsResponses || {};
  return String(
    b.notes ||
    b.description ||
    bfr.notes ||
    bfr['Notes'] ||
    bfr['Please provide a brief summary of your business & what it is that you do?'] ||
    ''
  );
}

function resolveBranch(booking) {
  const md = bookingMetadata(booking);
  const direct = normalizeBranch(md.branch || md.Branch || md.clinic_branch || md.location_branch);
  if (direct) return direct;
  const fromNotes = normalizeBranch(parseBranchFromNotes(bookingNotes(booking)));
  return fromNotes || null;
}

function resolveProvider(booking) {
  const md = bookingMetadata(booking);
  const direct = md.provider || md.doctor || md.doctor_name || md.practitioner;
  if (direct && String(direct).trim()) return String(direct).trim();
  const fromNotes = parseProviderFromNotes(bookingNotes(booking));
  if (fromNotes) return fromNotes;
  if (isSkinnonestBooking(booking)) return 'Vishw';
  return null;
}

function resolveConcern(booking) {
  const md = bookingMetadata(booking);
  const direct = md.concern || md.service || md.treatment || md.purpose;
  if (direct && String(direct).trim()) return String(direct).trim();
  const fromNotes = parseServiceFromNotes(bookingNotes(booking));
  if (fromNotes) return fromNotes;
  if (isSkinnonestBooking(booking)) return 'Skinnonest Makeup & Salon Partnership';
  return null;
}

function resolveInteractionId(booking) {
  const md = bookingMetadata(booking);
  const id = md.interaction_id || md.conversation_id || md.interactionId || md.conversationId || md.call_id;
  return id ? String(id) : null;
}

function resolveSource(booking) {
  const md = bookingMetadata(booking);
  const channel = String(md.channel || md.source_channel || '').toLowerCase();
  if (channel === 'ai_voice_agent') {
    const type = String(md.booking_type || md.bookingType || '').toLowerCase();
    return type === 'proposal_call' ? 'AI Call · Proposal' : 'AI Call';
  }
  const explicit = String((booking && booking.source) || '').toLowerCase();
  if (explicit === 'manual' || explicit === 'clinic') return 'Manual';

  // Older bookings did not carry metadata; their notes still record the
  // channel ("Proposal call requested via AI voice agent").
  const notes = bookingNotes(booking);
  if (/ai[\s_-]*voice[\s_-]*agent/i.test(notes)) {
    return /proposal/i.test(notes) ? 'AI Call · Proposal' : 'AI Call';
  }
  return 'Online Booking';
}

function resolveBookingCreatedAt(booking) {
  const b = booking || {};
  const raw = b.booking_created_at || b.createdAt || b.created_at || b.created;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function resolveBookingFields(booking) {
  return {
    metadata: bookingMetadata(booking),
    branch: resolveBranch(booking),
    provider: resolveProvider(booking),
    concern: resolveConcern(booking),
    source: resolveSource(booking),
    interactionId: resolveInteractionId(booking),
    bookingCreatedAt: resolveBookingCreatedAt(booking),
  };
}

module.exports = {
  VALID_BRANCHES,
  normalizeBranch,
  isValidBranch,
  parseBranchFromNotes,
  parseProviderFromNotes,
  parseServiceFromNotes,
  bookingMetadata,
  bookingNotes,
  resolveBranch,
  resolveProvider,
  resolveConcern,
  resolveSource,
  resolveInteractionId,
  resolveBookingCreatedAt,
  resolveBookingFields,
  isSkinnonestBooking,
};
