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
