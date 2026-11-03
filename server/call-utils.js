// Shared helpers for outbound calling. Sarvam is the only voice provider.

function normalizePhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) {
    return { e164: `+91${digits}`, local: digits };
  } else if (digits.length === 12 && digits.startsWith('91')) {
    return { e164: `+${digits}`, local: digits.substring(2) };
  } else if (digits.length === 11 && digits.startsWith('0')) {
    const local = digits.substring(1);
    return { e164: `+91${local}`, local };
  }
  return null;
}

function isCallingHours() {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  });
  const parts = formatter.formatToParts(new Date());
  const hour = parseInt(parts.find(p => p.type === 'hour').value, 10);
  const minute = parseInt(parts.find(p => p.type === 'minute').value, 10);

  const timeNum = hour + minute / 60;
  // Single source of truth: CALL_START / CALL_END env vars (default 10:00 – 19:00)
  function parseHHMM(str, dflt) {
    const m = String(str || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return dflt;
    return parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
  }
  const callStart = parseHHMM(process.env.CALL_START, 10);
  const callEnd   = parseHHMM(process.env.CALL_END, 19);
  return timeNum >= callStart && timeNum <= callEnd;
}

function canCall(lead, isScheduled = false) {
  const phoneObj = normalizePhone(lead.phone || lead.whatsapp);
  if (!phoneObj) return { ok: false, reason: "No valid 10-digit Indian phone number" };
  if (lead.do_not_call) return { ok: false, reason: "Lead opted out (do_not_call=true)" };

  if (!isScheduled && !isCallingHours()) {
    return { ok: false, reason: "Outside calling hours (10:00-19:30 IST)" };
  }

  const allowlist = process.env.CALL_TEST_ALLOWLIST;
  if (allowlist) {
    const allowedNumbers = allowlist.split(',').map(n => n.trim());
    if (!allowedNumbers.includes(phoneObj.local)) {
      return { ok: false, reason: "Number not in CALL_TEST_ALLOWLIST" };
    }
  }

  return { ok: true, reason: null, e164: phoneObj.e164 };
}

const gujMap = {
  'ક': 'k', 'ખ': 'kh', 'ગ': 'g', 'ઘ': 'gh', 'ઙ': 'ng',
  'ચ': 'ch', 'છ': 'chh', 'જ': 'j', 'ઝ': 'z', 'ઞ': 'ny',
  'ટ': 't', 'ઠ': 'th', 'ડ': 'd', 'ઢ': 'dh', 'ણ': 'n',
  'ત': 't', 'થ': 'th', 'દ': 'd', 'ધ': 'dh', 'ન': 'n',
  'પ': 'p', 'ફ': 'f', 'બ': 'b', 'ભ': 'bh', 'મ': 'm',
  'ય': 'y', 'ર': 'r', 'લ': 'l', 'ળ': 'l', 'વ': 'v',
  'શ': 'sh', 'ષ': 'sh', 'સ': 's', 'હ': 'h',
  'અ': 'a', 'આ': 'aa', 'ઇ': 'i', 'ઈ': 'ee', 'ઉ': 'u', 'ઊ': 'oo',
  'ઋ': 'ri', 'એ': 'e', 'ઐ': 'ai', 'ઓ': 'o', 'ઔ': 'au',
  'ા': 'a', 'િ': 'i', 'ી': 'ee', 'ુ': 'u', 'ૂ': 'oo', 'ૃ': 'ri',
  'ે': 'e', 'ૈ': 'ai', 'ો': 'o', 'ૌ': 'au', 'ં': 'n', 'ઁ': 'n', 'ઃ': 'h'
};

const devMap = {
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'ng',
  'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'z', 'ञ': 'ny',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
  'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'f', 'ब': 'b', 'भ': 'bh', 'म': 'm',
  'य': 'y', 'र': 'r', 'ल': 'l', 'ळ': 'l', 'व': 'v',
  'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h',
  'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo',
  'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au',
  'ा': 'a', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri',
  'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ं': 'n', 'ँ': 'n', 'ः': 'h'
};

const translitMap = { ...gujMap, ...devMap };
const consonants = new Set([
  'ક','ખ','ગ','ઘ','ઙ','ચ','છ','જ','ઝ','ઞ','ટ','ઠ','ડ','ઢ','ણ','ત','થ','દ','ધ','ન','પ','ફ','બ','ભ','મ','ય','ર','લ','ળ','વ','શ','ષ','સ','હ',
  'क','ख','ग','घ','ङ','च','छ','ज','झ','ञ','ट','ठ','ड','ढ','ण','त','थ','द','ध','न','प','फ','ब','भ','म','य','र','ल','ळ','व','श','ष','स','ह'
]);
const matras = new Set([
  'ા','િ','ી','ુ','ૂ','ૃ','ે','ૈ','ો','ૌ','ં','ઁ','ઃ',
  'ा','ि','ी','ु','ू','ृ','े','ै','ो','ौ','ं','ँ','ः'
]);
const viramas = new Set(['્', '्']);

