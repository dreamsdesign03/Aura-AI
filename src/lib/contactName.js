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

/**
 * Get the best available display name for a contact
 * Priority: name_english > name_original > first_name + last_name > phone fallback
 */
export function getContactDisplayName(contact) {
  if (!contact) return 'Unknown Contact';
  
  // Priority 1: name_english (transliterated English name from AI calls)
  if (contact.name_english && contact.name_english !== 'Name Not Available') {
    return contact.name_english;
  }
  
  // Priority 2: name_original (original spoken name)
  if (contact.name_original && contact.name_original !== 'Name Not Available') {
    return contact.name_original;
  }
  
  // Priority 3: standard first_name + last_name
  if (contact.first_name || contact.last_name) {
    const name = [contact.first_name, contact.last_name].filter(Boolean).join(' ');
    if (name && name !== 'Name Not Available') {
      return name;
    }
  }
  
  // Priority 4: lead_name fields (from ai_calls)
  if (contact.lead_name_english && contact.lead_name_english !== 'Name Not Available') {
    return contact.lead_name_english;
  }
  if (contact.lead_name_original && contact.lead_name_original !== 'Name Not Available') {
    return contact.lead_name_original;
  }
  if (contact.lead_name && contact.lead_name !== 'Patient' && contact.lead_name !== 'Name Not Available') {
    return contact.lead_name;
  }
  
  // Priority 5: patient_name fields (from clinic_appointments)
  if (contact.patient_name_english && contact.patient_name_english !== 'Name Not Available') {
    return contact.patient_name_english;
  }
  if (contact.patient_name_original && contact.patient_name_original !== 'Name Not Available') {
    return contact.patient_name_original;
  }
  if (contact.patient_name && contact.patient_name !== 'Name Not Available') {
    return contact.patient_name;
  }
  
  // Priority 6: name_english from whatsapp_conversations
  if (contact.name_english && contact.name_english !== 'Name Not Available') {
    return contact.name_english;
  }
  
  // Priority 7: name from bulk_contacts
  if (contact.name_english && contact.name_english !== 'Name Not Available') {
    return contact.name_english;
  }
  if (contact.name && contact.name !== 'Name Not Available') {
    return contact.name;
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
  
  const parts = name.split(' ').filter(Boolean);
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