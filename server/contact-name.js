/**
 * Contact Name Helper - Shared module for normalizing and transliterating contact names
 * from AI voice calls, webhooks, and other sources.
 * 
 * Usage:
 *   const { normalizeName, toEnglishName, shouldOverwrite, updateContactName } = require('./contact-name');
 */

const db = require('./db');

// Re-export existing utilities
const { cleanEnglishName, transliterateIndic } = require('./call-utils');

/**
 * In-memory cache for transliteration results
 */
const transliterationCache = new Map();

/**
 * LLM-based transliteration to English (Latin script)
 * Uses the existing GEMINI_API_KEY from environment
 */
async function llmTransliterate(name) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[contactName] GEMINI_API_KEY not set, falling back to rule-based transliteration');
    return null;
  }

  try {
    const prompt = `Transliterate this person's name to English letters. Output only the name in Title Case, nothing else.\n\nName: "${name}"`;
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, responseMimeType: 'application/json' }
        })
      }
    );

    if (!response.ok) {
      console.warn('[contactName] LLM transliteration failed:', response.status);
      return null;
    }

    const data = await response.json();
    const result = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    
    if (result && /^[A-Za-z\s.'-]+$/.test(result)) {
      return result;
    }
    return null;
  } catch (err) {
    console.warn('[contactName] LLM transliteration error:', err.message);
    return null;
  }
}

/**
 * Rule-based transliteration fallback (uses existing transliterateIndic)
 */
