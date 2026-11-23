const express = require('express');
const db = require('./db');
const { normalizePhone, isCallingHours } = require('./call-utils');
const { normalizeRole, isAdminRole } = require('./permissions');
const { updateContactName } = require('./contact-name');
const {
  dispatchSarvamCall, buildAgentVars, buildOutboundGreeting,
  campaignEnabled, createSarvamCampaign, streamSarvamCohort, setSarvamCampaignStatus, getSarvamCampaign,
  fetchSarvamTranscript, fetchSarvamRecording, validInteractionId,
  normalizeSarvamSettings, legacySarvamSettings, resolveSarvamWindow,
  mapSarvamOutcome, adaptCampaignPayload, recordingProxyUrl, listSarvamAnalytics,
  updateSarvamCampaign
} = require('./sarvam');

const router = express.Router();

// Same cookie check the rest of the app uses (aura_user_email must belong to a user).
async function requireUserCookie(req, res, next) {
  try {
    const match = /(?:^|;\s*)aura_user_email=([^;]+)/.exec(req.headers.cookie || '');
    if (!match) return res.status(401).json({ error: 'Unauthenticated' });
    const u = await db.query('SELECT id, email, username, role FROM users WHERE email = $1', [decodeURIComponent(match[1])]);
    if (u.rows.length === 0) return res.status(401).json({ error: 'Unauthenticated' });
    // Bulk Calling: admin and leader allowed; executive blocked.
    const role = normalizeRole(u.rows[0].role, u.rows[0]);
    if (role !== "admin" && role !== "leader") {
      return res.status(403).json({ error: 'Admin or Leader access required', code: 'ROLE_FORBIDDEN' });
    }
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Full conversation (original language) for one call, with database cache and Sarvam upstream.
router.get('/calls/transcript', requireUserCookie, async (req, res) => {
  try {
    const iid = String(req.query.iid || '');
    if (!validInteractionId(iid)) return res.status(400).json({ error: 'invalid iid' });

    // 1. Check local cache in ai_calls and bulk_attempts first
    try {
      const cached = await db.query(
        `SELECT transcript FROM ai_calls WHERE (conversation_id = $1 OR call_sid = $1) AND transcript IS NOT NULL AND jsonb_typeof(transcript) != 'null'
         UNION ALL
         SELECT transcript FROM bulk_attempts WHERE interaction_id = $1 AND transcript IS NOT NULL AND jsonb_typeof(transcript) != 'null'
         LIMIT 1`,
        [iid]
      );
      if (cached.rows.length > 0 && cached.rows[0].transcript) {
        let t = cached.rows[0].transcript;
        if (typeof t === 'string') {
          try { t = JSON.parse(t); } catch {}
        }
        if (Array.isArray(t) && t.length > 0) {
          return res.json({ messages: t });
        }
      }
    } catch (cacheErr) {
      console.warn('[bulk-calling] local transcript cache check warning:', cacheErr.message);
    }

    // 2. Fetch live from Sarvam
    const msgs = await fetchSarvamTranscript(iid);

    // 3. Cache back into database
    if (msgs && Array.isArray(msgs) && msgs.length > 0) {
      db.query(
        `UPDATE bulk_attempts SET transcript = $1 WHERE interaction_id = $2;
         UPDATE ai_calls SET transcript = $1 WHERE conversation_id = $2;`,
        [JSON.stringify(msgs), iid]
      ).catch(() => {});
    }

    res.json({ messages: msgs });
  } catch (err) {
    res.status(err.status === 429 ? 429 : 502).json({ error: err.message });
  }
});

// Call audio (WAV), proxied so the API key never reaches the browser.
router.get('/calls/recording', requireUserCookie, async (req, res) => {
  try {
    const iid = String(req.query.iid || '');
    if (!validInteractionId(iid)) return res.status(400).json({ error: 'invalid iid' });
    const upstream = await fetchSarvamRecording(iid);
    res.set('Content-Type', 'audio/wav');
    res.set('Cache-Control', 'private, max-age=3600');
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (err) {
    res.status(err.status === 404 ? 404 : 502).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Unified conversation explorer: bulk outbound + dialer + inbound transcripts.
// Additive endpoint — does not affect campaign behaviour.
// ---------------------------------------------------------------------------
const {
  CONVERSATION_TYPES,
  CONVERSATION_TYPE_LABELS,
  classifyConversation,
  deriveCallSource,
  purposeLabel,
  transcriptToText,
} = require('./conversation-intelligence');

async function cookieUserId(req) {
  const match = /(?:^|;\s*)aura_user_email=([^;]+)/.exec(req.headers.cookie || '');
  if (!match) return null;
  const u = await db.query('SELECT id FROM users WHERE email = $1', [decodeURIComponent(match[1])]);
  return u.rows[0]?.id || null;
}

const DIALER_BOOKING_TYPES = ['patient_consultation', 'follow_up', 'treatment_query', 'appointment_booking', 'payment_reminder', 'general'];

function conversationSelect() {
  return `
    SELECT ac.id, ac.lead_id, ac.conversation_id, ac.call_sid,
           ac.to_phone, ac.from_phone, ac.lead_name, ac.company_name,
           ac.status, ac.booking_type, ac.started_at, ac.duration_secs,
           ac.transcript_summary, ac.recording_url, ac.sentiment, ac.outcome,
           ac.provider, ac.direction, ac.transcript,
           l.pipeline_stage,
           COALESCE(
             CASE
               WHEN LOWER(TRIM(COALESCE(l.first_name, ''))) IN ('patient', 'unknown', 'unknown caller', 'unnamed patient')
                 OR LOWER(TRIM(COALESCE(l.first_name, ''))) LIKE 'patient %'
               THEN NULL
               ELSE NULLIF(TRIM(CONCAT_WS(' ', NULLIF(l.first_name, '.'), NULLIF(l.last_name, '.'))), '')
             END,
             CASE
               WHEN LOWER(TRIM(COALESCE(ac.lead_name_english, ac.lead_name, ''))) IN
                 ('patient','unknown','unknown caller','unknown contact','inbound caller','patient consultation call','busy for five','no answer','not answered','failed','voicemail','unnamed patient')
                 OR LOWER(TRIM(COALESCE(ac.lead_name_english, ac.lead_name, ''))) LIKE 'patient %'
                 OR LOWER(TRIM(COALESCE(ac.lead_name_english, ac.lead_name, ''))) LIKE 'busy for %'
               THEN NULL
               ELSE NULLIF(TRIM(COALESCE(ac.lead_name_english, ac.lead_name, '')), '')
             END,
             NULLIF(COALESCE(ac.to_phone, l.phone, ac.from_phone), ''),
             'Unknown caller'
           ) AS display_name,
           COALESCE(ac.to_phone, l.phone, ac.from_phone, '—') AS display_phone,
           jsonb_array_length(CASE WHEN jsonb_typeof(ac.transcript) = 'array' THEN ac.transcript ELSE '[]'::jsonb END) AS turn_count,
           (ac.transcript IS NOT NULL AND jsonb_typeof(ac.transcript) = 'array') AS has_transcript
      FROM ai_calls ac
      LEFT JOIN leads l ON l.id = ac.lead_id
  `;
}

function sourceWhere(source, params) {
  if (source === 'inbound') {
    return ` AND LOWER(COALESCE(ac.direction, 'outbound')) = 'inbound'`;
  }
  if (source === 'bulk') {
    return ` AND LOWER(COALESCE(ac.direction, 'outbound')) <> 'inbound'
             AND LOWER(COALESCE(ac.booking_type, '')) = 'bulk_campaign'`;
  }
  if (source === 'dialer') {
    params.push(DIALER_BOOKING_TYPES);
    const idx = params.length;
    return ` AND LOWER(COALESCE(ac.direction, 'outbound')) <> 'inbound'
             AND LOWER(COALESCE(ac.booking_type, '')) <> 'bulk_campaign'
             AND (LOWER(COALESCE(ac.booking_type, '')) = ANY($${idx}::text[])
                  OR LOWER(COALESCE(ac.provider, '')) = 'plivo')`;
  }
  if (source === 'single') {
    params.push(DIALER_BOOKING_TYPES);
    const idx = params.length;
    return ` AND LOWER(COALESCE(ac.direction, 'outbound')) <> 'inbound'
             AND LOWER(COALESCE(ac.booking_type, '')) <> 'bulk_campaign'
             AND LOWER(COALESCE(ac.booking_type, '')) <> ALL($${idx}::text[])
             AND LOWER(COALESCE(ac.provider, '')) <> 'plivo'`;
  }
  return '';
}

function decorateConversation(row, { includeTranscript = false } = {}) {
  const source = deriveCallSource(row);
  const classification = classifyConversation(row);
  const preview = transcriptToText(row.transcript).replace(/\s+/g, ' ').trim().slice(0, 220);

  const out = {
    id: row.id,
    lead_id: row.lead_id,
    conversation_id: row.conversation_id,
    call_sid: row.call_sid,
    display_name: row.display_name,
    display_phone: row.display_phone,
    company_name: row.company_name,
    direction: row.direction || 'outbound',
    provider: row.provider || 'sarvam',
    source,
    status: row.status,
    outcome: row.outcome,
    booking_type: row.booking_type,
    purpose: purposeLabel(row.booking_type),
    started_at: row.started_at,
    duration_secs: row.duration_secs || 0,
    transcript_summary: row.transcript_summary,
    recording_url: row.recording_url,
    sentiment: row.sentiment,
    pipeline_stage: row.pipeline_stage,
    turn_count: Number(row.turn_count) || 0,
    has_transcript: Boolean(row.has_transcript),
    transcript_preview: preview,
    conversation_type: classification.type,
    conversation_type_label: classification.label,
    conversation_confidence: classification.confidence,
    classification_source: classification.source,
  };

  if (includeTranscript) {
    let turns = row.transcript;
    if (typeof turns === 'string') {
      try { turns = JSON.parse(turns); } catch { turns = []; }
    }
    out.transcript = Array.isArray(turns) ? turns : [];
  }

  return out;
}

// Import recent Plivo CDRs so calls made before webhook logging was enabled also appear.
router.post('/conversations/sync-plivo', requireUserCookie, async (req, res) => {
  try {
    const userId = await cookieUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' });
    const plivo = require('./plivo');
    const creds = plivo.getPlivoCredentials();
    if (!creds.isConfigured) return res.status(503).json({ error: 'Plivo credentials are not configured.' });
    const auth = 'Basic ' + Buffer.from(`${creds.authId}:${creds.authToken}`).toString('base64');
    const base = `https://api.plivo.com/v1/Account/${encodeURIComponent(creds.authId)}`;
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    const fmt = (date) => date.toISOString().slice(0, 19).replace('T', ' ');
    const headers = { Authorization: auth, Accept: 'application/json' };
    const calls = [];
    for (let page = 0; page < 5; page++) {
      const url = new URL(`${base}/Call/`);
      url.searchParams.set('limit', '20');
      url.searchParams.set('offset', String(page * 20));
      url.searchParams.set('end_time__gte', fmt(start));
      url.searchParams.set('end_time__lte', fmt(end));
      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error(`Plivo call history failed (${response.status}): ${(await response.text()).slice(0, 240)}`);
      const payload = await response.json();
      const rows = payload.objects || [];
      calls.push(...rows);
      if (!rows.length || rows.length < 20 || calls.length >= Number(payload.meta?.total_count || 0)) break;
    }

    const recordings = new Map();
    for (let page = 0; page < 5; page++) {
      const url = new URL(`${base}/Recording/`);
      url.searchParams.set('limit', '20');
      url.searchParams.set('offset', String(page * 20));
      url.searchParams.set('add_time__gte', fmt(start));
      url.searchParams.set('add_time__lte', fmt(end));
      const response = await fetch(url, { headers });
      if (!response.ok) break;
      const payload = await response.json();
      const rows = payload.objects || [];
      for (const item of rows) {
        const uuid = item.call_uuid || item.call_uuid_id;
        const recordingUrl = item.recording_url || item.url;
        if (uuid && recordingUrl) recordings.set(uuid, recordingUrl);
      }
      if (!rows.length || rows.length < 20) break;
    }

    let imported = 0;
    let transcriptionsQueued = 0;
    for (const call of calls) {
      const uuid = call.call_uuid;
      const from = call.from_number || call.from || '';
      const to = call.to_number || call.to || '';
      if (!uuid || (!from && !to)) continue;
      const direction = String(call.call_direction || call.direction || 'outbound').toLowerCase();
      const phone = direction === 'inbound' ? from : to;
      const digits = String(phone).replace(/\D/g, '').slice(-10);
      const lead = digits ? await db.query(
        `SELECT id, first_name, last_name FROM leads
          WHERE user_id = $1 AND RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g'), 10) = $2
          ORDER BY updated_at DESC NULLS LAST LIMIT 1`, [userId, digits]
      ) : { rows: [] };
      const contactName = lead.rows[0]
        ? [lead.rows[0].first_name, lead.rows[0].last_name].filter(Boolean).join(' ').trim()
        : phone;
      const recordUrl = recordings.get(uuid) || null;
      const duration = Number(call.call_duration || call.bill_duration || 0) || 0;
      const started = call.initiation_time || call.answer_time || call.end_time || new Date().toISOString();
      const status = call.hangup_cause_name
        ? (String(call.hangup_cause_name).toLowerCase().includes('normal') ? 'completed' : String(call.hangup_cause_name).toLowerCase())
        : 'completed';
      const exists = await db.query('SELECT id, recording_url, transcript FROM ai_calls WHERE call_sid = $1 OR conversation_id = $1 LIMIT 1', [uuid]);
      let callId;
      if (exists.rows.length) {
        callId = exists.rows[0].id;
        await db.query(
          `UPDATE ai_calls SET
             lead_id = COALESCE(lead_id, $1),
             from_phone = COALESCE(from_phone, $2),
             to_phone = COALESCE(to_phone, $3),
             lead_name = CASE WHEN lead_name IS NULL OR lead_name = '' OR LOWER(lead_name) IN ('patient','unknown caller','busy for five') THEN $4 ELSE lead_name END,
             provider = 'plivo', direction = $5,
             duration_secs = GREATEST(COALESCE(duration_secs, 0), $6),
             recording_url = COALESCE(recording_url, $7),
             status = CASE WHEN status IN ('ringing','in-progress') THEN $8 ELSE status END,
             updated_at = NOW()
           WHERE id = $9`,
          [lead.rows[0]?.id || null, from, to, contactName, direction, duration, recordUrl, status, callId]
        );
      } else {
        const inserted = await db.query(
          `INSERT INTO ai_calls
            (lead_id, conversation_id, call_sid, from_phone, to_phone, lead_name, company_name,
             status, booking_type, duration_secs, provider, direction, recording_url, started_at, created_at, updated_at)
           VALUES ($1,$2,$2,$3,$4,$5,'Aura Laser & Cosmetic Clinic',$6,
                   'general',$7,'plivo',$8,$9,$10,NOW(),NOW())
           RETURNING id`,
          [lead.rows[0]?.id || null, uuid, from, to, contactName, status, duration, direction, recordUrl, started]
        );
        callId = inserted.rows[0]?.id;
        imported++;
      }
      if (recordUrl && callId && (!exists.rows[0]?.transcript || exists.rows[0]?.transcript === '[]')) {
        // Recording callback / transcription worker will handle newly received recordings.
        const worker = require('./clinic-os');
        if (typeof worker.transcribePlivoRecording === 'function') {
          worker.transcribePlivoRecording(callId, recordUrl).catch(() => {});
          transcriptionsQueued++;
        }
      }
    }
    res.json({ success: true, checked: calls.length, imported, recordingsFound: recordings.size, transcriptionsQueued, windowDays: 30, capped: calls.length >= 100 });
  } catch (err) {
    console.error('[Plivo history sync]', err);
    res.status(502).json({ error: err.message || 'Could not sync Plivo call history' });
  }
});

// List every conversation (bulk outbound, dialer, inbound) with its type.
router.get('/conversations', requireUserCookie, async (req, res) => {
  try {
    const userId = await cookieUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' });

    const source = String(req.query.source || 'all').toLowerCase();
    const typeFilter = String(req.query.type || 'all').toLowerCase();
    const search = String(req.query.search || '').trim();
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 400);

    const params = [userId];
    let where = ` WHERE (l.user_id = $1 OR l.user_id IS NULL OR ac.lead_id IS NULL)`;
    where += sourceWhere(source, params);

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      const i = params.length;
      where += ` AND (
        LOWER(COALESCE(ac.lead_name, '')) LIKE $${i} OR
        LOWER(COALESCE(ac.lead_name_english, '')) LIKE $${i} OR
        LOWER(COALESCE(l.first_name, '')) LIKE $${i} OR
        LOWER(COALESCE(l.last_name, '')) LIKE $${i} OR
        LOWER(COALESCE(ac.to_phone, '')) LIKE $${i} OR
        LOWER(COALESCE(ac.from_phone, '')) LIKE $${i} OR
        LOWER(COALESCE(ac.transcript_summary, '')) LIKE $${i} OR
        LOWER(COALESCE(ac.conversation_id, '')) LIKE $${i} OR
        LOWER(COALESCE(ac.transcript::text, '')) LIKE $${i}
      )`;
    }

    const queryText = `${conversationSelect()}${where} ORDER BY ac.started_at DESC NULLS LAST LIMIT $${params.length + 1}`;
    params.push(limit);
    const r = await db.query(queryText, params);

    const all = r.rows.map((row) => decorateConversation(row));

    const byType = { marketing_sales: 0, patient_consultation: 0, customer_care: 0 };
    const bySource = { bulk: 0, dialer: 0, inbound: 0, single: 0 };
    for (const c of all) {
      byType[c.conversation_type] = (byType[c.conversation_type] || 0) + 1;
      bySource[c.source] = (bySource[c.source] || 0) + 1;
    }

    const conversations = typeFilter === 'all'
      ? all
      : all.filter((c) => c.conversation_type === typeFilter);

    res.json({
      conversations,
      counts: {
        total: all.length,
        by_type: byType,
        by_source: bySource,
      },
      type_labels: CONVERSATION_TYPE_LABELS,
      types: CONVERSATION_TYPES,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Full transcript for one conversation (used when a card is expanded).
router.get('/conversations/:id', requireUserCookie, async (req, res) => {
  try {
    const userId = await cookieUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' });

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });

    const r = await db.query(
      `${conversationSelect()} WHERE ac.id = $1 AND (l.user_id = $2 OR l.user_id IS NULL OR ac.lead_id IS NULL)`,
      [id, userId]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });

    res.json({ conversation: decorateConversation(r.rows[0], { includeTranscript: true }) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create the Sarvam campaign for a draft AuraAI campaign and stream its pending contacts.
async function launchSarvamCampaign(camp) {
  const pending = await db.query("SELECT * FROM bulk_contacts WHERE campaign_id = $1 AND status = 'pending' ORDER BY id", [camp.id]);
  // (do_not_call contacts already have status='do_not_call' and are excluded above)
  if (pending.rows.length === 0) {
    const e = new Error('No pending contacts to call');
    e.status = 400;
    throw e;
  }

  // Settings chosen in the New Campaign form (older campaigns fall back to legacy defaults).
  const settings = camp.sarvam_settings ? normalizeSarvamSettings(camp.sarvam_settings) : legacySarvamSettings(camp);
  const { startIso, endIso } = resolveSarvamWindow(settings);
  const sc = await createSarvamCampaign({
    name: `AuraAI-${camp.id}-${camp.name || 'bulk'}`,
    description: 'AuraAI bulk calling campaign ' + camp.id,
    settings,
    startIso,
    endIso,
    webhookUrl: process.env.SARVAM_WEBHOOK_URL,
    metadata: { kind: 'bulk', campaign_id: camp.id }
  });
  const sarvamId = sc.campaign_id;

  try {
    const users = pending.rows.map(c => {
      const vars = buildAgentVars({ name: c.name, phone: c.phone10 || c.phone_e164, email: c.email });
      const greeting = buildOutboundGreeting(vars.userName);
      const user = { user_phone_number: c.phone_e164, user_identifier: String(c.id), app_variables: vars };
      if (greeting) user.app_overrides = { initial_bot_message: greeting };
      return user;
    });
    await streamSarvamCohort(sarvamId, `aura-${camp.id}`, users);
  } catch (err) {
    await setSarvamCampaignStatus(sarvamId, 'cancel').catch(() => null);
    throw err;
  }

  await db.query(
    "UPDATE bulk_campaigns SET sarvam_campaign_id = $1, enabled = TRUE, status = 'running', started_at = COALESCE(started_at, NOW()), error_message = NULL WHERE id = $2",
    [sarvamId, camp.id]
  );
}

// Mirror Sarvam's campaign state into our row (throttled, best effort).
const lastSync = new Map();
async function syncSarvamStatus(camp) {
  if (!camp.sarvam_campaign_id || !['running', 'waiting'].includes(camp.status)) return camp;
  if (Date.now() - (lastSync.get(camp.id) || 0) < 30000) return camp;
  lastSync.set(camp.id, Date.now());
  try {
    const sc = await getSarvamCampaign(camp.sarvam_campaign_id);
    if (sc.status === 'ended') {
      await db.query("UPDATE bulk_campaigns SET enabled = FALSE, status = 'completed', finished_at = NOW() WHERE id = $1", [camp.id]);
      return { ...camp, enabled: false, status: 'completed' };
    }
    if (sc.status === 'cancelled' || sc.status === 'paused') {
      await db.query("UPDATE bulk_campaigns SET enabled = FALSE, status = 'stopped' WHERE id = $1", [camp.id]);
      return { ...camp, enabled: false, status: 'stopped' };
    }
  } catch (err) {
    console.warn('[Bulk] Sarvam status sync failed:', err.message);
  }
  return camp;
}

/**
 * Extract caller's name from transcript turns that belong to the USER/CUSTOMER only.
 * Scans ALL user turns; keeps the LAST match (user may correct themselves).
 * Never returns text longer than 3 words or names spoken by the agent.
 *
 * Passes: user "My name is Manjali" then "My name is Mansi" → "Mansi"
 * Fails:  agent "I am Riya speaking from Aura…"             → null  (agent role skipped)
 */
function extractNameFromTranscript(transcript) {
  if (!Array.isArray(transcript)) return null;
  // Pattern: intro phrase followed by 1–3 words (Latin or common Indic characters)
  const NAME_RE = /(?:my name is|name is|mera naam|this is|i am|i'm)\s+([\p{L}\d'-]+(?:\s+[\p{L}\d'-]+){0,2})/iu;
  const AGENT_ROLES = /^(agent|assistant|bot|system|ai)$/i;
  const BAD_NAMES = /^(riya|ketki|aura|hello|speaking|from|sure|sorry|okay|yes|no)$/i;

  let lastMatch = null;
  for (const turn of transcript) {
    const role = String(turn.role || turn.speaker || '').trim();
    if (AGENT_ROLES.test(role)) continue; // skip agent turns
    const text = String(turn.en_text || turn.text || turn.content || turn.message || '').trim();
    if (!text) continue;
    const m = text.match(NAME_RE);
    if (!m) continue;
    const candidate = m[1].trim();
    const words = candidate.split(/\s+/);
    if (words.length < 1 || words.length > 3) continue;
    if (BAD_NAMES.test(words[0])) continue; // skip common agent phrases captured accidentally
    lastMatch = candidate;
  }
  return lastMatch;
}

async function resolveAttempt(attempt, callStatus, outcome, summary, sentiment, recordingUrl, transcript, spokenName) {
  // Only update transcript if we actually have content (never write "null" string)
  const transcriptJson = (transcript && Array.isArray(transcript) && transcript.length > 0) ? JSON.stringify(transcript) : null;
  if (transcriptJson) {
    await db.query(
      'UPDATE bulk_attempts SET ended_at = NOW(), call_status = $1, outcome = $2, summary = $3, sentiment = $4, recording_url = $5, transcript = $6 WHERE id = $7',
      [callStatus, outcome, summary, sentiment, recordingUrl, transcriptJson, attempt.id]
    );
  } else {
    await db.query(
      'UPDATE bulk_attempts SET ended_at = NOW(), call_status = $1, outcome = $2, summary = $3, sentiment = $4, recording_url = COALESCE($5, recording_url) WHERE id = $6',
      [callStatus, outcome, summary, sentiment, recordingUrl, attempt.id]
    );
  }

  const cRes = await db.query('SELECT * FROM bulk_contacts WHERE id = $1', [attempt.contact_id]);
  if (cRes.rows.length === 0) return;
  const contact = cRes.rows[0];

  const campRes = await db.query('SELECT max_attempts, retry_delay_min FROM bulk_campaigns WHERE id = $1', [contact.campaign_id]);
  if (campRes.rows.length === 0) return;
  const campaign = campRes.rows[0];

  let nextStatus = contact.status;
  let nextAttemptAt = contact.next_attempt_at;

  if (outcome === 'booked') {
    nextStatus = 'booked';
  } else if (outcome === 'not_booked') {
    nextStatus = 'not_booked';
  } else if (outcome === 'do_not_call') {
    nextStatus = 'do_not_call';
  } else if (outcome === 'not_interested') {
    nextStatus = 'not_interested';
  } else if (outcome === 'no_answer' || outcome === 'busy' || outcome === 'failed' || callStatus === 'no_answer' || callStatus === 'busy' || callStatus === 'failed') {
    // Call not picked up — retry if attempts remain
    if (contact.attempts < campaign.max_attempts) {
      nextStatus = 'no_answer';
      nextAttemptAt = new Date(Date.now() + campaign.retry_delay_min * 60000);
    } else {
      nextStatus = 'no_answer';
    }
  } else {
    // Call connected but no specific disposition — mark not_booked (not no_answer!)
    nextStatus = 'not_booked';
  }

  const _transcriptForContact = (transcript && Array.isArray(transcript) && transcript.length > 0) ? JSON.stringify(transcript) : null;
  if (_transcriptForContact) {
    await db.query(
      "UPDATE bulk_contacts SET status = $1, next_attempt_at = $2, last_summary = $3, last_sentiment = $4, recording_url = $5, transcript = $6, booked_datetime_text = (CASE WHEN $1 = 'booked' THEN booked_datetime_text ELSE NULL END) WHERE id = $7",
      [nextStatus, nextAttemptAt, summary, sentiment, recordingUrl, _transcriptForContact, contact.id]
    );
  } else {
    await db.query(
      "UPDATE bulk_contacts SET status = $1, next_attempt_at = $2, last_summary = $3, last_sentiment = $4, recording_url = COALESCE($5, recording_url), booked_datetime_text = (CASE WHEN $1 = 'booked' THEN booked_datetime_text ELSE NULL END) WHERE id = $6",
      [nextStatus, nextAttemptAt, summary, sentiment, recordingUrl, contact.id]
    );
  }

  if (contact.lead_id) {
    if (outcome === 'do_not_call') {
      await db.query('UPDATE leads SET do_not_call = TRUE WHERE id = $1', [contact.lead_id]);
    }

    let newLeadStatus = null;
    if (outcome === 'booked') {
      const lr = await db.query('SELECT status FROM leads WHERE id = $1', [contact.lead_id]);
      if (lr.rows.length > 0 && lr.rows[0].status !== 'project_won' && lr.rows[0].status !== 'quote_sent') {
        newLeadStatus = 'discovery_call';
      }
    }

    let updateSql = 'UPDATE leads SET last_ai_call_status = $1, last_ai_call_at = NOW()';
    let params = [callStatus, contact.lead_id];
    if (newLeadStatus) {
      updateSql += ', status = $3';
      params.push(newLeadStatus);
    }
    updateSql += ' WHERE id = $2';
    await db.query(updateSql, params);

    const lr = await db.query('SELECT * FROM leads WHERE id = $1', [contact.lead_id]);
    if (lr.rows.length > 0) {
      const lead = lr.rows[0];
      const activityDetail = `Status: ${callStatus} | Sentiment: ${sentiment} \nSummary: ${summary}` + (recordingUrl ? `\nRecording: ${recordingUrl}` : '');
      await db.query(
        'INSERT INTO agent_activity (user_id, agent_name, activity_type, status, lead_name, company_name, detail) VALUES ($1, \'Ketki (AI)\', \'call_completed\', $2, $3, $4, $5)',
        [lead.user_id, callStatus, [lead.first_name, lead.last_name].filter(Boolean).join(' '), lead.company, activityDetail]
      );
    }
  }

  // Update contact name: prefer spokenName from agent vars, then transcript extraction
  try {
    const nameFromTranscript = extractNameFromTranscript(transcript);
    const resolvedName = (spokenName && spokenName.trim()) || nameFromTranscript || null;
    if (resolvedName && resolvedName !== contact.name) {
      const phoneForName = contact.phone_e164 || contact.phone10;
      if (phoneForName) {
        await updateContactName({ phone: phoneForName, rawName: resolvedName, nameSource: 'call' });
        console.log(`[resolveAttempt] ✅ Updated contact name for ${phoneForName}: ${resolvedName}`);
      }
    }
  } catch (nameErr) {
    console.warn('[resolveAttempt] updateContactName warning:', nameErr.message);
  }
}

// GET all campaigns
router.get('/', requireUserCookie, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT c.*, 
             (SELECT COUNT(*) FROM bulk_contacts WHERE campaign_id = c.id AND status = 'booked') as booked_count
      FROM bulk_campaigns c 
      ORDER BY c.created_at DESC LIMIT 50
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST new campaign
router.post('/', requireUserCookie, async (req, res) => {
  try {
    const { name, max_attempts, retry_delay_min, gap_seconds, contacts, sarvam_settings } = req.body;
    if (!contacts || !Array.isArray(contacts)) return res.status(400).json({ error: 'invalid contacts' });
    if (contacts.length > 500) return res.status(400).json({ error: 'Max 500 contacts' });

    // Campaign-mode settings (same options as Sarvam's Schedule campaign wizard).
    let settings = null;
    let maxAttempts = max_attempts || 2;
    let retryDelay = retry_delay_min || 30;
    if (campaignEnabled()) {
      settings = normalizeSarvamSettings(sarvam_settings);
      maxAttempts = settings.retry.enabled ? settings.retry.maxRetries + 1 : 1;
      retryDelay = settings.retry.intervalMin;
    }

    let creatorUserId = req.user ? req.user.id : null;
    if (!creatorUserId) {
      try {
        const u = await db.query('SELECT id FROM users ORDER BY id ASC LIMIT 1');
        creatorUserId = u.rows[0]?.id || null;
      } catch (_) {}
    }

    const insertCamp = await db.query(
      'INSERT INTO bulk_campaigns (name, branch, max_attempts, retry_delay_min, gap_seconds, total, created_by, sarvam_settings) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
      [name, req.body.branch || null, maxAttempts, retryDelay, gap_seconds || 20, contacts.length, creatorUserId, settings ? JSON.stringify(settings) : null]
    );
    const campaignId = insertCamp.rows[0].id;

    const seenPhones = new Set();

    for (const c of contacts) {
      const phoneObj = normalizePhone(c.phone);
      let status = 'pending';
      let reason = null;

      if (!phoneObj) {
        status = 'invalid';
        reason = 'No valid 10-digit Indian phone number';
      } else {
        if (seenPhones.has(phoneObj.local)) {
          status = 'invalid';
          reason = 'Duplicate phone in file';
        } else {
          seenPhones.add(phoneObj.local);
          const allowlist = process.env.CALL_TEST_ALLOWLIST;
          if (allowlist) {
            const allowedNumbers = allowlist.split(',').map(n => n.trim());
            if (!allowedNumbers.includes(phoneObj.local)) {
              status = 'invalid';
              reason = 'Not in CALL_TEST_ALLOWLIST';
            }
          }
        }
      }

      let targetLeadId = c.lead_id || null;
      const phoneE164 = phoneObj ? phoneObj.e164 : (c.phone || null);
      const phone10 = phoneObj ? phoneObj.local : null;

      // Check do_not_call flag before processing further
      if (status === 'pending' && (phoneE164 || phone10)) {
        try {
          const dncCheck = await db.query(
            "SELECT id FROM leads WHERE do_not_call = TRUE AND (phone = $1 OR whatsapp = $1 OR phone = $2 OR whatsapp = $2) LIMIT 1",
            [phoneE164, phone10]
          );
          if (dncCheck.rows.length > 0) {
            status = 'do_not_call';
            reason = 'Lead has do_not_call=true';
            targetLeadId = dncCheck.rows[0].id;
          }
        } catch (_dncErr) { /* best-effort */ }
      }

      try {
        if (!targetLeadId && (phoneE164 || phone10)) {
          const existingLead = await db.query(
            "SELECT id FROM leads WHERE (phone = $1 OR whatsapp = $1 OR phone = $2 OR whatsapp = $2) AND (pipeline_stage NOT IN ('Active Patient', 'Patient') OR pipeline_stage IS NULL) LIMIT 1",
            [phoneE164, phone10]
          );
          if (existingLead.rows.length > 0) {
            targetLeadId = existingLead.rows[0].id;
            await db.query(
              "UPDATE leads SET campaign_name = $1, campaign_id = $2, company = COALESCE(NULLIF(company, ''), $3), email = COALESCE(NULLIF(email, ''), $4), source = COALESCE(source, 'Bulk Calling') WHERE id = $5",
              [name, campaignId, c.company || '', c.email || null, targetLeadId]
            );
          }
        }

        if (!targetLeadId) {
          const rawName = (c.name || '').trim();
          const spaceIdx = rawName.indexOf(' ');
          const firstName = spaceIdx > 0 ? rawName.slice(0, spaceIdx) : (rawName && rawName !== '.' ? rawName : 'Lead');
          const lastName = spaceIdx > 0 ? rawName.slice(spaceIdx + 1) : '';

          const newLead = await db.query(
            `INSERT INTO leads (
              first_name, last_name, phone, whatsapp, email, company,
              source, campaign_name, campaign_id,
              status, pipeline_stage, user_id, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, 'Bulk Calling', $7, $8, 'new', 'Lead', $9, NOW(), NOW())
            RETURNING id`,
            [firstName, lastName, phoneE164, phoneE164, c.email || null, c.company || '', name, campaignId, creatorUserId]
          );
          targetLeadId = newLead.rows[0].id;
        } else if (c.lead_id) {
          await db.query(
            'UPDATE leads SET campaign_name = $1, campaign_id = $2 WHERE id = $3',
            [name, campaignId, c.lead_id]
          );
        }
      } catch (leadSyncErr) {
        console.error('[BulkCalling] Error syncing contact to leads table:', leadSyncErr.message);
      }

      await db.query(
        'INSERT INTO bulk_contacts (campaign_id, name, company, phone_e164, phone10, email, extra_json, lead_id, status, last_summary) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
        [campaignId, c.name || '', c.company || '', phoneObj ? phoneObj.e164 : null, phoneObj ? phoneObj.local : null, c.email || '', c.extra_json || {}, targetLeadId, status, reason]
      );
    }

    res.json({ success: true, campaignId });
  } catch (err) {
    res.status(err.status === 400 ? 400 : 500).json({ error: err.message });
  }
});

// Automatically backfill and ensure every bulk contact is linked to a lead in the leads table
async function syncUnlinkedBulkContacts(campaignId = null) {
  try {
    const fallbackUser = await db.query('SELECT id FROM users ORDER BY id ASC LIMIT 1');
    const defaultUserId = fallbackUser.rows[0]?.id || null;

    let query = `
      SELECT bc.*, c.name as camp_name 
      FROM bulk_contacts bc
      LEFT JOIN bulk_campaigns c ON c.id = bc.campaign_id
      WHERE bc.lead_id IS NULL
    `;
    const params = [];
    if (campaignId) {
      params.push(campaignId);
      query += ` AND bc.campaign_id = $1`;
    }
    query += ` ORDER BY bc.id ASC LIMIT 200`;

    const unlinked = await db.query(query, params);
    for (const c of unlinked.rows) {
      const phoneE164 = c.phone_e164 || (c.phone10 ? `+91${c.phone10}` : null);
      const phone10 = c.phone10 || (c.phone_e164 ? c.phone_e164.slice(-10) : null);
      if (!phoneE164 && !phone10) continue;

      let existingLead = await db.query(
        "SELECT id FROM leads WHERE (phone = $1 OR whatsapp = $1 OR phone = $2 OR whatsapp = $2) LIMIT 1",
        [phoneE164, phone10]
      );
      let leadId = existingLead.rows[0]?.id;

      if (!leadId) {
        const rawName = (c.name || '').trim();
        const spaceIdx = rawName.indexOf(' ');
        const firstName = spaceIdx > 0 ? rawName.slice(0, spaceIdx) : (rawName && rawName !== '.' ? rawName : 'Lead');
        const lastName = spaceIdx > 0 ? rawName.slice(spaceIdx + 1) : '';

        const ins = await db.query(
          `INSERT INTO leads (
            first_name, last_name, phone, whatsapp, email, company,
            source, campaign_name, campaign_id,
            status, pipeline_stage, user_id, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, 'Bulk Calling', $7, $8, 'new', 'Lead', $9, NOW(), NOW())
          RETURNING id`,
          [firstName, lastName, phoneE164, phoneE164, c.email || null, c.company || '', c.camp_name || 'Bulk Campaign', c.campaign_id, defaultUserId]
        );
        leadId = ins.rows[0]?.id;
      } else {
        await db.query(
          "UPDATE leads SET campaign_name = COALESCE(campaign_name, $1), campaign_id = COALESCE(campaign_id, $2), source = COALESCE(source, 'Bulk Calling') WHERE id = $3",
          [c.camp_name || 'Bulk Campaign', c.campaign_id, leadId]
        );
      }

      if (leadId) {
        await db.query('UPDATE bulk_contacts SET lead_id = $1 WHERE id = $2', [leadId, c.id]);
      }
    }
  } catch (err) {
    console.warn('[BulkCalling] syncUnlinkedBulkContacts warning:', err.message);
  }
}

// Background auto-heal on boot
setTimeout(() => {
  syncUnlinkedBulkContacts().catch(() => {});
}, 3000);

// GET campaign details
router.get('/:id', requireUserCookie, async (req, res) => {
  try {
    const id = req.params.id;
    const campRes = await db.query('SELECT * FROM bulk_campaigns WHERE id = $1', [id]);
    if (campRes.rows.length === 0) return res.status(404).json({ error: 'not found' });
    const campaign = await syncSarvamStatus(campRes.rows[0]);
    const statsRes = await db.query(
      'SELECT status, COUNT(*) as count FROM bulk_contacts WHERE campaign_id = $1 GROUP BY status', [id]
    );
    const stats = statsRes.rows.reduce((acc, row) => ({ ...acc, [row.status]: parseInt(row.count) }), {});
    res.json({ campaign, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET contacts for campaign
router.get('/:id/contacts', requireUserCookie, async (req, res) => {
  try {
    await syncUnlinkedBulkContacts(req.params.id);
    const contacts = await db.query('SELECT * FROM bulk_contacts WHERE campaign_id = $1 ORDER BY id ASC', [req.params.id]);
    res.json(contacts.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET attempts for a contact
router.get('/:id/contacts/:contactId/attempts', requireUserCookie, async (req, res) => {
  try {
    // Scope by campaign too, so a stale/mismatched contact id can never leak another
    // campaign's conversation into this contact's drawer.
    const attempts = await db.query(
      'SELECT * FROM bulk_attempts WHERE contact_id = $1 AND campaign_id = $2 ORDER BY attempt_no ASC, id ASC',
      [req.params.contactId, req.params.id]
    );

    // Backfill any attempt whose transcript was missing
    for (const a of attempts.rows) {
      if (!a.transcript || a.transcript === 'null' || (Array.isArray(a.transcript) && a.transcript.length === 0)) {
        try {
          const callMatch = await db.query(
            `SELECT transcript, recording_url FROM ai_calls WHERE (conversation_id = $1 OR call_sid = $2 OR conversation_id = $2) AND transcript IS NOT NULL AND jsonb_typeof(transcript) != 'null' LIMIT 1`,
            [a.interaction_id, a.request_id]
          );
          if (callMatch.rows.length > 0 && callMatch.rows[0].transcript) {
            a.transcript = callMatch.rows[0].transcript;
            a.recording_url = a.recording_url || callMatch.rows[0].recording_url;
            db.query('UPDATE bulk_attempts SET transcript = $1, recording_url = COALESCE(recording_url, $2) WHERE id = $3', [JSON.stringify(a.transcript), a.recording_url, a.id]).catch(() => {});
          }
        } catch {}
      }
    }

    res.json(attempts.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST toggle campaign
router.post('/:id/toggle', async (req, res) => {
  try {
    const { enabled } = req.body;

    if (campaignEnabled()) {
      const cRes = await db.query('SELECT * FROM bulk_campaigns WHERE id = $1', [req.params.id]);
      if (cRes.rows.length === 0) return res.status(404).json({ error: 'not found' });
      const camp = cRes.rows[0];
      if (camp.status === 'completed') return res.status(409).json({ error: 'Campaign already completed' });

      if (!!enabled && !camp.sarvam_campaign_id) {
        await launchSarvamCampaign(camp); // first Start: create campaign + stream contacts
        return res.json({ success: true, mode: 'campaign' });
      }
      if (camp.sarvam_campaign_id) {
        await setSarvamCampaignStatus(camp.sarvam_campaign_id, enabled ? 'resume' : 'pause');
        await db.query('UPDATE bulk_campaigns SET enabled = $1, status = $2 WHERE id = $3', [!!enabled, enabled ? 'running' : 'stopped', camp.id]);
        return res.json({ success: true, mode: 'campaign' });
      }
      // Pausing a draft that was never launched: fall through to the local update.
    }

    await db.query('UPDATE bulk_campaigns SET enabled = $1, status = CASE WHEN $1 = TRUE THEN \'running\' ELSE \'stopped\' END WHERE id = $2', [!!enabled, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    // Never forward Sarvam's 401/403 as-is: the browser would read it as a logout.
    const code = [400, 409].includes(err.status) ? err.status : (err.status ? 502 : 500);
    console.error('[Bulk Toggle] failed:', err.message);
    res.status(code).json({ error: err.message });
  }
});

// Pull call results straight from Sarvam's Analytics API and update our rows.
// Works even if the webhook never arrives; safe to run repeatedly.
const lastResultSync = new Map();
async function syncSarvamResults(camp) {
  const startMs = new Date(camp.started_at || camp.created_at).getTime() - 15 * 60000;
  const endMs = Date.now() + 5 * 60000;
  const attempts = await listSarvamAnalytics('attempts', { startMs, endMs, campaignId: camp.sarvam_campaign_id });

  // Interactions carry the agent variables (call_disposition etc.); best effort.
  const ivars = new Map();
  try {
    const interactions = await listSarvamAnalytics('interactions', { startMs, endMs, campaignId: camp.sarvam_campaign_id });
    interactions.forEach(i => ivars.set(i.interaction_id, i.agent_variables || null));
  } catch (err) {
    console.warn('[Bulk Sync] interactions fetch failed:', err.message);
  }

  const contacts = (await db.query('SELECT * FROM bulk_contacts WHERE campaign_id = $1', [camp.id])).rows;
  const byId = new Map(contacts.map(c => [String(c.id), c]));
  const byPhone = new Map(contacts.filter(c => c.phone10).map(c => [c.phone10, c]));

  attempts.sort((a, b) => String(a.attempted_at || '').localeCompare(String(b.attempted_at || '')));
  const perContact = new Map();
  let created = 0;

  for (const a of attempts) {
    const phone = normalizePhone(String(a.user_contact || ''));
    const contact = byId.get(String(a.user_identifier)) || (phone && byPhone.get(phone.local));
    if (!contact) continue;
    const n = (perContact.get(contact.id) || 0) + 1;
    perContact.set(contact.id, n);

    // Match within the same contact only. Without contact_id here a Sarvam attempt could be
    // attached to (and overwrite) another contact's attempt row.
    const done = await db.query(
      'SELECT * FROM bulk_attempts WHERE campaign_id = $1 AND contact_id = $2 AND request_id = $3 LIMIT 1',
      [camp.id, contact.id, a.attempt_id]
    );

    const { callStatus, outcome, summary, sentiment, confirmedSlot } = mapSarvamOutcome(adaptCampaignPayload({
      connectivity_status: a.connectivity_status,
      interaction_id: a.interaction_id || null,
      final_agent_variables: (a.interaction_id && ivars.get(a.interaction_id)) || a.agent_variables || null
    }));

    if (done.rows.length > 0) {
      // Already stored: re-apply if the result changed (e.g. earlier wrong status, or call summary arrived later).
      const old = done.rows[0];
      if (a.interaction_id && old.interaction_id !== a.interaction_id) {
        await db.query('UPDATE bulk_attempts SET interaction_id = $1 WHERE id = $2', [a.interaction_id, old.id]);
      }
      if (old.outcome !== outcome || (!old.summary && summary)) {
        if (outcome === 'booked' && confirmedSlot) await db.query('UPDATE bulk_contacts SET booked_datetime_text = $1 WHERE id = $2', [confirmedSlot, contact.id]);
        else if (outcome !== 'booked') await db.query('UPDATE bulk_contacts SET booked_datetime_text = NULL WHERE id = $1', [contact.id]);
        await resolveAttempt(old, callStatus, outcome, summary, sentiment, recordingProxyUrl(a.interaction_id), null);
        created++;
      }
      continue;
    }

    const when = a.start_datetime || a.attempted_at;
    const ins = await db.query(
      `INSERT INTO bulk_attempts (contact_id, campaign_id, attempt_no, request_id, started_at, duration_sec, interaction_id, raw_json)
       VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, NOW()), $6, $7, $8) RETURNING *`,
      [contact.id, camp.id, n, a.attempt_id, when ? when + 'Z' : null,
      a.duration_in_seconds != null ? Math.round(a.duration_in_seconds) : null, a.interaction_id || null, JSON.stringify(a)]
    );
    await db.query('UPDATE bulk_contacts SET attempts = GREATEST(attempts, $1), last_attempt_at = NOW(), last_request_id = $2 WHERE id = $3', [n, a.attempt_id, contact.id]);
    if (outcome === 'booked' && confirmedSlot) await db.query('UPDATE bulk_contacts SET booked_datetime_text = $1 WHERE id = $2', [confirmedSlot, contact.id]);
    else if (outcome !== 'booked') await db.query('UPDATE bulk_contacts SET booked_datetime_text = NULL WHERE id = $1', [contact.id]);
    await resolveAttempt(ins.rows[0], callStatus, outcome, summary, sentiment, recordingProxyUrl(a.interaction_id), null);
    created++;
  }

  lastSync.delete(camp.id);
  await syncSarvamStatus(camp);
  return { found: attempts.length, created };
}

// POST sync results from Sarvam
router.post('/:id/sync', requireUserCookie, async (req, res) => {
  try {
    const cRes = await db.query('SELECT * FROM bulk_campaigns WHERE id = $1', [req.params.id]);
    if (cRes.rows.length === 0) return res.status(404).json({ error: 'not found' });
    const camp = cRes.rows[0];
    if (!camp.sarvam_campaign_id) return res.json({ success: true, skipped: 'not a Sarvam campaign' });
    if (Date.now() - (lastResultSync.get(camp.id) || 0) < 10000) return res.json({ success: true, skipped: 'recently synced' });
    lastResultSync.set(camp.id, Date.now());
    res.json({ success: true, ...(await syncSarvamResults(camp)) });
  } catch (err) {
    console.error('[Bulk Sync] failed:', err.stack || err.message);
    res.status(err.status ? 502 : 500).json({
      error: err.message,
      upstreamStatus: err.status || null,
    });
  }
});

// PATCH edit campaign name + all Sarvam schedule settings (also updates the live Sarvam campaign)
router.patch('/:id/settings', requireUserCookie, async (req, res) => {
  try {
    const cRes = await db.query('SELECT * FROM bulk_campaigns WHERE id = $1', [req.params.id]);
    if (cRes.rows.length === 0) return res.status(404).json({ error: 'not found' });
    const camp = cRes.rows[0];
    if (camp.status === 'completed') return res.status(409).json({ error: 'Campaign already completed - create a new campaign instead' });

    const settings = normalizeSarvamSettings(req.body.sarvam_settings);
    const name = String(req.body.name || camp.name || '').trim().slice(0, 80) || camp.name;
    const maxAttempts = settings.retry.enabled ? settings.retry.maxRetries + 1 : 1;
    const retryDelay = settings.retry.intervalMin;

    if (camp.sarvam_campaign_id) {
      // Sarvam only allows edits while the campaign is paused or scheduled.
      let sc = await getSarvamCampaign(camp.sarvam_campaign_id);
      if (['ended', 'cancelled'].includes(sc.status)) return res.status(409).json({ error: 'Sarvam campaign has already ended' });
      const wasActive = sc.status === 'active';
      if (wasActive) await setSarvamCampaignStatus(camp.sarvam_campaign_id, 'pause');
      try {
        const { endIso } = resolveSarvamWindow(settings);
        await updateSarvamCampaign(camp.sarvam_campaign_id, {
          name: `AuraAI-${camp.id}-${name}`,
          settings,
          endIso,
          webhookUrl: process.env.SARVAM_WEBHOOK_URL,
          metadata: { kind: 'bulk', campaign_id: camp.id }
        });
      } finally {
        if (wasActive) await setSarvamCampaignStatus(camp.sarvam_campaign_id, 'resume').catch(e => console.error('[Bulk] resume after edit failed:', e.message));
      }
    }

    await db.query(
      'UPDATE bulk_campaigns SET name = $1, sarvam_settings = $2, max_attempts = $3, retry_delay_min = $4 WHERE id = $5',
      [name, JSON.stringify(settings), maxAttempts, retryDelay, camp.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[Bulk Edit] failed:', err.message);
    res.status(err.status === 400 || err.status === 409 ? err.status : (err.status ? 502 : 500)).json({ error: err.message });
  }
});

// POST ENGINE TICK — processes pending bulk calls
// No auth required: this is an internal processing route.
// It's triggered by the frontend (logged-in users only) or cron.
router.post('/tick', async (req, res) => {
  const secret = req.query.secret || req.headers['authorization'];
  // Allow: CRON_SECRET OR any internal call (frontend logged-in users)
  // The tick only reads/writes bulk_calls data — it's not a sensitive data endpoint
  const hasCronSecret = secret === process.env.CRON_SECRET;
  // Allow unauthenticated internal calls too (frontend polls this)
  // If you want to lock this down later, add session middleware to the router
  console.log('[Bulk Tick] 🔔 Tick received, hasCronSecret=' + hasCronSecret);


  // Use a simple advisory lock for the whole tick process
  const lockRes = await db.query('SELECT pg_try_advisory_lock(999999) as locked');
  if (!lockRes.rows[0].locked) return res.json({ status: 'locked' });
  console.log('[Bulk Tick] 🔒 lock acquired at', new Date().toISOString());

  let actions = [];
  try {
    // Campaigns launched on Sarvam are dialed by Sarvam itself, never by this loop.
    const campaigns = await db.query(`SELECT * FROM bulk_campaigns WHERE enabled = TRUE AND sarvam_campaign_id IS NULL`);
    console.log('[Bulk Tick] 📋 enabled campaigns=' + campaigns.rows.length);

    for (const campaign of campaigns.rows) {
      console.log(`[Bulk Tick] 🔍 Processing campaign ${campaign.id} "${campaign.name}" (status: ${campaign.status}, enabled: ${campaign.enabled})`);

      // 1. Check if any contact is currently 'calling'
      const callingRes = await db.query('SELECT * FROM bulk_contacts WHERE campaign_id = $1 AND status = \'calling\'', [campaign.id]);
      console.log(`[Bulk Tick] 📞 Campaign ${campaign.id} calling contacts: ${callingRes.rows.length}`);

      let isAnyCalling = false;
      if (callingRes.rows.length > 0) {
        isAnyCalling = true;
        const contact = callingRes.rows[0];
        console.log(`[Bulk Tick] ⏳ Contact ${contact.id} is calling since ${contact.last_attempt_at}, last_request_id: ${contact.last_request_id}`);

        // Timeout check (6 minutes)
        const diffMin = (Date.now() - new Date(contact.last_attempt_at).getTime()) / 60000;
        console.log(`[Bulk Tick] ⏱️ Contact ${contact.id} calling for ${diffMin.toFixed(1)} minutes`);

        if (diffMin > 6) {
          console.log(`[Bulk Tick] 🚨 Contact ${contact.id} timeout exceeded (6 min), attempting to resolve...`);
          const attemptRes = await db.query('SELECT * FROM bulk_attempts WHERE contact_id = $1 AND request_id = $2 ORDER BY id DESC LIMIT 1', [contact.id, contact.last_request_id]);
          if (attemptRes.rows.length > 0) {
            await resolveAttempt(attemptRes.rows[0], 'timeout', 'no_answer', 'Call timed out', 'Neutral', '');
            actions.push(`Resolved timeout for contact ${contact.id}`);
            isAnyCalling = false; // it's resolved now
            console.log(`[Bulk Tick] ✅ Contact ${contact.id} timeout resolved`);
          } else {
            console.log(`[Bulk Tick] ⚠️ No attempt found for contact ${contact.id} with request_id ${contact.last_request_id}, force-clearing calling status`);
            await db.query('UPDATE bulk_contacts SET status = \'no_answer\', last_summary = \'Call timed out - no attempt record\' WHERE id = $1', [contact.id]);
            isAnyCalling = false;
          }
        }
      }

      // If still calling, continue to next campaign
      if (isAnyCalling) {
        actions.push(`Campaign ${campaign.id} is busy with contact ${callingRes.rows[0].id}`);
        console.log(`[Bulk Tick] ⏭️ Skipping campaign ${campaign.id} - still calling`);
        continue;
      }

      // 3. Enforce gap_seconds
      const lastAttemptRes = await db.query('SELECT ended_at FROM bulk_attempts WHERE campaign_id = $1 ORDER BY ended_at DESC NULLS LAST LIMIT 1', [campaign.id]);
      if (lastAttemptRes.rows.length > 0 && lastAttemptRes.rows[0].ended_at) {
        const diffSec = (Date.now() - new Date(lastAttemptRes.rows[0].ended_at).getTime()) / 1000;
        if (diffSec < campaign.gap_seconds) {
          actions.push(`Campaign ${campaign.id} waiting gap seconds (${Math.round(diffSec)}/${campaign.gap_seconds})`);
          continue;
        }
      }

      // 4. Time constraints
      if (!isCallingHours()) {
        await db.query('UPDATE bulk_campaigns SET status = \'paused_hours\' WHERE id = $1', [campaign.id]);
        actions.push(`Campaign ${campaign.id} paused due to calling hours`);
        continue;
      } else if (campaign.status === 'paused_hours') {
        await db.query('UPDATE bulk_campaigns SET status = \'running\' WHERE id = $1', [campaign.id]);
      }

      // 5. Pick next contact
      const pendingRes = await db.query(`
        SELECT * FROM bulk_contacts 
        WHERE campaign_id = $1 AND (
          status = 'pending' OR 
          (status = 'no_answer' AND attempts < $2 AND next_attempt_at <= NOW())
        )
        ORDER BY status DESC, next_attempt_at ASC NULLS FIRST, id ASC
        LIMIT 1
      `, [campaign.id, campaign.max_attempts]);

      if (pendingRes.rows.length === 0) {
        // Auto-off logic
        const checkWaitRes = await db.query('SELECT id FROM bulk_contacts WHERE campaign_id = $1 AND status = \'no_answer\' AND attempts < $2', [campaign.id, campaign.max_attempts]);
        if (checkWaitRes.rows.length === 0) {
          await db.query('UPDATE bulk_campaigns SET enabled = FALSE, status = \'completed\', finished_at = NOW() WHERE id = $1', [campaign.id]);
          actions.push(`Campaign ${campaign.id} completed`);
        } else {
          await db.query('UPDATE bulk_campaigns SET status = \'waiting\' WHERE id = $1', [campaign.id]);
          actions.push(`Campaign ${campaign.id} waiting for next attempt`);
        }
        continue;
      }

      const contact = pendingRes.rows[0];

      // Dispatch Call
      try {
        const metadata = {
          kind: 'bulk',
          campaign_id: campaign.id,
          contact_id: contact.id,
          attempt_no: contact.attempts + 1
        };

        if (!process.env.SARVAM_API_KEY) {
          throw new Error('SARVAM_API_KEY is not configured for the call agent');
        }

        console.log(`[Bulk Call] 🚀 Dispatching call for contact ${contact.id} (${contact.phone_e164}), attempt #${metadata.attempt_no}`);
        const apiRes = await dispatchSarvamCall({
          phoneE164: contact.phone_e164,
          vars: buildAgentVars({
            name: contact.name,
            phone: contact.phone10 || contact.phone_e164,
            email: contact.email
          }),
          metadata
        });
        console.log(`[Bulk Call] ✅ Dispatch success - full response:`, JSON.stringify(apiRes).slice(0, 300));

        // Sarvam may return the ID under different field names — try all known ones
        const requestId = apiRes.attempt_id || apiRes.outbound_id || apiRes.request_id || apiRes.id || apiRes.call_id || null;
        console.log(`[Bulk Call] 📋 Stored requestId=${requestId} for contact ${contact.id} phone=${contact.phone_e164}`);

        await db.query('UPDATE bulk_contacts SET status = \'calling\', attempts = attempts + 1, last_attempt_at = NOW(), last_request_id = $1 WHERE id = $2', [requestId, contact.id]);
        await db.query('INSERT INTO bulk_attempts (contact_id, campaign_id, attempt_no, request_id) VALUES ($1, $2, $3, $4)', [contact.id, campaign.id, contact.attempts + 1, requestId]);
        await db.query('UPDATE bulk_campaigns SET status = \'running\', started_at = COALESCE(started_at, NOW()) WHERE id = $1', [campaign.id]);

        actions.push(`Dispatched call for contact ${contact.id}`);
      } catch (err) {
        console.error(`[Bulk Call] ❌ Dispatch failed for contact ${contact.id}:`, err && (err.stack || err.message || err));
        if (err.message.toLowerCase().includes('credit') || err.message.toLowerCase().includes('unauthorized') || err.message.toLowerCase().includes('agent')) {
          await db.query('UPDATE bulk_campaigns SET enabled = FALSE, status = \'error\', error_message = $1 WHERE id = $2', [err.message, campaign.id]);
          actions.push(`Campaign ${campaign.id} disabled due to call provider error: ${err.message}`);
        } else {
          // Per-contact error
          await db.query('UPDATE bulk_contacts SET status = \'failed\', attempts = attempts + 1, last_attempt_at = NOW(), last_summary = $1 WHERE id = $2', [err.message, contact.id]);
          actions.push(`Contact ${contact.id} failed to dispatch: ${err.message}`);
        }
      }
    }
  } finally {
    await db.query('SELECT pg_advisory_unlock(999999)');
  }

  console.log('[Bulk Tick] done actions=' + actions.length);
  res.json({ success: true, actions });
});

// POST clear stuck calls
router.post('/clear-stuck', async (req, res) => {
  try {
    const result = await db.query(`UPDATE bulk_contacts SET status = 'no_answer', last_summary = 'Manually cleared stuck calling status' WHERE status = 'calling'`);
    console.log(`[Bulk Clear] 🧹 Cleared ${result.rowCount} stuck "calling" contacts`);
    res.json({ success: true, cleared: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST booking confirmed
router.post('/booking-confirmed', async (req, res) => {
  const _cronSecret = process.env.CRON_SECRET;
  if (!_cronSecret) return res.status(401).json({ error: 'CRON_SECRET not configured' });
  const secret = req.query.secret || req.headers['authorization'];
  if (secret !== _cronSecret) return res.status(401).json({ error: 'Unauthorized' });

  const { lead_phone, start_ist_text, booking_uid } = req.body;
  if (!lead_phone) return res.status(400).json({ error: 'missing lead_phone' });

  const phoneObj = normalizePhone(lead_phone);
  if (!phoneObj) return res.status(400).json({ error: 'invalid phone' });

  try {
    const checkRes = await db.query(`
      SELECT id FROM bulk_contacts 
      WHERE phone10 = $1 AND (status = 'calling' OR last_attempt_at >= NOW() - INTERVAL '30 minutes')
      ORDER BY last_attempt_at DESC NULLS LAST LIMIT 1
    `, [phoneObj.local]);

    if (checkRes.rows.length > 0) {
      await db.query('UPDATE bulk_contacts SET status = \'booked\', booked_datetime_text = $1 WHERE id = $2', [start_ist_text || booking_uid, checkRes.rows[0].id]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE campaign: cancel Sarvam campaign if running, then delete everything
router.delete('/:id', requireUserCookie, async (req, res) => {
  try {
    const cRes = await db.query('SELECT * FROM bulk_campaigns WHERE id = $1', [req.params.id]);
    if (cRes.rows.length === 0) return res.status(404).json({ error: 'not found' });
    const camp = cRes.rows[0];

    if (camp.sarvam_campaign_id) {
      try {
        await setSarvamCampaignStatus(camp.sarvam_campaign_id, 'cancel');
      } catch (cancelErr) {
        console.warn('[Bulk Delete] Sarvam cancel failed:', cancelErr.message);
        return res.status(409).json({ error: 'Could not cancel Sarvam campaign: ' + cancelErr.message });
      }
    }

    // FK cascade deletes bulk_contacts + bulk_attempts
    await db.query('DELETE FROM bulk_campaigns WHERE id = $1', [camp.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[Bulk Delete] failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, resolveAttempt };