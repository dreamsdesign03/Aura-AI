/**
 * Contact Name Helper - Client-side utilities for displaying contact names
 * Mirrors the server-side logic for consistent name display
 */

/**
 * Format a name to Title Case
 */
export function toTitleCase(str) {
  if (!str) return '';
  return str
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function normalizeDisplayName(val) {
  return String(val || '').trim().replace(/\\s+patients?\\s*$/i, '').replace(/\\s+/g, ' ').trim();
}

function isCleanName(val) {
  if (!val) return false;
  const s = normalizeDisplayName(val);
  if (!s || s === '.' || s === '-' || s === '—' || s === 'Name Not Available' || s === 'Unknown' || /^patient(?:\\s+\\d+)?$/i.test(s)) return false;
  // Do not expose source-script Hindi names in English-only patient/contact lists.
  if (/[\\u0900-\\u097F]/.test(s)) return false;
  return true;
}

/**
 * Get the best available display name for a contact
 * Priority: display_name > name_english > name_original > first_name + last_name > lead_name > patient_name > phone fallback
 */
export function getContactDisplayName(contact) {
  if (!contact) return 'Unknown Contact';

  // Priority 0: display_name (explicitly computed clean name from backend APIs)
  if (isCleanName(contact.display_name)) {
    return normalizeDisplayName(contact.display_name);
  }
  
  // Priority 1: name_english (transliterated English name from AI calls)
  if (isCleanName(contact.name_english)) {
    return normalizeDisplayName(contact.name_english);
  }
  
  // Priority 2: name_original (original spoken name)
  if (isCleanName(contact.name_original)) {
    return normalizeDisplayName(contact.name_original);
  }
  
  // Priority 3: standard first_name + last_name
  if (contact.first_name || contact.last_name) {
    const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim();
    if (isCleanName(fullName)) {
      return normalizeDisplayName(fullName);
    }
  }
  
  // Priority 4: lead_name fields (from ai_calls)
  if (isCleanName(contact.lead_name_english)) {
    return normalizeDisplayName(contact.lead_name_english);
  }
  if (isCleanName(contact.lead_name_original)) {
    return normalizeDisplayName(contact.lead_name_original);
  }
  if (isCleanName(contact.lead_name)) {
    return normalizeDisplayName(contact.lead_name);
  }
  
  // Priority 5: patient_name fields (from clinic_appointments)
  if (isCleanName(contact.patient_name_english)) {
    return normalizeDisplayName(contact.patient_name_english);
  }
  if (isCleanName(contact.patient_name_original)) {
    return normalizeDisplayName(contact.patient_name_original);
  }
  if (isCleanName(contact.patient_name)) {
    return normalizeDisplayName(contact.patient_name);
  }
  
  // Priority 6: name from bulk_contacts
  if (isCleanName(contact.name)) {
    return normalizeDisplayName(contact.name);
  }
  
  // Fallback: phone number
  const phone = contact.phone || contact.phone10 || contact.phone_e164 || contact.to_phone || contact.whatsapp || contact.lead_phone;
  if (phone) {
    return formatPhoneForDisplay(phone);
  }
  
  return 'Unknown Contact';
}

/**
 * Format phone number for display
 */
export function formatPhoneForDisplay(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) {
    return `+91 ${digits.slice(0,5)} ${digits.slice(5)}`;
  } else if (digits.length === 12 && digits.startsWith('91')) {
    const local = digits.slice(2);
    return `+91 ${local.slice(0,5)} ${local.slice(5)}`;
  }
  return phone;
}

/**
 * Get contact initials for avatar
 */
export function getContactInitials(contact) {
  const name = getContactDisplayName(contact);
  if (!name || name === 'Unknown Contact') return '?';
  
  const clean = name.replace(/^[^a-zA-Z0-9]+/, '');
  if (!clean) return '?';

  const parts = clean.split(' ').filter(Boolean);
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * Check if a contact has a valid name (not fallback)
 */
export function hasValidName(contact) {
  const name = getContactDisplayName(contact);
  return name !== 'Unknown Contact' && 
         !/^\+?\d+$/.test(name) && 
         name !== 'Name Not Available' &&
         name !== 'Patient' &&
         name !== 'Unknown Contact';
}