function transliterateIndic(str) {
  if (!str) return '';
  const overrides = {
    'શ્રી': 'Shree', 'श्री': 'Shree',
    'કૃષ્ણ': 'Krishna', 'कृष्ण': 'Krishna',
    'જય': 'Jay', 'जय': 'Jay',
    'ગણેશ': 'Ganesh', 'गणेश': 'Ganesh',
  };
  for (const [k, v] of Object.entries(overrides)) {
    str = str.replace(new RegExp(k, 'g'), v);
  }
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const next = str[i + 1];
    if (consonants.has(ch)) {
      out += translitMap[ch] || '';
      if (viramas.has(next)) {
        i++;
      } else if (matras.has(next)) {
        // Matra supplies vowel
      } else if (next && consonants.has(next)) {
        out += 'a';
      }
    } else if (translitMap[ch]) {
      out += translitMap[ch];
    } else if (viramas.has(ch)) {
      // ignore
    } else {
      out += ch;
    }
  }
  return out;
}

const KNOWN_NAME_MAPPINGS = {
  'غوشیہ': 'Ghousia',
  'غوثیہ': 'Ghousia',
  'محمد': 'Mohammed',
  'علی': 'Ali',
  'احمد': 'Ahmed',
  'فاطمہ': 'Fatima',
  'عائشہ': 'Ayesha',
  'زينب': 'Zainab',
};

function cleanEnglishName(raw, fallback = 'Patient') {
  if (!raw) return fallback;
  let str = String(raw).trim();
  if (!str) return fallback;

  if (/sweetubrahmbhatt/i.test(str)) {
    return 'Sweetu Brahmbhatt';
  }
  if (/shivamsinha/i.test(str)) {
    return 'Shivam Sinha';
  }

  for (const [k, v] of Object.entries(KNOWN_NAME_MAPPINGS)) {
    if (str.includes(k)) {
      str = str.replace(new RegExp(k, 'g'), v);
    }
  }

  // Transliterate Indic scripts (Gujarati, Devanagari) into Latin
  str = transliterateIndic(str);

  str = str.replace(/[\p{Extended_Pictographic}\uFE0F\u200D\u200B\u2060]/gu, '');
  str = str.replace(/[♡❤️🖤★☆✨🌸🌼🏵️🌻🦄🪬💣🕊️😇🎀😍🌿💫🍰~_#@!?*•|\\/益]/g, ' ');
  str = str.replace(/\bDr\.([a-zA-Z])/gi, 'Dr. $1');
  str = str.replace(/([a-zA-Z])\d{3,}$/g, '$1');
  str = str.replace(/([a-z])([A-Z][a-z])/g, '$1 $2');
  str = str.replace(/^[.\s\-–—,]+|[.\s\-–—,]+$/g, '').replace(/\s+/g, ' ').trim();

  // If digits only (e.g. phone number as name), return fallback
  if (/^\+?\d{7,}$/.test(str.replace(/\s+/g, ''))) {
    return fallback;
  }

  const hasLatin = /[a-zA-Z]/.test(str);
  if (!hasLatin) {
    return fallback;
  }

  str = str.replace(/[^\x20-\x7E]/g, '').trim();
  str = str.replace(/^[.\s\-–—,]+|[.\s\-–—,]+$/g, '').trim();

  if (!str || str.length < 2) return fallback;

  return str.split(' ').map(w => {
    if (!w) return '';
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(' ').trim();
}

function cleanEnglishTreatment(raw, fallback = 'Clinic Consultation') {
  if (!raw) return fallback;
  let str = String(raw).trim();
  if (!str) return fallback;

  // Cal.com boilerplate: "Aura Consultation between Aura Laser & Cosmetic Clinic | Skinnonest and ..."
  if (/between\s+.*?(?:and\s+.*)?/i.test(str)) {
    const prefixMatch = str.match(/^(.*?)\s+between\s+/i);
    if (prefixMatch && prefixMatch[1] && prefixMatch[1].length > 3) {
      str = prefixMatch[1].trim();
    } else {
      str = 'Clinic Consultation';
    }
  }

  str = transliterateIndic(str);
  str = str.replace(/[\p{Extended_Pictographic}\uFE0F\u200D\u200B\u2060]/gu, '');
  str = str.replace(/[♡❤️🖤★☆✨🌸🌼🏵️🌻🦄🪬💣🕊️😇🎀😍🌿💫🍰~_#@!?*•|\\/益]/g, ' ');
  str = str.replace(/^[.\s\-–—,]+|[.\s\-–—,]+$/g, '').replace(/\s+/g, ' ').trim();
  str = str.replace(/[^\x20-\x7E]/g, '').trim();

  if (!str || str.length < 2) return fallback;
  return str;
}

module.exports = { normalizePhone, isCallingHours, canCall, cleanEnglishName, cleanEnglishTreatment, transliterateIndic };
