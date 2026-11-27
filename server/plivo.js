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

/**
 * Ensures a Plivo Application + SIP Endpoint exist for browser WebRTC two-way calling.
 * Persists credentials in PostgreSQL so they survive serverless cold starts.
 */
async function ensurePlivoWebrtcSetup(hostUrl, { forceRefresh = false } = {}) {
  const creds = getPlivoCredentials();
  if (!creds.isConfigured) {
    throw new Error('Plivo credentials not configured.');
  }

  let cleanHost = (
    process.env.APP_BASE_URL ||
    (hostUrl && !hostUrl.includes('localhost') && !hostUrl.includes('127.0.0.1') ? hostUrl : null) ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    'https://aura-ai-six-beta.vercel.app'
  ).replace(/\/$/, '');
  if (!/^https?:\/\//i.test(cleanHost)) cleanHost = `https://${cleanHost}`;
  if (cleanHost.startsWith('http://') && !cleanHost.includes('localhost') && !cleanHost.includes('127.0.0.1')) {
    cleanHost = cleanHost.replace('http://', 'https://');
  }

  const answerUrl = `${cleanHost}/api/clinic/dialer/plivo/webrtc-answer`;
  const hangupUrl = `${cleanHost}/api/clinic/dialer/plivo/hangup`;

  if (!forceRefresh && process.env.PLIVO_ENDPOINT_USERNAME && process.env.PLIVO_ENDPOINT_PASSWORD) {
    return {
      username: process.env.PLIVO_ENDPOINT_USERNAME.trim(),
      password: process.env.PLIVO_ENDPOINT_PASSWORD.trim(),
      appId: (process.env.PLIVO_APP_ID || '').trim(),
      callerId: normalizeE164(creds.callerId),
    };
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS clinic_dialer_webrtc (
      id INT PRIMARY KEY DEFAULT 1,
      app_id TEXT,
      endpoint_id TEXT,
      username TEXT NOT NULL,
      password TEXT NOT NULL,
      answer_url TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.query(`ALTER TABLE clinic_dialer_webrtc ADD COLUMN IF NOT EXISTS endpoint_id TEXT`).catch(() => {});

  const existing = await db.query('SELECT * FROM clinic_dialer_webrtc WHERE id = 1');
  const row = existing.rows[0];
  const authHeader = `Basic ${Buffer.from(`${creds.authId}:${creds.authToken}`).toString('base64')}`;
  const apiBase = `https://api.plivo.com/v1/Account/${encodeURIComponent(creds.authId)}`;

  let cachedEndpointValid = false;
  if (!forceRefresh && row && row.username && row.password && row.app_id) {
    try {
      if (row.endpoint_id) {
        const epCheck = await fetch(`${apiBase}/Endpoint/${encodeURIComponent(row.endpoint_id)}/`, {
          headers: { Authorization: authHeader },
        });
        cachedEndpointValid = epCheck.ok;
      } else {
        const epListRes = await fetch(`${apiBase}/Endpoint/?limit=20`, {
          headers: { Authorization: authHeader },
        });
        if (epListRes.ok) {
          const epList = await epListRes.json().catch(() => ({}));
          const found = (epList.objects || []).find((e) => e.username === row.username);
          if (found) {
            cachedEndpointValid = true;
            await db.query('UPDATE clinic_dialer_webrtc SET endpoint_id = $1 WHERE id = 1', [found.endpoint_id]).catch(() => {});
          }
        }
      }
    } catch {
      cachedEndpointValid = false;
    }
  }

  if (!forceRefresh && cachedEndpointValid && row.answer_url === answerUrl) {
    return {
      username: row.username,
      password: row.password,
      appId: row.app_id,
      callerId: normalizeE164(creds.callerId),
    };
  }

  // 1. Verify, update, or create Plivo Application for WebRTC Dialer
  let appId = row?.app_id || '';
  if (appId) {
    const appCheck = await fetch(`${apiBase}/Application/${encodeURIComponent(appId)}/`, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer_url: answerUrl, answer_method: 'POST', hangup_url: hangupUrl, hangup_method: 'POST' }),
    }).catch(() => null);
    if (!appCheck || !appCheck.ok) {
      appId = '';
    }
  }
  if (!appId) {
    const appRes = await fetch(`${apiBase}/Application/`, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_name: `Aura_Clinic_WebRTC_Dialer_${Date.now()}`,
        answer_url: answerUrl,
        answer_method: 'POST',
        hangup_url: hangupUrl,
        hangup_method: 'POST',
      }),
    });
    const appData = await appRes.json().catch(() => ({}));
    if (!appRes.ok || !appData.app_id) {
      throw new Error(typeof appData?.error === 'string' ? appData.error : JSON.stringify(appData?.error || appData?.message || 'Failed to create Plivo WebRTC application'));
    }
    appId = appData.app_id;
  }

  // 2. Create SIP Endpoint if missing, invalid, or force-refreshed
  let username = cachedEndpointValid ? row.username : '';
  let password = cachedEndpointValid ? row.password : '';
  let endpointId = cachedEndpointValid ? (row.endpoint_id || '') : '';

  if (!username || !password) {
    if (forceRefresh && row?.endpoint_id) {
      await fetch(`${apiBase}/Endpoint/${encodeURIComponent(row.endpoint_id)}/`, {
        method: 'DELETE',
        headers: { Authorization: authHeader },
      }).catch(() => {});
    }
    const suffix = Math.random().toString(36).slice(2, 8);
    const desiredUsername = `auraclinic${suffix}`;
    password = `Aura${Math.random().toString(36).slice(2, 10)}9A`;
    const epRes = await fetch(`${apiBase}/Endpoint/`, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: desiredUsername,
        password,
        alias: 'Aura_Clinic_Browser_Dialer',
        app_id: appId,
      }),
    });
    const epData = await epRes.json().catch(() => ({}));
    if (!epRes.ok) {
      throw new Error(typeof epData?.error === 'string' ? epData.error : JSON.stringify(epData?.error || epData?.message || 'Failed to create Plivo SIP endpoint'));
    }
    username = epData.username || desiredUsername;
    endpointId = epData.endpoint_id || '';
  }

  await db.query(
    `INSERT INTO clinic_dialer_webrtc (id, app_id, endpoint_id, username, password, answer_url, updated_at)
     VALUES (1, $1, $2, $3, $4, $5, NOW())
     ON CONFLICT (id) DO UPDATE SET app_id = EXCLUDED.app_id, endpoint_id = EXCLUDED.endpoint_id, username = EXCLUDED.username, password = EXCLUDED.password, answer_url = EXCLUDED.answer_url, updated_at = NOW()`,
    [appId, endpointId, username, password, answerUrl]
  );

  return {
    username,
    password,
    appId,
    callerId: normalizeE164(creds.callerId),
  };
}

module.exports = {
  getPlivoCredentials,
  normalizeE164,
  dispatchPlivoCall,
  ensurePlivoWebrtcSetup,
};

