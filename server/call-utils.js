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
  return timeNum >= 10 && timeNum <= 19.5; // 10:00 to 19:30
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

  str = str.replace(/[\p{Extended_Pictographic}\uFE0F\u200D\u200B\u2060]/gu, '');
  str = str.replace(/[♡❤️🖤★☆✨🌸🌼🏵️🌻🦄🪬💣🕊️😇🎀😍🌿💫🍰~_#@!?*•|\\/]/g, ' ');
  str = str.replace(/\bDr\.([a-zA-Z])/gi, 'Dr. $1');
  str = str.replace(/([a-zA-Z])\d{3,}$/g, '$1');
  str = str.replace(/([a-z])([A-Z])/g, '$1 $2');
  str = str.replace(/^[.\s\-–—,]+|[.\s\-–—,]+$/g, '').replace(/\s+/g, ' ').trim();

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

module.exports = { normalizePhone, isCallingHours, canCall, cleanEnglishName };
