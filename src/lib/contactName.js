/**
 * Contact name helpers shared by patient, lead and conversation views.
 * Prefer a real English contact name; otherwise show the phone number.
 */
export function toTitleCase(str) {
  if (!str) return '';
  return String(str).trim().split(/\s+/).filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}
function normalizeDisplayName(value) {
  return String(value || '').trim().replace(/\s+patients?\s*$/i, '').replace(/\s+/g, ' ').trim();
}
function isCleanName(value) {
  const s = normalizeDisplayName(value);
  if (!s || /^[.\-—]+$/.test(s)) return false;
  if (/^(?:unknown(?:\s+contact|\s+caller)?|unnamed(?:\s+patient)?|patient(?:\s+\d+)?|busy\s+for\s+.*|no\s+answer|not\s+answered|failed|voicemail|inbound\s+caller|patient\s+consultation\s+call)$/i.test(s)) return false;
  if (/[\u0900-\u097F]/.test(s)) return false;
  return true;
}
export function getContactDisplayName(contact) {
  if (!contact) return 'Unknown Contact';
  const candidates = [contact.display_name, contact.name_english,
    [contact.first_name, contact.last_name].filter(Boolean).join(' '),
    contact.lead_name_english, contact.lead_name, contact.patient_name_english,
    contact.patient_name, contact.name];
  for (const candidate of candidates) if (isCleanName(candidate)) return normalizeDisplayName(candidate);
  const phone = contact.phone || contact.phone10 || contact.phone_e164 || contact.to_phone || contact.from_phone || contact.whatsapp || contact.lead_phone;
  return phone ? formatPhoneForDisplay(phone) : 'Unknown Contact';
}
export function formatPhoneForDisplay(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) return `+91 ${digits.slice(0,5)} ${digits.slice(5)}`;
  if (digits.length === 12 && digits.startsWith('91')) {
    const local = digits.slice(2); return `+91 ${local.slice(0,5)} ${local.slice(5)}`;
  }
  return String(phone);
}
export function getContactInitials(contact) {
  const name = getContactDisplayName(contact);
  if (!name || name === 'Unknown Contact' || /^\+?[\d\s-]+$/.test(name)) return '?';
  const parts = name.replace(/^[^a-zA-Z0-9]+/, '').split(/\s+/).filter(Boolean);
  return parts.length > 1 ? (parts[0][0] + parts.at(-1)[0]).toUpperCase() : (parts[0]?.[0] || '?').toUpperCase();
}
export function hasValidName(contact) {
  const name = getContactDisplayName(contact);
  return name !== 'Unknown Contact' && !/^\+?[\d\s-]+$/.test(name);
}
