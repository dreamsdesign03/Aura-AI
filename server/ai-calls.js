const express = require('express');
const db = require('./db');
const { canCall } = require('./call-utils');
const { dispatchSarvamCall, buildAgentVars, listSarvamAnalytics, adaptCampaignPayload, mapSarvamOutcome } = require('./sarvam');
const { handleDirectCallWebhook } = require('./sarvam-webhook');

const router = express.Router();

// In-memory rate limiter for sync endpoint
let lastAiCallsSyncAt = 0;
const AI_CALLS_SYNC_MIN_INTERVAL_MS = 10000;

// POST /api/ai-calls — single-lead call (Sarvam AI or Plivo Telephony).
router.post('/', async (req, res) => {
  try {
    const { leadId, callMethod = 'sarvam', agentType = 'makeup_artist', appId } = req.body || {};
    console.log('[Call Request] leadId=' + leadId + ' callMethod=' + callMethod + ' agentType=' + agentType + ' appId=' + (appId || 'default'));

    if (!leadId) return res.status(400).json({ success: false, error: 'leadId required' });

    const leadResult = await db.query('SELECT * FROM leads WHERE id = $1', [leadId]);
    console.log('[Call Request] lead lookup rows=' + leadResult.rows.length);
    if (leadResult.rows.length === 0) return res.status(404).json({ success: false, error: 'Lead not found' });
    const lead = leadResult.rows[0];

    const check = canCall(lead);
    if (!check.ok) {
      console.log('[Call Request] blocked: ' + check.reason);
      return res.status(400).json({ success: false, error: check.reason });
    }
    console.log('[Call Request] canCall ok');

    const leadName = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.name || 'none';

    // ── 1. PLIVO DIRECT TELEPHONY CALL ───────────────────────────────
    if (callMethod === 'plivo') {
      const plivo = require('./plivo');
      const creds = plivo.getPlivoCredentials();
      if (!creds.isConfigured) {
        return res.status(400).json({
          success: false,
          error: 'Plivo credentials are not configured yet (PLIVO_AUTH_ID / PLIVO_AUTH_TOKEN / PLIVO_CALLER_ID).'
        });
      }

      const rawProto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.get('host') || 'aura-ai-six-beta.vercel.app';
      const hostUrl = host.includes('localhost') ? 'https://aura-ai-six-beta.vercel.app' : `${rawProto}://${host}`;

      const plivoResult = await plivo.dispatchPlivoCall({
        to: check.e164,
        from: creds.callerId,
        conversationType: 'lead_outreach',
        doctor: 'Vishw (Skinnonest)',
        branch: lead.city || lead.branch || 'Vadodara',
        hostUrl,
      });

      const inserted = await db.query(
        `INSERT INTO ai_calls (lead_id, conversation_id, call_sid, from_phone, to_phone, lead_name, company_name, status, booking_type, provider, direction, started_at)
         VALUES ($1, $2, $2, $3, $4, $5, $6, 'ringing', 'single_call', 'plivo', 'outbound', NOW())
         RETURNING *`,
        [lead.id, plivoResult.callUuid, plivoResult.from, plivoResult.to, leadName === 'none' ? 'Lead' : leadName, lead.company]
      );

      await db.query(`
        UPDATE leads
        SET last_ai_call_status = 'ringing', last_ai_call_at = NOW(), last_ai_call_request_id = $1
        WHERE id = $2
      `, [plivoResult.callUuid, lead.id]);

      if (lead.user_id != null) {
        await db.query(`
          INSERT INTO agent_activity (user_id, agent_name, activity_type, status, lead_name, company_name, detail)
          VALUES ($1, 'Plivo Voice', 'call_started', 'ringing', $2, $3, $4)
        `, [lead.user_id, leadName === 'none' ? 'Lead' : leadName, lead.company, `Plivo direct call dispatched to ${check.e164}`]);
      }

      return res.json({
        success: true,
        callMethod: 'plivo',
        requestId: plivoResult.callUuid,
        call: inserted.rows[0]
      });
    }

    // ── 2. SARVAM AI VOICE CALL ──────────────────────────────────────
    if (!process.env.SARVAM_API_KEY && !process.env.SARVAM_SAMVAAD_API_KEY) {
      return res.status(500).json({ success: false, error: 'SARVAM_API_KEY is not configured' });
    }

    const resolvedAgentType = agentType || (appId === 'Misha-Skinn-4e9816f8-ead9' ? 'makeup_artist' : 'customer');
    const isMisha = resolvedAgentType === 'makeup_artist' || appId === 'Misha-Skinn-4e9816f8-ead9';
    const agentAppId = isMisha ? 'Misha-Skinn-4e9816f8-ead9' : (appId || process.env.SARVAM_APP_ID);
    const agentDisplayName = isMisha ? 'Misha (Skinnonest AI)' : 'Ketki (AI)';

    const sarvamRes = await dispatchSarvamCall({
      phoneE164: check.e164,
      agentType: resolvedAgentType,
      appId: agentAppId,
      vars: buildAgentVars({
        name: [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.name,
        phone: lead.phone || lead.whatsapp,
        email: lead.email,
        city: lead.city,
        agentType: resolvedAgentType
      }),
      metadata: {
        kind: 'single',
        lead_id: String(lead.id),
        agent_type: resolvedAgentType,
        agent_name: agentDisplayName,
        app_id: agentAppId
      }
    });

    const requestId = sarvamRes.attempt_id;
    console.log('[AI Call] dispatched attempt_id=' + requestId + ' agent=' + agentDisplayName);

    await db.query(`
      UPDATE leads
      SET last_ai_call_status = 'queued', last_ai_call_at = NOW(), last_ai_call_request_id = $1
      WHERE id = $2
    `, [requestId, lead.id]);

    if (lead.user_id != null) {
      await db.query(`
        INSERT INTO agent_activity (user_id, agent_name, activity_type, status, lead_name, company_name, detail)
        VALUES ($1, $2, 'call_started', 'queued', $3, $4, $5)
      `, [lead.user_id, agentDisplayName, leadName === 'none' ? 'Lead' : leadName, lead.company, `AI call (${agentDisplayName}) dispatched to ${check.e164}`]);
      console.log('[AI Call] agent_activity INSERT done');
    }

    return res.json({
      success: true,
      callMethod: 'sarvam',
      agentName: agentDisplayName,
      agentType: resolvedAgentType,
      requestId
    });
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
