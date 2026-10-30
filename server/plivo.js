/**
 * Plivo Telephony Integration for Aura AI Clinic Dialer.
 * Handles real outbound telephony calls, status tracking, and call recording.
 */
const db = require('./db');

function getPlivoCredentials() {
  const authId = (process.env.PLIVO_AUTH_ID || 'MANZJKNMVLY2YTYWJIYY').trim();
  const authToken = (process.env.PLIVO_AUTH_TOKEN || 'YWQ0ZGZmZDktMjFjZi00Y2YzLTZmOWItOTg4MmNh').trim();
  const callerId = (process.env.PLIVO_CALLER_ID || process.env.PLIVO_PHONE_NUMBER || '+918065587555').trim();

  return {
    authId,
    authToken,
    callerId,
    fallbackNumber: (process.env.PLIVO_FALLBACK_NUMBER || '+918031731156').trim(),
    isConfigured: !!(authId && authToken && callerId),
  };
}

/**
 * Normalizes phone numbers to international E.164 format.
 * Defaults to Indian country code +91 if 10 digits are provided.
 */
function normalizeE164(phone, defaultCountryCode = '+91') {
  if (!phone) return null;
  const digits = String(phone).replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.length === 10) return `${defaultCountryCode}${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return `+${digits}`;
}

/**
 * Dispatches a real outbound voice call via Plivo REST API.
 */
async function dispatchPlivoCall({ to, from, conversationType = 'patient_consultation', doctor = 'Dr. Aditya Shah', branch = 'Alkapuri Main', hostUrl }) {
  const creds = getPlivoCredentials();
  if (!creds.isConfigured) {
    throw new Error('Plivo credentials not configured. Please set PLIVO_AUTH_ID, PLIVO_AUTH_TOKEN, and PLIVO_CALLER_ID.');
  }

  const destinationE164 = normalizeE164(to);
  const callerE164 = normalizeE164(from || creds.callerId);

  if (!destinationE164 || !/^\+[1-9]\d{7,14}$/.test(destinationE164)) {
    throw new Error(`Invalid destination phone number: ${to}`);
  }

  let cleanHost = (
    process.env.APP_BASE_URL ||
    (hostUrl && !hostUrl.includes('localhost') && !hostUrl.includes('127.0.0.1') ? hostUrl : null) ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    'https://aura-ai-six-beta.vercel.app'
  ).replace(/\/$/, '');

  if (!/^https?:\/\//i.test(cleanHost)) {
    cleanHost = `https://${cleanHost}`;
  }

  if (cleanHost.startsWith('http://') && !cleanHost.includes('localhost') && !cleanHost.includes('127.0.0.1')) {
    cleanHost = cleanHost.replace('http://', 'https://');
  }

  const answerUrl = `${cleanHost}/api/clinic/dialer/plivo/answer?type=${encodeURIComponent(conversationType)}&doctor=${encodeURIComponent(doctor)}&branch=${encodeURIComponent(branch)}`;
  const hangupUrl = `${cleanHost}/api/clinic/dialer/plivo/hangup`;

  const authHeader = `Basic ${Buffer.from(`${creds.authId}:${creds.authToken}`).toString('base64')}`;

  const payload = {
    from: callerE164,
    to: destinationE164,
    answer_url: answerUrl,
    answer_method: 'POST',
    hangup_url: hangupUrl,
    hangup_method: 'POST',
    time_limit: 900, // 15 min max
  };

  const response = await fetch(`https://api.plivo.com/v1/Account/${encodeURIComponent(creds.authId)}/Call/`, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data?.message || data?.error || `Plivo API error HTTP ${response.status}`;
    console.error('[Plivo Call Error]:', errorMsg, data);
    throw new Error(errorMsg);
  }

  return {
    success: true,
    callUuid: data.request_uuid || data.call_uuid,
    to: destinationE164,
    from: callerE164,
    raw: data,
  };
}

module.exports = {
  getPlivoCredentials,
  normalizeE164,
  dispatchPlivoCall,
};

