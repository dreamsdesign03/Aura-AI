const express = require('express');
const db = require('./db');
const { mapSarvamOutcome, adaptCampaignPayload } = require('./sarvam');
const { normalizePhone } = require('./call-utils');
const { resolveAttempt } = require('./bulk-calling');

const router = express.Router();

function recordingProxyUrl(interactionId) {
  if (!interactionId) return null;
  const base = String(process.env.PUBLIC_APP_URL || '').replace(/\/$/, '');
  return `${base}/api/bulk-calling/calls/recording?iid=${encodeURIComponent(interactionId)}`;
}

async function handleCampaignWebhook(campaignId, payload) {
  let contact = null;

  // 1. Try matching by integer user_identifier
  const cid = parseInt(payload.user_identifier, 10);
  if (Number.isInteger(cid) && !isNaN(cid)) {
    const r = await db.query('SELECT * FROM bulk_contacts WHERE id = $1 AND campaign_id = $2', [cid, campaignId]);
    contact = r.rows[0] || null;
  }

  // 2. Try matching by phone number (last 10 digits)
  const rawPhone = payload.user_phone_number || payload.phone_number || payload.user_config?.user_phone_number || '';
  if (!contact && rawPhone) {
    const p10 = String(rawPhone).replace(/\D/g, '').slice(-10);
    if (p10.length === 10) {
      const r = await db.query(
        'SELECT * FROM bulk_contacts WHERE campaign_id = $1 AND (phone10 LIKE $2 OR phone LIKE $2) ORDER BY id LIMIT 1',
        [campaignId, `%${p10}`]
      );
      contact = r.rows[0] || null;
    }
  }

  // 3. Try matching by custom metadata / tags if available
  if (!contact && payload.contact_id) {
    const r = await db.query('SELECT * FROM bulk_contacts WHERE id = $1 AND campaign_id = $2', [payload.contact_id, campaignId]);
    contact = r.rows[0] || null;
  }

  if (!contact) {
    console.log(`[Sarvam webhook] No contact matched for campaign=${campaignId}, phone=${rawPhone}, attempt=${payload.attempt_id || payload.interaction_id}`);
    return;
  }

  const { callStatus, outcome, summary, confirmedSlot, sentiment } = mapSarvamOutcome(adaptCampaignPayload(payload));
  const interactionId = payload.interaction_id || null;
  const requestId = payload.attempt_id || interactionId || `att-${Date.now()}`;
  const recUrl = recordingProxyUrl(interactionId);

  // Check if attempt exists for this contact & attempt_no or interaction_id
  const existing = await db.query(
    'SELECT * FROM bulk_attempts WHERE campaign_id = $1 AND (request_id = $2 OR interaction_id = $3) LIMIT 1',
    [campaignId, requestId, interactionId]
  );

  let attempt = existing.rows[0];
  const attemptNo = (Number(payload.retry_attempt) || 0) + 1;

  if (!attempt) {
    const ins = await db.query(
      `INSERT INTO bulk_attempts (contact_id, campaign_id, attempt_no, request_id, started_at, duration_sec, interaction_id, recording_url, call_status, outcome, summary, raw_json)
       VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, NOW()), $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [
        contact.id,
        campaignId,
        attemptNo,
        requestId,
        payload.start_datetime || payload.executed_at || null,
        payload.duration != null ? Math.round(payload.duration) : null,
        interactionId,
        recUrl,
        callStatus || 'completed',
        outcome || 'CONNECTED',
        summary || 'Call finished',
        JSON.stringify(payload)
      ]
    );
    attempt = ins.rows[0];

    await db.query(
      'UPDATE bulk_contacts SET attempts = GREATEST(attempts, $1), last_attempt_at = NOW(), last_request_id = $2, status = $3, last_summary = $4 WHERE id = $5',
      [attemptNo, requestId, callStatus || 'completed', summary, contact.id]
    );
  } else {
    // Update existing attempt
    await db.query(
      `UPDATE bulk_attempts 
       SET interaction_id = COALESCE($1, interaction_id),
           recording_url = COALESCE($2, recording_url),
           call_status = $3,
           outcome = $4,
           summary = $5,
           ended_at = NOW()
       WHERE id = $6`,
      [interactionId, recUrl, callStatus || 'completed', outcome || 'CONNECTED', summary, attempt.id]
    );

    await db.query(
      'UPDATE bulk_contacts SET status = $1, last_summary = $2 WHERE id = $3',
      [callStatus || 'completed', summary, contact.id]
    );
  }

  if (confirmedSlot) {
    await db.query('UPDATE bulk_contacts SET booked_datetime_text = $1 WHERE id = $2', [confirmedSlot, contact.id]);
  }

  if (typeof resolveAttempt === 'function' && attempt) {
    try {
      await resolveAttempt(attempt, callStatus, outcome, summary, sentiment, recUrl, payload.interaction_transcript || null);
    } catch (e) {
      console.warn('[Sarvam webhook] resolveAttempt warning:', e.message);
    }
  }

  console.log(`[Sarvam webhook] ✅ Successfully saved dynamic call: Contact=${contact.name || contact.id} (${contact.phone10}) -> IID=${interactionId}`);
}

router.post('/', async (req, res) => {
  try {
    const secret = process.env.SARVAM_WEBHOOK_SECRET;
    if (secret && req.query.secret && req.query.secret !== secret) {
      console.log('[Sarvam webhook] unauthorized attempt');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const payload = req.body || {};
    const campId = payload.campaign_id;
    const userPhone = payload.user_config?.user_phone_number || payload.user_phone_number || payload.phone_number || '';
    const interactionId = payload.interaction_id || payload.attempt_id;

    console.log(`[Sarvam webhook] Received call event: camp=${campId}, phone=${userPhone}, iid=${interactionId}`);

    // If campaign_id is provided in payload
    if (campId) {
      const camp = await db.query(
        'SELECT id FROM bulk_campaigns WHERE sarvam_campaign_id = $1 OR id::text = $1 LIMIT 1',
        [String(campId)]
      );
      if (camp.rows.length > 0) {
        await handleCampaignWebhook(camp.rows[0].id, payload);
        return res.status(200).json({ success: true });
      }
    }

    // Fallback: match by phone across active campaigns
    const p10 = String(userPhone).replace(/\D/g, '').slice(-10);
    if (p10.length === 10) {
      const contRes = await db.query(
        'SELECT id, campaign_id FROM bulk_contacts WHERE phone10 LIKE $1 OR phone LIKE $1 ORDER BY id DESC LIMIT 1',
        [`%${p10}`]
      );
      if (contRes.rows.length > 0) {
        await handleCampaignWebhook(contRes.rows[0].campaign_id, payload);
        return res.status(200).json({ success: true });
      }
    }

    return res.status(200).json({ success: true, message: 'Received' });
  } catch (err) {
    console.error('[Sarvam Webhook Error]:', err);
    return res.status(200).json({ success: false, error: err.message });
  }
});

module.exports = { router };