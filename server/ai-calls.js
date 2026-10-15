const express = require('express');
const db = require('./db');
const { normalizePhone, canCall } = require('./call-utils');
const { dispatchSarvamCall } = require('./sarvam');

const router = express.Router();

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

    const phoneObj = normalizePhone(lead.phone || lead.whatsapp);
    const leadName = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.name || 'none';

    const sarvamRes = await dispatchSarvamCall({
      phoneE164: check.e164,
      vars: {
        callType: 'outbound_lead',
        userName: leadName,
        userPhone: phoneObj ? phoneObj.local : 'none',
        userEmail: lead.email || 'none',
        serviceType: 'Dermatologist consultation'
      },
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
        VALUES ($1, 'Aarti (AI)', 'call_started', 'queued', $2, $3, $4)
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

module.exports = { router };