function ruleBasedTransliterate(name) {
  // First check if it's already Latin script
  if (/^[A-Za-z\s.'-]+$/.test(name)) {
    return toTitleCase(name);
  }
  
  // Use existing transliteration for Indic scripts
  const transliterated = transliterateIndic(name);
  if (transliterated && /^[A-Za-z\s.'-]+$/.test(transliterated)) {
    return toTitleCase(transliterated);
  }
  
  // For Arabic/Urdu/other scripts, return null (will be handled by LLM if available)
  return null;
}

/**
 * Convert string to Title Case
 */
function toTitleCase(str) {
  return str
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Check if string contains non-Latin characters
 */
function hasNonLatinChars(str) {
  return /[^\x20-\x7E]/.test(str);
}

/**
 * Normalize a raw name from voice agent / webhook
 * - Trims whitespace
 * - Removes titles/noise ("my name is", "mera naam", "Mr/Mrs")
 * - Strips digits/punctuation
 * - Returns null if empty, phone-number-like, or placeholder
 */
function normalizeName(raw) {
  if (!raw) return null;
  
  let str = String(raw).trim();
  if (!str) return null;

  // Check for placeholder values BEFORE normalization (to catch "N/A" etc.)
  const lowerRaw = str.toLowerCase();
  const earlyPlaceholders = ['n/a', 'na', 'name not available', 'not available', 'unknown', 'lead', 'test patient', 'patient', 'contact'];
  if (earlyPlaceholders.includes(lowerRaw)) return null;

  // Remove common intro phrases from voice agents
  const introPatterns = [
    /^(my name is|mera naam|mera nam|name is|this is|i am|main)\s+/i,
    /^(mr\.?|mrs\.?|ms\.?|dr\.?|prof\.?)\s+/i,
  ];
  for (const pattern of introPatterns) {
    str = str.replace(pattern, '');
  }

  // Strip digits, punctuation, and decorative symbols
  str = str
    .replace(/[\d]/g, '')                    // Remove digits
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D\u200B\u2060]/gu, '') // Emojis
    .replace(/[♡❤️🖤★☆✨🌸🌼🏵️🌻🦄🪬💣🕊️😇🎀😍🌿💫🍰~_#@!?*•|\\/益]/g, ' ') // Decorative
    .replace(/[^\p{L}\p{M}\p{N}\s.'-]/gu, ' ') // Keep letters, marks, numbers, spaces, apostrophes, hyphens
    .replace(/\s+/g, ' ')                    // Collapse whitespace
    .trim();

  if (!str) return null;

  // If it looks like a phone number (7+ digits), reject
  const digitCount = (str.match(/\d/g) || []).length;
  if (digitCount >= 7) return null;

  // Check for placeholder values that should be ignored (after normalization)
  const placeholders = [
    'name not available',
    'name unavailable',
    'not available',
    'unknown',
    'lead',
    'test patient',
    'patient',
    'contact',
    'n/a',
    'na',
  ];
  const lower = str.toLowerCase();
  if (placeholders.includes(lower)) return null;

  // If after cleaning it's too short, reject
  if (str.length < 2) return null;

  return str;
}

/**
 * Convert normalized name to English (Latin script)
 * - If already Latin -> Title Case
 * - If non-Latin -> try LLM transliteration, fallback to rule-based
 * - Caches results in memory
 */
async function toEnglishName(raw) {
  if (!raw) return null;
  
  const normalized = normalizeName(raw);
  if (!normalized) return null;

  // Check cache first
  if (transliterationCache.has(normalized)) {
    return transliterationCache.get(normalized);
  }

  // If already Latin script, just Title Case
  if (!hasNonLatinChars(normalized)) {
    const result = toTitleCase(normalized);
    transliterationCache.set(normalized, result);
    return result;
  }

  // Try LLM transliteration first
  let result = await llmTransliterate(normalized);
  
  // Fallback to rule-based
  if (!result) {
    result = ruleBasedTransliterate(normalized);
  }

  // If still no result, return null (don't use fallback)
  if (!result) {
    return null;
  }

  transliterationCache.set(normalized, result);
  return result;
}

/**
 * Determine if we should overwrite the current name
 * - true if current is empty, null, "Name Not Available", phone-like, or placeholder
 * - false if name_source is 'manual' or name_locked is true
 */
function shouldOverwrite(currentName, nameSource, nameLocked) {
  // Never overwrite if locked or manually entered
  if (nameLocked) return false;
  if (nameSource === 'manual') return false;

  if (!currentName) return true;
  
  const str = String(currentName).trim();
  if (!str) return true;

  // Check for placeholder values
  const placeholders = [
    'name not available',
    'name unavailable',
    'not available',
    'unknown',
    'lead',
    'test patient',
    'patient',
    'contact',
    'n/a',
    'na',
  ];
  if (placeholders.includes(str.toLowerCase())) return true;

  // If it looks like a phone number
  const digits = str.replace(/\D/g, '');
  if (digits.length >= 10) return true;

  // If it's just digits
  if (/^\+?\d+$/.test(str)) return true;

  return false;
}

/**
 * Extract last 10 digits from phone for matching
 */
function phoneLast10(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/**
 * Update contact name across all tables by matching phone (last 10 digits)
 * Updates: bulk_contacts, leads, patients, whatsapp_conversations, clinic_appointments, ai_calls, bulk_attempts
 * Creates lead/patient row if none exists for the phone
 * 
 * @param {Object} params
 * @param {string} params.phone - Phone number (any format)
 * @param {string} params.rawName - Raw name from voice agent/webhook
 * @param {string} [params.nameSource='call'] - Source of the name ('call' | 'import' | 'manual')
 * @returns {Object} Result with updated tables and the English name used
 */
async function updateContactName({ phone, rawName, nameSource = 'call' }) {
  const last10 = phoneLast10(phone);
  if (!last10 || last10.length < 10) {
    return { success: false, error: 'Invalid phone number' };
  }

  const englishName = await toEnglishName(rawName);
  if (!englishName) {
    return { success: false, error: 'Could not derive valid English name' };
  }

  const results = { updated: [], englishName, originalName: rawName };

  try {
    // Start transaction
    await db.query('BEGIN');

    // 1. Find or create lead by phone
    let leadId = null;
    const leadRes = await db.query(
      `SELECT id, first_name, last_name, name_source, name_locked 
       FROM leads 
       WHERE REPLACE(REPLACE(REPLACE(COALESCE(phone,''), '+', ''), '-', ''), ' ', '') LIKE '%' || $1
          OR REPLACE(REPLACE(REPLACE(COALESCE(whatsapp,''), '+', ''), '-', ''), ' ', '') LIKE '%' || $1
       ORDER BY id DESC LIMIT 1`,
      [last10]
    );

    if (leadRes.rows.length > 0) {
      const lead = leadRes.rows[0];
      leadId = lead.id;
      
      if (shouldOverwrite(
        lead.first_name + ' ' + lead.last_name, 
        lead.name_source, 
        lead.name_locked
      )) {
        await db.query(
          `UPDATE leads SET 
            first_name = $1, 
            last_name = $2, 
            name_original = $3, 
            name_english = $4, 
            name_source = $5,
            updated_at = NOW()
           WHERE id = $6`,
          [englishName.split(' ')[0], englishName.split(' ').slice(1).join(' '), rawName, englishName, nameSource, leadId]
        );
        results.updated.push('leads');
      }
    } else {
      // Create new lead
      const parts = englishName.split(' ');
      const firstName = parts[0];
      const lastName = parts.slice(1).join(' ');
      
      const newLead = await db.query(
        `INSERT INTO leads (first_name, last_name, phone, name_original, name_english, name_source, status, pipeline_stage, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'New', 'Lead In', NOW(), NOW())
         RETURNING id`,
        [firstName, lastName, phone, rawName, englishName, nameSource]
      );
      leadId = newLead.rows[0].id;
      results.updated.push('leads (created)');
    }

    // 2. Update bulk_contacts
    const bulkContactRes = await db.query(
      `UPDATE bulk_contacts 
       SET name = $1, name_original = $2, name_english = $3, name_source = $4,
           lead_id = COALESCE(lead_id, $6)
       WHERE phone10 = $5 OR phone_e164 LIKE '%' || $5
       RETURNING id`,
      [englishName, rawName, englishName, nameSource, last10, leadId]
    );
    if (bulkContactRes.rowCount > 0) {
      results.updated.push('bulk_contacts');
    }

    // 3. Update whatsapp_conversations
    const waConvRes = await db.query(
      `UPDATE whatsapp_conversations 
       SET phone = $1, wa_phone_number = $1
       WHERE phone LIKE $2 OR wa_phone_number LIKE $2
       RETURNING id`,
      [phone, `%${last10}%`]
    );
    if (waConvRes.rowCount > 0) {
      results.updated.push('whatsapp_conversations');
    }

    // 4. Update clinic_appointments
    const apptRes = await db.query(
      `UPDATE clinic_appointments 
       SET patient_name = $1, patient_name_original = $2, patient_name_english = $3, patient_name_source = $4
       WHERE phone LIKE $5
       RETURNING id`,
      [englishName, rawName, englishName, nameSource, `%${last10}%`]
    );
    if (apptRes.rowCount > 0) {
      results.updated.push('clinic_appointments');
    }

    // 5. Update ai_calls
    const aiCallRes = await db.query(
      `UPDATE ai_calls 
       SET lead_name = $1, lead_name_original = $2, lead_name_english = $3, lead_name_source = $4
       WHERE to_phone LIKE $5 OR from_phone LIKE $5
       RETURNING id`,
      [englishName, rawName, englishName, nameSource, `%${last10}%`]
    );
    if (aiCallRes.rowCount > 0) {
      results.updated.push('ai_calls');
    }

    // 6. Update bulk_attempts (via contact)
    if (bulkContactRes.rowCount > 0) {
      await db.query(
        `UPDATE bulk_attempts 
         SET lead_name = $1, lead_name_original = $2, lead_name_english = $3, lead_name_source = $4
         WHERE contact_id IN (SELECT id FROM bulk_contacts WHERE phone10 = $5)`,
        [englishName, rawName, englishName, nameSource, last10]
      );
      results.updated.push('bulk_attempts');
    }

    // 7. Update whatsapp_messages (phone field)
    const waMsgRes = await db.query(
      `UPDATE whatsapp_messages 
       SET phone = $1
       WHERE phone LIKE $2
       RETURNING id`,
      [phone, `%${last10}%`]
    );
    if (waMsgRes.rowCount > 0) {
      results.updated.push('whatsapp_messages');
    }

    await db.query('COMMIT');

    return { success: true, ...results };

  } catch (err) {
    await db.query('ROLLBACK');
    console.error('[contactName] updateContactName error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Backfill existing contacts where name is missing but call logs have lead_name
 */
async function backfillContactNames() {
  const results = { processed: 0, updated: 0, errors: [] };

  try {
    // Find bulk_contacts with missing names but have call data
    const contacts = await db.query(`
      SELECT bc.id, bc.phone10, bc.name, bc.name_english,
             ba.lead_name, ba.lead_name_original, ba.lead_name_source
      FROM bulk_contacts bc
      LEFT JOIN bulk_attempts ba ON ba.contact_id = bc.id
      WHERE (bc.name IS NULL OR bc.name ILIKE 'name not available' OR bc.name = '')
        AND ba.lead_name IS NOT NULL
        AND ba.lead_name NOT ILIKE 'name not available'
        AND ba.lead_name NOT ILIKE 'unknown'
      GROUP BY bc.id, bc.phone10, bc.name, bc.name_english, ba.lead_name, ba.lead_name_original, ba.lead_name_source
    `);

    for (const contact of contacts.rows) {
      const rawName = contact.lead_name_original || contact.lead_name;
      const nameSource = contact.lead_name_source || 'call';
      
      const result = await updateContactName({
        phone: contact.phone10,
        rawName,
        nameSource
      });
      
      if (result.success) {
        results.updated++;
      } else {
        results.errors.push({ phone: contact.phone10, error: result.error });
      }
      results.processed++;
    }

    // Also check leads table for missing names with call data
    const leads = await db.query(`
      SELECT l.id, l.phone, l.first_name, l.last_name, l.name_english,
             ac.lead_name, ac.lead_name_original, ac.lead_name_source
      FROM leads l
      LEFT JOIN ai_calls ac ON ac.lead_id = l.id
      WHERE (l.first_name IS NULL OR l.first_name ILIKE 'name not available' OR l.first_name = '')
        AND ac.lead_name IS NOT NULL
        AND ac.lead_name NOT ILIKE 'name not available'
        AND ac.lead_name NOT ILIKE 'unknown'
      GROUP BY l.id, l.phone, l.first_name, l.last_name, l.name_english, ac.lead_name, ac.lead_name_original, ac.lead_name_source
    `);

    for (const lead of leads.rows) {
      const rawName = lead.lead_name_original || lead.lead_name;
      const nameSource = lead.lead_name_source || 'call';
      
      const result = await updateContactName({
        phone: lead.phone,
        rawName,
        nameSource
      });
      
      if (result.success) {
        results.updated++;
      } else {
        results.errors.push({ phone: lead.phone, error: result.error });
      }
      results.processed++;
    }

  } catch (err) {
    console.error('[contactName] backfillContactNames error:', err.message);
    results.errors.push({ error: err.message });
  }

  return results;
}

module.exports = {
  normalizeName,
  toEnglishName,
  shouldOverwrite,
  phoneLast10,
  updateContactName,
  backfillContactNames,
  // Re-export existing utilities
  cleanEnglishName,
  transliterateIndic,
  toTitleCase,
};