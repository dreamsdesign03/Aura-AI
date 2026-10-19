// Sarvam Samvaad "Instant Outbound" calling integration.
// Dispatches a single outbound call attempt via the Sarvam outbounds API.

const { normalizePhone } = require('./call-utils');

const REQUIRED_ENV = [
  'SARVAM_ORG_ID',
  'SARVAM_WORKSPACE_ID',
  'SARVAM_APP_ID',
  'SARVAM_APP_VERSION',
  'SARVAM_CONNECTION_ID',
  'SARVAM_AGENT_NUMBER',
  'SARVAM_WEBHOOK_URL'
];

// Trim surrounding whitespace/newlines and strip one matching pair of quotes.
// Never log the value, only lengths.
function sanitizeApiKey(raw) {
  let value = String(raw == null ? '' : raw).trim();
  if (value.length >= 2) {
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value[value.length - 1] === quote) {
      value = value.slice(1, -1).trim();
    }
  }
  return value;
}

// Trim, strip control characters and quotes, collapse whitespace.
function cleanDisplayName(raw) {
  if (raw == null) return '';
  return String(raw)
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/["'\u2018\u2019\u201C\u201D]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isPlaceholder(value) {
  return ['none', 'null', 'undefined'].includes(String(value).toLowerCase());
}

// The only agent_variables sent to the Ketki outbound agent.
// Empty / placeholder values are omitted entirely.
function buildAgentVars({ name, phone, email } = {}) {
  const vars = {};

  const cleanName = cleanDisplayName(name);
  if (cleanName && !isPlaceholder(cleanName)) vars.userName = cleanName;

  const phoneObj = normalizePhone(phone);
  if (phoneObj) vars.userPhone = phoneObj.local;

  const mail = String(email == null ? '' : email).trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) vars.userEmail = mail;

  return vars;
}

// Only used when the lead has no usable name: the Ketki agent defaults to
// "Am I speaking with {userName}?", so we must override it in that case.
function buildOutboundGreeting(name) {
  const cleanName = cleanDisplayName(name);
  if (cleanName && !isPlaceholder(cleanName)) return '';
  return 'Hello! This is Ketki from Aura Laser and Cosmetic Clinic. Do you have two minutes to talk?';
}

// Mask emails and long digit runs before logging upstream payloads.
function redactForLog(value) {
  return String(value)
    .replace(/[^\s"',:;]+@[^\s"',:;]+\.[^\s"',:;]+/g, '<email>')
    .replace(/\+?\d{10,}/g, m => '<digits:' + m.length + '>');
}

function extractErrorMessage(data, res) {
  const errObj = data && typeof data.error === 'object' ? data.error : null;
  const detail = errObj && errObj.data && errObj.data.details;
  return (
    [errObj && errObj.message, detail].filter(Boolean).join(' - ') ||
    (typeof data?.error === 'string' ? data.error : null) ||
    data?.message ||
    data?.detail ||
    (Array.isArray(data?.detail) && data.detail.length ? JSON.stringify(data.detail) : null) ||
    res.statusText ||
    `HTTP ${res.status}`
  );
}

