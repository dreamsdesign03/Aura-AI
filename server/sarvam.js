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

function getSarvamApiKey() {
  const k = process.env.SARVAM_SAMVAAD_API_KEY || process.env.SARVAM_API_KEY || '';
  return sanitizeApiKey(k);
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

function getIstDates() {
  const now = new Date();
  // UTC+5:30 Indian Standard Time
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffsetMs);

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const currentDay = days[istNow.getUTCDay()];
  const currentDate = `${istNow.getUTCDate()} ${months[istNow.getUTCMonth()]} ${istNow.getUTCFullYear()}`;

  // Next slot: tomorrow at 3:30 PM IST
  const tomorrow = new Date(istNow.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowDay = days[tomorrow.getUTCDay()];
  const tomorrowDate = `${tomorrow.getUTCDate()} ${months[tomorrow.getUTCMonth()]} ${tomorrow.getUTCFullYear()}`;
  const appointmentDatetime = `${tomorrowDay}, ${tomorrowDate} at 3:30 PM IST`;

  return { currentDay, currentDate, appointmentDatetime };
}

// Agent variables sent to Sarvam outbound agent.
// For Ria (default/customer): userName, userPhone, userEmail.
// For Misha (makeup_artist): userName, userPhone, userCity, appointment_datetime, etc.
function buildAgentVars({ name, phone, email, city, agentType, existingAppointmentDateTime, appointmentDatetime } = {}) {
  const vars = {};

  const cleanName = cleanDisplayName(name);
  if (cleanName && !isPlaceholder(cleanName)) vars.userName = cleanName;

  const phoneObj = normalizePhone(phone);
  if (phoneObj) vars.userPhone = phoneObj.local;

  const mail = String(email == null ? '' : email).trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) vars.userEmail = mail;

  // Custom variables for Misha (Skinnonest Makeup Artist & Salon Coordinator)
  if (agentType === 'makeup_artist') {
    const { currentDay, currentDate, appointmentDatetime: defaultSlot } = getIstDates();
    vars.userCity = cleanDisplayName(city) || 'Vadodara';
    vars.existingAppointmentDateTime = existingAppointmentDateTime || 'None';
    vars.appointment_datetime = appointmentDatetime || defaultSlot;
    vars.current_day = currentDay;
    vars.current_date = currentDate;
    vars.brandOneLiner = 'Skinnonest works with makeup artists, salons and skin clinics';
    vars.productList = 'Sunscreen, Face Wash, Moisturising Cream, Shampoo';
    vars.productsAndBenefits = 'Derma and cosmeceutical skincare tailored for salons, makeup artists and skin clinics';
    vars.contactNumber = process.env.SARVAM_PLIVO_AGENT_NUMBER || '+918065587555';
    vars.contactEmail = 'support@skinnonest.com';
    vars.preferredCallbackWindow = 'Monday to Saturday, 10:00 AM to 6:00 PM IST';
    vars.vishwTimings = '11:00 AM to 6:00 PM IST';
    vars.artistValuePoints = 'Exclusive salon and makeup artist partnership terms, professional pricing, and trial samples';
  }

  return vars;
}

