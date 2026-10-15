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

module.exports = { normalizePhone, isCallingHours, canCall };
