const express = require('express');
const db = require('./db');
const { mapSarvamOutcome } = require('./sarvam');

const router = express.Router();

// WEBHOOK — Sarvam posts here once per attempt. There is no signature header,
// so the URL is protected with a ?secret= query param.
router.post('/', async (req, res) => {
  try {
    const secret = process.env.SARVAM_WEBHOOK_SECRET;
    if (!secret || req.query.secret !== secret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const payload = req.body || {};
    console.log('[Sarvam Webhook] attempt_id:', payload.attempt_id, 'status:', payload.status);

    const metadata = payload.webhook_config?.metadata || {};

    // Single-lead (Start AI Call: Leads / Pipeline) resolution.
    if (metadata.kind === 'single') {
      const leadRes = await db.query('SELECT * FROM leads WHERE id = $1', [metadata.lead_id]);
      if (leadRes.rows.length === 0) {
        return res.status(200).json({ success: true });
      }
      const lead = leadRes.rows[0];

      const { callStatus, outcome, summary, confirmedSlot } = mapSarvamOutcome(payload);

      let newLeadStatus = lead.status;
      if (outcome === 'booked' && lead.status !== 'project_won' && lead.status !== 'quote_sent') {
        newLeadStatus = 'discovery_call';
      }

      await db.query(`
        UPDATE leads
        SET last_ai_call_status = $1,
            last_ai_call_at = NOW(),
            do_not_call = CASE WHEN $2 = TRUE THEN TRUE ELSE do_not_call END,
            status = $3
        WHERE id = $4
      `, [callStatus, outcome === 'do_not_call', newLeadStatus, lead.id]);

      const detail = `Status: ${callStatus} | Outcome: ${outcome}\nSummary: ${summary}` + (confirmedSlot ? `\nSlot: ${confirmedSlot}` : '');

      await db.query(`
        INSERT INTO agent_activity (user_id, agent_name, activity_type, status, lead_name, company_name, detail)
        VALUES ($1, 'Aarti (AI)', 'call_completed', $2, $3, $4, $5)
      `, [lead.user_id, callStatus, [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.name || 'Lead', lead.company, detail]);

      return res.status(200).json({ success: true });
    }

    if (metadata.kind !== 'bulk') {
      return res.status(200).json({ success: true });
    }

    // Find the matching attempt by attempt_id (stored as request_id), else contact + attempt_no.
    let attempt = null;
    const byRequest = await db.query(
      'SELECT * FROM bulk_attempts WHERE request_id = $1 ORDER BY id DESC LIMIT 1',
      [payload.attempt_id]
    );
    if (byRequest.rows.length > 0) {
      attempt = byRequest.rows[0];
    } else if (metadata.contact_id != null && metadata.attempt_no != null) {
      const byMeta = await db.query(
        'SELECT * FROM bulk_attempts WHERE contact_id = $1 AND attempt_no = $2 ORDER BY id DESC LIMIT 1',
        [metadata.contact_id, metadata.attempt_no]
      );
      if (byMeta.rows.length > 0) attempt = byMeta.rows[0];
    }

    if (!attempt) {
      return res.status(200).json({ success: true });
    }

    const { callStatus, outcome, summary, confirmedSlot } = mapSarvamOutcome(payload);

    if (confirmedSlot) {
      await db.query(
        'UPDATE bulk_contacts SET booked_datetime_text = $1 WHERE id = $2',
        [confirmedSlot, attempt.contact_id]
      );
    }

    const { resolveAttempt } = require('./bulk-calling');
    await resolveAttempt(attempt, callStatus, outcome, summary, 'Neutral', '');

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[Sarvam Webhook Error]:', err);
    return res.status(200).json({ success: false, error: err.message });
  }
});

module.exports = { router };