// Only used when the lead has no usable name.
function buildOutboundGreeting(name, isMisha = false) {
  const cleanName = cleanDisplayName(name);
  if (cleanName && !isPlaceholder(cleanName)) return '';
  if (isMisha) {
    return 'Hello! This is Misha from Skinnonest. Do you have two minutes to talk?';
  }
  return 'Hello! This is Ria from Aura Laser and Cosmetic Clinic. Do you have two minutes to talk?';
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

async function dispatchSarvamCall({ phoneE164, vars, metadata, appId, appVersion, agentType }) {
  const missing = REQUIRED_ENV.filter(name => {
    if (name === 'SARVAM_API_KEY') {
      return !process.env.SARVAM_SAMVAAD_API_KEY && !process.env.SARVAM_API_KEY;
    }
    return !process.env[name];
  });
  if (missing.length > 0) {
    throw new Error('Missing required Sarvam configuration: ' + missing.join(', '));
  }

  const apiKey = getSarvamApiKey();
  console.log('[Sarvam] key present: ' + (apiKey ? 'yes' : 'no') + ', length ' + apiKey.length);

  const url = `https://apps.sarvam.ai/api/outbounds/v1/orgs/${process.env.SARVAM_ORG_ID}/workspaces/${process.env.SARVAM_WORKSPACE_ID}/outbounds`;
  const maskedWebhookUrl = String(process.env.SARVAM_WEBHOOK_URL).replace(/secret=[^&]+/, 'secret=***');

  const isMisha = agentType === 'makeup_artist' || appId === 'Misha-Skinn-4e9816f8-ead9';
  const riaAppId = process.env.SARVAM_RIA_APP_ID || 'Aura-Outbou-824024af-4678';
  const resolvedAppId = isMisha
    ? 'Misha-Skinn-4e9816f8-ead9'
    : ((!appId || appId === 'Conversatio-cc27549a-e502') ? riaAppId : appId);
  const resolvedConnectionId = process.env.SARVAM_PLIVO_CONNECTION_ID || 'Plivo-Krish-2edc0fee-cca4';
  const resolvedAgentNumber = process.env.SARVAM_PLIVO_AGENT_NUMBER || '+918065587555';

  const appConfig = {
    app_id: resolvedAppId,
    connection_config: {
      connection_id: resolvedConnectionId,
      agent_phone_number: resolvedAgentNumber
    },
    agent_variables: vars || {}
  };

  if (appVersion != null) {
    appConfig.app_version = Number(appVersion);
  } else if (isMisha) {
    appConfig.app_version = Number(process.env.SARVAM_MISHA_APP_VERSION || 14);
  } else {
    appConfig.app_version = Number(process.env.SARVAM_RIA_APP_VERSION || 34);
  }

  const body = {
    app_config: appConfig,
    user_config: {
      user_phone_number: phoneE164
    },
    webhook_config: {
      url: process.env.SARVAM_WEBHOOK_URL,
      metadata: metadata || {}
    }
  };

  const greeting = buildOutboundGreeting(body.app_config.agent_variables.userName, isMisha);
  if (greeting) {
    body.app_config.app_overrides = { initial_bot_message: greeting };
  }

  console.log('[Sarvam] POST ' + url);
  console.log('[Sarvam] agent: ' + (isMisha ? 'Misha-Skinn (makeup_artist)' : 'Ria (customer)'));
  console.log('[Sarvam] vars sent: ' + (Object.keys(body.app_config.agent_variables).length ? Object.keys(body.app_config.agent_variables).join(', ') : '(none)'));
  console.log('[Sarvam] greeting override: ' + (greeting ? 'yes' : 'no'));
  console.log('[Sarvam] config ' + JSON.stringify({
    app_id: body.app_config.app_id,
    app_version: body.app_config.app_version,
    version_filter: body.app_config.version_filter,
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

  // Log ALL fields so we can identify the correct ID field name
  const allKeys = data ? Object.keys(data).join(', ') : 'null';
  console.log('[Sarvam] dispatch ok - response keys: ' + allKeys);
  console.log('[Sarvam] attempt_id=' + data?.attempt_id + ' outbound_id=' + data?.outbound_id + ' id=' + data?.id + ' request_id=' + data?.request_id);
  return data;
}

function extractValidSlot(fv) {
  let raw = String(fv.confirmed_slot || fv.booking_slot || fv.appointment_slot || fv.confirmed_time || '').trim();
  if (!raw) {
    const key = Object.keys(fv).find(k => 
      /(confirmed_slot|booking_slot|confirmed_time|appointment_time)/i.test(k) &&
      !/(duration|reminder|channel|intent|reason|notes|preparation|modes|fee|existing|minutes|selected)/i.test(k) &&
      String(fv[k] || '').trim()
    );
    if (key) raw = String(fv[key]).trim();
  }

  const lower = raw.toLowerCase();
  if (!raw || lower === 'none' || lower === 'null' || lower === 'undefined' || lower === 'nil' || lower === 'n/a' || lower === 'na' || lower === 'no' || lower === 'false' || /^\d+$/.test(raw)) {
    return '';
  }
  return raw;
}

// Extract a clean spoken name from final_agent_variables.
// Returns a trimmed 1-3 word name string, or empty string if invalid/absent.
function extractSpokenName(fv) {
  const BAD = /^(none|null|undefined|nil|n\/a|na|no|false|unknown|customer|patient|caller)$/i;
  const raw = [fv.confirmed_name, fv.user_name, fv.customer_name, fv.caller_name, fv.patient_name]
    .map(v => String(v || '').trim())
    .find(v => v && !BAD.test(v)) || '';
  if (!raw) return '';
  // Allow only Latin + Indic (Devanagari/Gujarati) letters and spaces, 1-3 words max
  const words = raw.split(/\s+/).filter(w => /^[\u0000-\u024F\u0900-\u097F\u0A80-\u0AFF]+$/u.test(w));
  if (words.length === 0 || words.length > 3) return '';
  return words.join(' ');
}
// Pure mapping of a Sarvam webhook payload to the bulk engine's vocabulary.
function mapSarvamOutcome(payload) {
  const status = String(payload?.status || '').toLowerCase();
  const fv = payload?.final_agent_variables || {};
  const disposition = String(fv.call_disposition || '').toLowerCase().trim();
  const slotValue = extractValidSlot(fv);
  const spokenName = extractSpokenName(fv);

  console.log('[mapSarvamOutcome] raw status=' + status + ' disposition=' + disposition + ' slotValue=' + slotValue + ' fv_keys=' + Object.keys(fv).join(','));

  let callStatus;
  let outcome;

  // Call was NOT picked up
  if (status === 'no_answer' || status === 'noanswer' || status === 'no-answer' ||
    status === 'busy' || status === 'failed' || status === 'canceled' || status === 'cancelled') {
    callStatus = status === 'noanswer' || status === 'no-answer' ? 'no_answer' : status;
    outcome = callStatus;
  } else {
    // Call was completed / answered
    callStatus = 'completed';
    const negative = /(^|_)(not|no|never|declin|reject|cancel|wrong)/.test(disposition) || /not.?book|no.?book/.test(disposition);
    
    if (String(fv.do_not_call || '').trim().toLowerCase() === 'yes' || disposition === 'do_not_call') {
      outcome = 'do_not_call';
    } else if (/not.?interest/.test(disposition) || disposition === 'wrong_person') {
      outcome = 'not_interested';
    } else if (disposition === 'callback_requested') {
      outcome = 'callback_requested';
    } else if (!negative && (disposition === 'booked' || slotValue)) {
      outcome = 'booked';
    } else {
      outcome = 'not_booked'; // answered, but no appointment
    }
  }

  // Extract summary — prefer call_summary, fallback to last 2 transcript lines
  let summary = fv.call_summary || fv.summary || '';
  if (!summary && Array.isArray(payload?.interaction_transcript) && payload.interaction_transcript.length > 0) {
    summary = payload.interaction_transcript
      .slice(-3)
      .map(t => `${t?.role}: ${t?.en_text || t?.text || ''}`)
      .filter(s => s.length > 6)
      .join(' | ');
  }
  if (payload?.interaction_id) {
    summary = `${summary} [interaction_id: ${payload.interaction_id}]`.trim();
  }

  // Extract sentiment
  const sentiment = fv.sentiment || fv.call_sentiment || 'Neutral';

  const confirmedSlot = outcome === 'booked' ? slotValue : '';

  console.log('[mapSarvamOutcome] result: callStatus=' + callStatus + ' outcome=' + outcome + ' sentiment=' + sentiment + ' summaryLen=' + summary.length);

  return { callStatus, outcome, summary, confirmedSlot, sentiment, spokenName };
}

// ───────────────────────── Sarvam CAMPAIGN mode ─────────────────────────
// Sarvam runs the dialing, schedule and retries itself; AuraAI only creates the
// campaign, streams contacts, pauses/resumes it, and reads results via webhook.

const SCHEDULING_BASE = 'https://apps.sarvam.ai/api/scheduling/v1';
const ANALYTICS_BASE = 'https://apps.sarvam.ai/api/analytics/v1';

function campaignEnabled() {
  return String(process.env.SARVAM_USE_CAMPAIGNS || 'true').toLowerCase() !== 'false';
}

function requireSarvamEnv(names) {
  const missing = names.filter(n => {
    if (n === 'SARVAM_API_KEY') {
      return !process.env.SARVAM_SAMVAAD_API_KEY && !process.env.SARVAM_API_KEY;
    }
    return !process.env[n];
  });
  if (missing.length) throw new Error('Missing required Sarvam configuration: ' + missing.join(', '));
}

async function sarvamJson(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'X-API-Key': getSarvamApiKey(), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error('Sarvam rejected the request (' + res.status + '): ' + extractErrorMessage(data, res));
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

function schedulingUrl(path) {
  return `${SCHEDULING_BASE}/orgs/${process.env.SARVAM_ORG_ID}/workspaces/${process.env.SARVAM_WORKSPACE_ID}${path}`;
}

// ── Campaign settings (same options as the Sarvam "Schedule campaign" wizard) ──
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const LOCAL_DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function badInput(msg) {
  const e = new Error(msg);
  e.status = 400;
  return e;
}

function clampInt(v, min, max, dflt) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
}

// Validates + fills defaults. The defaults match the Sarvam wizard.
function normalizeSarvamSettings(input) {
  const s = input && typeof input === 'object' ? input : {};
  const r = s.retry && typeof s.retry === 'object' ? s.retry : {};
  const on = r.on && typeof r.on === 'object' ? r.on : {};

  const aps = Number(s.attemptsPerSecond == null ? 0.5 : s.attemptsPerSecond);
  if (!Number.isFinite(aps) || aps < 0.1 || aps > 500) throw badInput('Attempts per second must be between 0.1 and 500');

  const days = Array.isArray(s.allowedDays) ? DAY_NAMES.filter(d => s.allowedDays.includes(d)) : DAY_NAMES.slice();
  if (days.length === 0) throw badInput('Select at least one allowed day');

  const startTime = s.startTime == null ? '09:00' : String(s.startTime);
  const endTime = s.endTime == null ? '18:00' : String(s.endTime);
  if (!HHMM.test(startTime) || !HHMM.test(endTime)) throw badInput('Calling time must be HH:MM');
  if (endTime <= startTime) throw badInput('Calls-allowed end time must be after the start time');
  // Clamp to env-defined calling window (default 10:00–19:00)
  const _callStart = process.env.CALL_START || process.env.SARVAM_CALL_START || '10:00';
  const _callEnd   = process.env.CALL_END   || process.env.SARVAM_CALL_END   || '19:00';
  if (HHMM.test(_callStart) && startTime < _callStart) throw badInput(`Calling start cannot be before ${_callStart}`);
  if (HHMM.test(_callEnd)   && endTime   > _callEnd)   throw badInput(`Calling end cannot be after ${_callEnd}`);

  const startMode = s.start && s.start.mode === 'custom' ? 'custom' : 'now';
  const endMode = s.end && s.end.mode === 'custom' ? 'custom' : 'today';
  const startAt = startMode === 'custom' ? String(s.start.at || '') : '';
  const endAt = endMode === 'custom' ? String(s.end.at || '') : '';
  if (startMode === 'custom' && !LOCAL_DT.test(startAt)) throw badInput('Pick a valid custom start date and time');
  if (endMode === 'custom' && !LOCAL_DT.test(endAt)) throw badInput('Pick a valid custom end date and time');

  const retryEnabled = r.enabled !== false;
  const maxRetries = clampInt(r.maxRetries, 0, 2, 1); // default 1, max 2 retries
  const intervalMin = clampInt(r.intervalMin, 1, 1440, 30);
  let customIntervals = null;
  if (Array.isArray(r.customIntervals) && r.customIntervals.length) {
    customIntervals = r.customIntervals.map(n => clampInt(n, 1, 1440, intervalMin)).slice(0, 20);
  }
  const err = (o, dMax, dInt) => ({
    enabled: o ? o.enabled !== false : true,
    maxRetries: clampInt(o && o.maxRetries, 1, 20, dMax),
    intervalMin: clampInt(o && o.intervalMin, 5, 1440, dInt)
  });
  const sd = on.short_duration && typeof on.short_duration === 'object' ? on.short_duration : {};

  return {
    start: { mode: startMode, at: startAt },
    end: { mode: endMode, at: endAt },
    attemptsPerSecond: aps,
    allowedDays: days,
    startTime,
    endTime,
    retry: {
      enabled: retryEnabled,
      maxRetries,
      intervalMin,
      customIntervals,
      on: {
        busy: on.busy !== false,
        no_answer: on.no_answer !== false,
        failed: on.failed !== false,
        short_duration: { enabled: !!sd.enabled, thresholdSeconds: clampInt(sd.thresholdSeconds, 1, 3600, 30) },
        provider_error: err(on.provider_error, 3, 5),
        internal_error: err(on.internal_error, 3, 5)
      }
    }
  };
}

// Settings for campaigns created before the settings UI existed.
function legacySarvamSettings(camp) {
  return normalizeSarvamSettings({
    attemptsPerSecond: Number(process.env.SARVAM_CAMPAIGN_APS || 0.5),
    startTime: process.env.CALL_START || process.env.SARVAM_CALL_START || '10:00',
    endTime: process.env.CALL_END || process.env.SARVAM_CALL_END || '19:00',
    retry: { enabled: true, maxRetries: Math.max(0, (camp.max_attempts || 2) - 1), intervalMin: camp.retry_delay_min || 30 }
  });
}

// Start/end for the Sarvam campaign, computed when the campaign is launched.
// Sarvam needs start_timestamp at least 120s in the future; we keep 180s.
function resolveSarvamWindow(settings, nowMs = Date.now()) {
  const minStart = nowMs + 180 * 1000;
  let start = minStart;
  if (settings.start.mode === 'custom') {
    const t = Date.parse(settings.start.at + ':00+05:30');
    if (Number.isFinite(t)) start = Math.max(t, minStart);
  }
  let end;
  if (settings.end.mode === 'custom') {
    end = Date.parse(settings.end.at + ':00+05:30');
  } else {
    const istToday = new Date(nowMs + 330 * 60000).toISOString().slice(0, 10);
    end = Date.parse(istToday + 'T23:59:00+05:30');
  }
  if (!Number.isFinite(end) || end <= start + 60000) {
    throw badInput('End time must be after the start time (campaign starts about 3 minutes after you press Start)');
  }
  return { startIso: new Date(start).toISOString(), endIso: new Date(end).toISOString() };
}

function buildRetryConfig(r) {
  if (!r.enabled || r.maxRetries === 0) return { max_retries: 0 };
  const on = r.on;
  return {
    max_retries: r.maxRetries,
    retry_interval_minutes: r.customIntervals && r.customIntervals.length ? r.customIntervals : r.intervalMin,
    retry_on: {
      busy: { enabled: !!on.busy },
      no_answer: { enabled: !!on.no_answer },
      failed: { enabled: !!on.failed },
      short_duration: { enabled: !!on.short_duration.enabled, threshold_seconds: on.short_duration.thresholdSeconds },
      provider_error: { enabled: !!on.provider_error.enabled, max_retries: on.provider_error.maxRetries, retry_interval_minutes: on.provider_error.intervalMin },
      internal_error: { enabled: !!on.internal_error.enabled, max_retries: on.internal_error.maxRetries, retry_interval_minutes: on.internal_error.intervalMin }
    }
  };
}

function buildSarvamCampaignBody({ name, description, settings, startIso, endIso, webhookUrl, metadata }) {
  const bulkConnectionId = process.env.SARVAM_PLIVO_CONNECTION_ID || 'Plivo-Krish-2edc0fee-cca4';
  const bulkAgentNumber = process.env.SARVAM_PLIVO_AGENT_NUMBER || '+918065587555';
  const bulkAppId = process.env.SARVAM_RIA_APP_ID || 'Aura-Outbou-824024af-4678';
  const bulkAppVersion = Number(process.env.SARVAM_RIA_APP_VERSION || 34);
  return {
    name: String(name || 'AuraAI campaign').slice(0, 100),
    description: description ? String(description).slice(0, 150) : null,
    app_config: {
      app_id: bulkAppId,
      app_type: 'agent',
      app_version: bulkAppVersion,
      attempts_per_second: settings.attemptsPerSecond,
      connection_configs: [{
        connection_id: bulkConnectionId,
        phone_numbers: [bulkAgentNumber],
        weight: 1,
        phone_number: bulkAgentNumber,
        agent_phone_number: bulkAgentNumber
      }],
      retry_config: buildRetryConfig(settings.retry),
      // Sarvam's docs place webhook_config both top-level and inside app_config; send it in both.
      webhook_config: { url: webhookUrl, metadata: metadata || {} }
    },
    start_timestamp: startIso,
    end_timestamp: endIso,
    allowed_schedule: {
      allowed_start_time: settings.startTime,
      allowed_end_time: settings.endTime,
      allowed_days: settings.allowedDays,
      timezone: 'Asia/Kolkata'
    },
    webhook_config: { url: webhookUrl, metadata: metadata || {} }
  };
}

async function createSarvamCampaign(opts) {
  requireSarvamEnv(['SARVAM_API_KEY', 'SARVAM_ORG_ID', 'SARVAM_WORKSPACE_ID', 'SARVAM_APP_ID', 'SARVAM_APP_VERSION', 'SARVAM_CONNECTION_ID', 'SARVAM_AGENT_NUMBER']);
  const body = buildSarvamCampaignBody(opts);
  const url = schedulingUrl('/campaigns');
  try {
    return await sarvamJson('POST', url, body);
  } catch (err) {
    // The Sarvam docs disagree on where webhook_config lives. If the top-level
    // placement is rejected, retry once with it inside app_config.
    if (err.status === 422 && /webhook/i.test(JSON.stringify(err.body || ''))) {
      const alt = { ...body, app_config: { ...body.app_config, webhook_config: body.webhook_config } };
      delete alt.webhook_config;
      return sarvamJson('POST', url, alt);
    }
    throw err;
  }
}

// users: [{ user_phone_number, user_identifier, app_variables, app_overrides }]. Max 1000 per request.
async function streamSarvamCohort(campaignId, cohortName, users) {
  const results = [];
  for (let i = 0; i < users.length; i += 1000) {
    const part = Math.floor(i / 1000) + 1;
    const name = (cohortName + (users.length > 1000 ? '-p' + part : '')).replace(/[^\w\- ]/g, '').slice(0, 50);
    results.push(await sarvamJson('POST', schedulingUrl(`/campaigns/${campaignId}/cohorts/stream`), {
      name,
      users: users.slice(i, i + 1000)
    }));
  }
  return results;
}

// action: 'pause' | 'resume' | 'cancel'
function setSarvamCampaignStatus(campaignId, action) {
  return sarvamJson('PUT', schedulingUrl(`/campaigns/${campaignId}/status`), { action });
}

// Edit a paused/scheduled Sarvam campaign (PATCH). Start time cannot be changed by Sarvam.
function updateSarvamCampaign(campaignId, opts) {
  const body = buildSarvamCampaignBody(opts);
  delete body.start_timestamp;
  if (!opts.description) delete body.description;
  return sarvamJson('PATCH', schedulingUrl(`/campaigns/${campaignId}`), body);
}

function getSarvamCampaign(campaignId) {
  return sarvamJson('GET', schedulingUrl(`/campaigns/${campaignId}`));
}

// Sarvam interaction IDs look like `20261026/28583282-11:29:08-0f77fd2f`.
// The time segment contains colons, so allow `:` in addition to word chars and hyphens.
function validInteractionId(id) {
  return /^\d{8}\/[\w:-]+$/.test(String(id || ''));
}

const MISHA_APP_ID = process.env.SARVAM_MISHA_APP_ID || 'Misha-Skinn-4e9816f8-ead9';
const RIA_APP_ID = process.env.SARVAM_RIA_APP_ID || 'Aura-Outbou-824024af-4678';

function getAnalyticsAppIds() {
  const primary = process.env.SARVAM_APP_ID;
  return [...new Set([RIA_APP_ID, MISHA_APP_ID, primary].filter(Boolean))];
}

function analyticsUrl(kind, interactionId, appId) {
  requireSarvamEnv(['SARVAM_API_KEY', 'SARVAM_ORG_ID', 'SARVAM_WORKSPACE_ID', 'SARVAM_APP_ID']);
  const targetApp = appId || process.env.SARVAM_APP_ID;
  return `${ANALYTICS_BASE}/${process.env.SARVAM_ORG_ID}/${process.env.SARVAM_WORKSPACE_ID}/${targetApp}/${kind}/${interactionId}`;
}

// Full conversation in the original language: [{ turn_id, role, content, language_name }]
async function fetchSarvamTranscript(interactionId) {
  if (!validInteractionId(interactionId)) throw new Error('Invalid interaction_id');
  let lastErr = null;
  for (const appId of getAnalyticsAppIds()) {
    try {
      const data = await sarvamJson('GET', analyticsUrl('transcripts', interactionId, appId));
      return Array.isArray(data?.messages) ? data.messages : [];
    } catch (err) {
      lastErr = err;
      if (err.status !== 404) throw err;
    }
  }
  throw lastErr || new Error('Transcript not available (404)');
}

// Returns the raw fetch Response (audio/wav) or throws.
async function fetchSarvamRecording(interactionId) {
  if (!validInteractionId(interactionId)) throw new Error('Invalid interaction_id');
  let lastStatus = 404;
  for (const appId of getAnalyticsAppIds()) {
    const res = await fetch(analyticsUrl('recordings', interactionId, appId), {
      headers: { 'X-API-Key': getSarvamApiKey() }
    });
    if (res.ok) return res;
    lastStatus = res.status;
    if (res.status !== 404) {
      const err = new Error('Recording not available (' + res.status + ')');
      err.status = res.status;
      throw err;
    }
  }
  const err = new Error('Recording not available (' + lastStatus + ')');
  err.status = lastStatus;
  throw err;
}

// Audio is served through our own proxy route (Sarvam needs the API key header).
function recordingProxyUrl(interactionId) {
  if (!interactionId) return null;
  const base = String(process.env.PUBLIC_APP_URL || '').replace(/\/$/, '');
  return `${base}/api/bulk-calling/calls/recording?iid=${encodeURIComponent(interactionId)}`;
}

function istOffsetIso(ms) {
  return new Date(ms + 330 * 60000).toISOString().replace(/\.\d{3}Z$/, '+05:30');
}

// Pages through Sarvam's Analytics API (attempts / interactions) for one campaign.
// If the campaign_id filter is rejected, falls back to fetching all and filtering here.
async function listSarvamAnalytics(kind, { startMs, endMs, campaignId, extra, appId }) {
  requireSarvamEnv(['SARVAM_API_KEY', 'SARVAM_ORG_ID', 'SARVAM_WORKSPACE_ID', 'SARVAM_APP_ID']);
  const targetApp = appId || process.env.SARVAM_APP_ID;
  const base = `${ANALYTICS_BASE}/${process.env.SARVAM_ORG_ID}/${process.env.SARVAM_WORKSPACE_ID}/${targetApp}/${kind}`;
  let out = [];
  for (const useFilter of [true, false]) {
    out = [];
    try {
      for (let offset = 0; offset < 5000; offset += 1000) {
        const qs = new URLSearchParams({
          start_datetime: istOffsetIso(startMs),
          end_datetime: istOffsetIso(endMs),
          limit: '1000',
          offset: String(offset),
          ...(extra || {})
        });
        if (useFilter && campaignId) {
          qs.set('filter_conditions', JSON.stringify([{ field: 'campaign_id', operator: 'equals', value: String(campaignId) }]));
        }
        const data = await sarvamJson('GET', `${base}?${qs.toString()}`);
        const items = Array.isArray(data && data.items) ? data.items : [];
        out.push(...items);
        if (items.length < 1000) break;
      }
      break;
    } catch (err) {
      if (useFilter && campaignId && [400, 422].includes(err.status)) continue;
      throw err;
    }
  }
  return campaignId ? out.filter(i => String(i.campaign_id) === String(campaignId)) : out;
}

// Campaign webhook payloads use connectivity_status/completion_status instead of
// `status`. Adapt them to the shape mapSarvamOutcome() already understands.
function adaptCampaignPayload(payload) {
  const connected = payload.connectivity_status === 'connected' || !!payload.interaction_id;
  const status = payload.status || (connected ? 'completed' : (payload.connectivity_status || payload.completion_status || 'failed'));
  return {
    ...payload,
    status,
    final_agent_variables: { ...(payload.output_agent_variables || {}), ...(payload.final_agent_variables || {}) }
  };
}

module.exports = {
  dispatchSarvamCall, mapSarvamOutcome, sanitizeApiKey, buildAgentVars, buildOutboundGreeting, cleanDisplayName,
  campaignEnabled, createSarvamCampaign, streamSarvamCohort, setSarvamCampaignStatus, getSarvamCampaign,
  fetchSarvamTranscript, fetchSarvamRecording, validInteractionId, adaptCampaignPayload,
  normalizeSarvamSettings, legacySarvamSettings, resolveSarvamWindow, buildSarvamCampaignBody,
  recordingProxyUrl, listSarvamAnalytics, updateSarvamCampaign
};