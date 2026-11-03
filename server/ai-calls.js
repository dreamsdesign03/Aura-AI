const express = require('express');
const db = require('./db');
const { canCall } = require('./call-utils');
const { dispatchSarvamCall, buildAgentVars, listSarvamAnalytics, adaptCampaignPayload, mapSarvamOutcome } = require('./sarvam');
const { handleDirectCallWebhook } = require('./sarvam-webhook');

const router = express.Router();

// In-memory rate limiter for sync endpoint
let lastAiCallsSyncAt = 0;
const AI_CALLS_SYNC_MIN_INTERVAL_MS = 10000;

// POST /api/ai-calls — single-lead "Start AI Call". Sarvam only.
router.post('/', async (req, res) => {
  try {
    const { leadId } = req.body || {};
    console.log('[AI Call] request leadId=' + leadId);

    if (!leadId) return res.status(400).json({ success: false, error: 'leadId required' });

    if (!process.env.SARVAM_API_KEY) {
      return res.status(500).json({ success: false, error: 'SARVAM_API_KEY is not configured' });
    }

    const leadResult = await db.query('SELECT * FROM leads WHERE id = $1', [leadId]);
    console.log('[AI Call] lead lookup rows=' + leadResult.rows.length);
    if (leadResult.rows.length === 0) return res.status(404).json({ success: false, error: 'Lead not found' });
    const lead = leadResult.rows[0];

    const check = canCall(lead);
    if (!check.ok) {
      console.log('[AI Call] blocked: ' + check.reason);
      return res.status(400).json({ success: false, error: check.reason });
    }
    console.log('[AI Call] canCall ok');

    const leadName = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.name || 'none';

    const sarvamRes = await dispatchSarvamCall({
      phoneE164: check.e164,
      vars: buildAgentVars({
        name: [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.name,
        phone: lead.phone || lead.whatsapp,
        email: lead.email
      }),
      metadata: { kind: 'single', lead_id: String(lead.id) }
    });

    const requestId = sarvamRes.attempt_id;
    console.log('[AI Call] dispatched attempt_id=' + requestId);

    await db.query(`
      UPDATE leads
      SET last_ai_call_status = 'queued', last_ai_call_at = NOW(), last_ai_call_request_id = $1
      WHERE id = $2
    `, [requestId, lead.id]);
    console.log('[AI Call] leads UPDATE done');

    if (lead.user_id != null) {
      await db.query(`
        INSERT INTO agent_activity (user_id, agent_name, activity_type, status, lead_name, company_name, detail)
        VALUES ($1, 'Ketki (AI)', 'call_started', 'queued', $2, $3, $4)
      `, [lead.user_id, leadName === 'none' ? 'Lead' : leadName, lead.company, `AI call dispatched to ${check.e164}`]);
      console.log('[AI Call] agent_activity INSERT done');
    } else {
      console.log('[AI Call] skipped agent_activity insert, lead.user_id is null for lead ' + lead.id);
    }

    return res.json({ success: true, requestId });
  } catch (err) {
    console.error('[AI Call] error:', err && (err.stack || err.message || err));
    if (err && err.status) {
      return res.status(502).json({ success: false, error: err.message, upstreamStatus: err.status });
    }
    return res.status(500).json({ success: false, error: (err && err.message) || 'Internal server error' });
  }
});

// POST /api/ai-calls/sync — reliability fallback to pull recent Sarvam calls not linked to bulk campaigns
// Requires logged-in user (cookie auth). Rate-limited to once per 10s.
router.post('/sync', async (req, res) => {
  try {
    // Check auth via cookie (same as bulk-calling requireUserCookie)
    const match = /(?:^|;\s*)aura_user_email=([^;]+)/.exec(req.headers.cookie || '');
    if (!match) return res.status(401).json({ error: 'Unauthenticated' });
    const u = await db.query('SELECT id FROM users WHERE email = $1', [decodeURIComponent(match[1])]);
    if (u.rows.length === 0) return res.status(401).json({ error: 'Unauthenticated' });

    // Rate limit: once per 10s
    const now = Date.now();
    if (now - lastAiCallsSyncAt < AI_CALLS_SYNC_MIN_INTERVAL_MS) {
      return res.json({ success: true, skipped: 'rate_limited', message: 'Sync recently performed, please wait' });
    }
    lastAiCallsSyncAt = now;

    // Fetch attempts from Sarvam Analytics for the last 24h (no campaignId filter)
    const endMs = now;
    const startMs = now - 24 * 60 * 60 * 1000;
    const attempts = await listSarvamAnalytics('attempts', { startMs, endMs });

    // Also fetch interactions for agent variables (like bulk sync does)
    const ivars = new Map();
    try {
      const interactions = await listSarvamAnalytics('interactions', { startMs, endMs });
      interactions.forEach(i => ivars.set(i.interaction_id, i.agent_variables || null));
    } catch (err) {
      console.warn('[AI Calls Sync] interactions fetch failed:', err.message);
    }

    // Skip attempts already in ai_calls (by conversation_id / call_sid)
    const existingIds = await db.query(
      'SELECT conversation_id, call_sid FROM ai_calls WHERE conversation_id IS NOT NULL OR call_sid IS NOT NULL'
    );
    const existingSet = new Set();
    for (const row of existingIds.rows) {
      if (row.conversation_id) existingSet.add(row.conversation_id);
      if (row.call_sid) existingSet.add(row.call_sid);
    }

    let processed = 0;
    for (const a of attempts) {
      const interactionId = a.interaction_id || null;
      const requestId = a.attempt_id || interactionId;
      
      // Skip if already in ai_calls
      if (interactionId && existingSet.has(interactionId)) continue;
      if (requestId && existingSet.has(requestId)) continue;

      // Build payload for handleDirectCallWebhook using adaptCampaignPayload (like bulk sync)
      const payload = adaptCampaignPayload({
        ...a,
        connectivity_status: a.connectivity_status,
        interaction_id: interactionId,
        final_agent_variables: (interactionId && ivars.get(interactionId)) || a.agent_variables || null
      });

      try {
        await handleDirectCallWebhook(payload);
        processed++;
      } catch (err) {
        console.warn('[AI Calls Sync] handleDirectCallWebhook failed for attempt', requestId, err.message);
      }
    }

    res.json({ success: true, found: attempts.length, processed });
  } catch (err) {
    console.error('[AI Calls Sync] error:', err);
    res.status(500).json({ error: err.message || 'Sync failed' });
  }
});

module.exports = { router };