async function dispatchSarvamCall({ phoneE164, vars, metadata }) {
  const missing = REQUIRED_ENV.filter(name => !process.env[name]);
  if (missing.length > 0) {
    throw new Error('Missing required Sarvam configuration: ' + missing.join(', '));
  }

  const rawKey = process.env.SARVAM_API_KEY == null ? '' : String(process.env.SARVAM_API_KEY);
  const apiKey = sanitizeApiKey(rawKey);
  if (apiKey.length !== rawKey.length) {
    console.log('[Sarvam] key sanitization changed length: ' + rawKey.length + ' -> ' + apiKey.length);
  }
  console.log('[Sarvam] key present: ' + (apiKey ? 'yes' : 'no') + ', length ' + apiKey.length);

  const url = `https://apps.sarvam.ai/api/outbounds/v1/orgs/${process.env.SARVAM_ORG_ID}/workspaces/${process.env.SARVAM_WORKSPACE_ID}/outbounds`;
  const maskedWebhookUrl = String(process.env.SARVAM_WEBHOOK_URL).replace(/secret=[^&]+/, 'secret=***');

  const body = {
    app_config: {
      app_id: process.env.SARVAM_APP_ID,
      app_version: Number(process.env.SARVAM_APP_VERSION || 13),
      connection_config: {
        connection_id: process.env.SARVAM_CONNECTION_ID,
        agent_phone_number: process.env.SARVAM_AGENT_NUMBER
      },
      agent_variables: vars || {}
    },
    user_config: {
      user_phone_number: phoneE164
    },
    webhook_config: {
      url: process.env.SARVAM_WEBHOOK_URL,
      metadata: metadata || {}
    }
  };

  const greeting = buildOutboundGreeting(body.app_config.agent_variables.userName);
  if (greeting) {
    body.app_config.app_overrides = { initial_bot_message: greeting };
  }

  console.log('[Sarvam] POST ' + url);
  console.log('[Sarvam] vars sent: ' + (Object.keys(body.app_config.agent_variables).length ? Object.keys(body.app_config.agent_variables).join(', ') : '(none)'));
  console.log('[Sarvam] greeting override: ' + (greeting ? 'yes' : 'no'));
  console.log('[Sarvam] config ' + JSON.stringify({
    app_id: body.app_config.app_id,
    app_version: body.app_config.app_version,
    connection_id: body.app_config.connection_config.connection_id,
    agent_variables_keys: Object.keys(body.app_config.agent_variables),
    webhook_url: maskedWebhookUrl
  }));

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const data = await res.json().catch(() => null);
  console.log('[Sarvam] response status ' + res.status + ' body ' + redactForLog(JSON.stringify(data)).slice(0, 500));

  if (!res.ok) {
    const err = new Error('Sarvam rejected the request (' + res.status + '): ' + extractErrorMessage(data, res));
    err.status = res.status;
    err.body = data;
    console.error('[Sarvam] dispatch failed: ' + err.message);
    throw err;
  }

  console.log('[Sarvam] dispatch ok attempt_id=' + (data && data.attempt_id));
  return data;
}

// Pure mapping of a Sarvam webhook payload to the bulk engine's vocabulary.
function mapSarvamOutcome(payload) {
  const status = String(payload?.status || '').toLowerCase();
  const fv = payload?.final_agent_variables || {};
  const disposition = String(fv.call_disposition || '').toLowerCase();

  let callStatus;
  let outcome;
  if (status === 'no_answer' || status === 'busy' || status === 'failed') {
    callStatus = status;
    outcome = status;
  } else {
    callStatus = 'completed';
    if (String(fv.do_not_call || '').trim().toLowerCase() === 'yes') outcome = 'do_not_call';
    else if (disposition === 'booked' || disposition === 'rescheduled' || disposition === 'confirmed') outcome = 'booked';
    else if (disposition === 'do_not_call') outcome = 'do_not_call';
    else if (disposition === 'not_interested') outcome = 'not_interested';
    else outcome = 'not_booked';
  }

  let summary = fv.call_summary || '';
  if (!summary && Array.isArray(payload?.interaction_transcript) && payload.interaction_transcript.length > 0) {
    summary = payload.interaction_transcript
      .slice(-2)
      .map(t => `${t?.role}: ${t?.en_text}`)
      .join(' ');
  }
  if (payload?.interaction_id) {
    summary = `${summary} [interaction_id: ${payload.interaction_id}]`.trim();
  }

  const confirmedSlot = outcome === 'booked' ? (fv.confirmed_slot || '') : '';

  return { callStatus, outcome, summary, confirmedSlot };
}

module.exports = { dispatchSarvamCall, mapSarvamOutcome, sanitizeApiKey, buildAgentVars, buildOutboundGreeting, cleanDisplayName };
