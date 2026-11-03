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

function bookingMetadata(booking) {
  const b = booking || {};
  const direct = b.metadata;
  if (direct && typeof direct === 'object') return direct;
  if (typeof direct === 'string' && direct.trim()) {
    try { return JSON.parse(direct); } catch { /* ignore */ }
  }
  const bfr = b.bookingFieldsResponses || {};
  for (const key of ['metadata', 'Metadata']) {
    const value = bfr[key];
    if (value && typeof value === 'object') return value;
    if (typeof value === 'string' && value.trim()) {
      try { return JSON.parse(value); } catch { /* ignore */ }
    }
  }
  return {};
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
  return parseProviderFromNotes(bookingNotes(booking)) || null;
}

function resolveConcern(booking) {
  const md = bookingMetadata(booking);
  const direct = md.concern || md.service || md.treatment || md.purpose;
  if (direct && String(direct).trim()) return String(direct).trim();
  return parseServiceFromNotes(bookingNotes(booking)) || null;
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
};
