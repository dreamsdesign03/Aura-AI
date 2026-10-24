const express = require('express');
const db = require('./db');
const { mapSarvamOutcome, adaptCampaignPayload } = require('./sarvam');

const router = express.Router();

// Audio is served through our own proxy route (Sarvam needs the API key header).
function recordingProxyUrl(interactionId) {
  if (!interactionId) return null;
  const base = String(process.env.PUBLIC_APP_URL || '').replace(/\/$/, '');
  return `${base}/api/bulk-calling/calls/recording?iid=${encodeURIComponent(interactionId)}`;
}

// Webhook for a call attempt that belongs to a Sarvam CAMPAIGN (not Instant Outbound).
// There is no pre-inserted bulk_attempts row here, so the attempt is created now.
async function handleCampaignWebhook(campaignId, payload) {
  const { normalizePhone } = require('./call-utils');
  const { resolveAttempt } = require('./bulk-calling');

  // user_identifier is our bulk_contacts.id (set when the cohort was streamed)
  let contact = null;
  const cid = parseInt(payload.user_identifier, 10);
  if (Number.isInteger(cid)) {
    const r = await db.query('SELECT * FROM bulk_contacts WHERE id = $1 AND campaign_id = $2', [cid, campaignId]);
    contact = r.rows[0] || null;
  }
  if (!contact) {
    const phoneObj = normalizePhone(payload.user_phone_number || '');
    if (phoneObj) {
      const r = await db.query('SELECT * FROM bulk_contacts WHERE campaign_id = $1 AND phone10 = $2 ORDER BY id LIMIT 1', [campaignId, phoneObj.local]);
      contact = r.rows[0] || null;
    }
  }
  if (!contact) {
    console.log('[Sarvam webhook] campaign webhook: no contact matched, campaign=' + campaignId + ' attempt_id=' + payload.attempt_id);
    return;
  }

  const { callStatus, outcome, summary, confirmedSlot, sentiment } = mapSarvamOutcome(adaptCampaignPayload(payload));
  const interactionId = payload.interaction_id || null;

  // Sarvam can re-deliver a webhook: one row per attempt_id.
  const existing = await db.query('SELECT * FROM bulk_attempts WHERE campaign_id = $1 AND request_id = $2 LIMIT 1', [campaignId, payload.attempt_id]);
  let attempt = existing.rows[0];
  if (!attempt) {
    const attemptNo = (Number(payload.retry_attempt) || 0) + 1;
    const ins = await db.query(
      `INSERT INTO bulk_attempts (contact_id, campaign_id, attempt_no, request_id, started_at, duration_sec, interaction_id, raw_json)
       VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, NOW()), $6, $7, $8) RETURNING *`,
      [contact.id, campaignId, attemptNo, payload.attempt_id, payload.start_datetime || payload.executed_at || null,
        payload.duration != null ? Math.round(payload.duration) : null, interactionId, JSON.stringify(payload)]
    );
    attempt = ins.rows[0];
    await db.query(
      'UPDATE bulk_contacts SET attempts = GREATEST(attempts, $1), last_attempt_at = NOW(), last_request_id = $2 WHERE id = $3',
      [attemptNo, payload.attempt_id, contact.id]
    );
  }

  if (confirmedSlot) {
    await db.query('UPDATE bulk_contacts SET booked_datetime_text = $1 WHERE id = $2', [confirmedSlot, contact.id]);
  }
  await resolveAttempt(attempt, callStatus, outcome, summary, sentiment, recordingProxyUrl(interactionId), payload.interaction_transcript || null);
  console.log(`[Sarvam webhook] campaign attempt saved: contact=${contact.id} status=${callStatus} outcome=${outcome} next=${payload.next_action_status || 'terminal'}`);
}

// WEBHOOK — Sarvam posts here once per attempt. There is no signature header,
// so the URL is protected with a ?secret= query param.
router.post('/', async (req, res) => {
  try {
    const secret = process.env.SARVAM_WEBHOOK_SECRET;
    if (!secret || req.query.secret !== secret) {
      console.log('[Sarvam webhook] unauthorized');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const payload = req.body || {};
    // Sarvam may send metadata at different paths — check all
    const metadata = payload.webhook_config?.metadata || payload.metadata || {};
    const disposition = payload.final_agent_variables?.call_disposition || '';
    const userPhone = payload.user_config?.user_phone_number || payload.user_phone_number || '';
    console.log('[Sarvam webhook] received attempt_id=' + payload.attempt_id + ' interaction_id=' + payload.interaction_id + ' status=' + payload.status + ' disposition=' + disposition + ' userPhone=' + userPhone);
    console.log('[Sarvam webhook] FULL payload (truncated):', JSON.stringify(payload).slice(0, 1500));

    // ── STEP 0: attempt that belongs to a Sarvam CAMPAIGN launched from AuraAI ──
    if (payload.campaign_id) {
      const camp = await db.query('SELECT id FROM bulk_campaigns WHERE sarvam_campaign_id = $1', [String(payload.campaign_id)]);
      if (camp.rows.length > 0) {
        await handleCampaignWebhook(camp.rows[0].id, payload);
        return res.status(200).json({ success: true });
      }
    }

    // ── STEP 1: Try to match a BULK attempt — multiple strategies ──
    let bulkAttempt = null;

    // Strategy A: match by attempt_id or interaction_id (stored as request_id)
    const attemptIdToSearch = payload.attempt_id || payload.interaction_id;
    if (attemptIdToSearch) {
      const byRequest = await db.query(
        'SELECT * FROM bulk_attempts WHERE request_id = $1 ORDER BY id DESC LIMIT 1',
        [attemptIdToSearch]
      );
      if (byRequest.rows.length > 0) {
        bulkAttempt = byRequest.rows[0];
        console.log(`[Sarvam webhook] ✅ Strategy A: Matched by attempt_id/interaction_id: ${bulkAttempt.id}`);
      }
    }

    // Strategy B: match by contact phone number (most reliable since Sarvam always sends it)
    // Find the most recent 'calling' contact with this phone that has an open attempt
    if (!bulkAttempt && userPhone) {
      const { normalizePhone } = require('./call-utils');
      const phoneObj = normalizePhone(userPhone);
      if (phoneObj) {
        const byPhone = await db.query(`
          SELECT ba.* FROM bulk_attempts ba
          JOIN bulk_contacts bc ON bc.id = ba.contact_id
          WHERE bc.phone_e164 = $1 AND ba.ended_at IS NULL
          ORDER BY ba.id DESC LIMIT 1
        `, [phoneObj.e164]);
        if (byPhone.rows.length > 0) {
          bulkAttempt = byPhone.rows[0];
          console.log(`[Sarvam webhook] ✅ Strategy B: Matched by phone ${phoneObj.e164}: attempt ${bulkAttempt.id}`);
        }
      }
    }

    // Strategy C: match by contact_id + attempt_no from metadata
    if (!bulkAttempt && metadata.contact_id != null && metadata.attempt_no != null) {
      const byMeta = await db.query(
        'SELECT * FROM bulk_attempts WHERE contact_id = $1 AND attempt_no = $2 ORDER BY id DESC LIMIT 1',
        [metadata.contact_id, metadata.attempt_no]
      );
      if (byMeta.rows.length > 0) {
        bulkAttempt = byMeta.rows[0];
        console.log(`[Sarvam webhook] ✅ Strategy C: Matched by contact_id+attempt_no: ${bulkAttempt.id}`);
      }
    }

    // Strategy D: last resort — find most recent open (calling) bulk attempt overall
    if (!bulkAttempt) {
      const byOpen = await db.query(`
        SELECT ba.* FROM bulk_attempts ba
        JOIN bulk_contacts bc ON bc.id = ba.contact_id
        WHERE ba.ended_at IS NULL AND bc.status = 'calling'
        ORDER BY ba.id DESC LIMIT 1
      `);
      if (byOpen.rows.length > 0) {
        bulkAttempt = byOpen.rows[0];
        console.log(`[Sarvam webhook] ⚠️ Strategy D (last resort): Matched most recent open attempt: ${bulkAttempt.id}`);
      }
    }

    // ── STEP 2: If bulk attempt found, process it ──
    if (bulkAttempt) {
      console.log(`[Sarvam webhook] 📥 Processing BULK attempt id=${bulkAttempt.id}, contact_id=${bulkAttempt.contact_id}`);

      const { callStatus, outcome, summary, confirmedSlot, sentiment } = mapSarvamOutcome(payload);
      console.log(`[Sarvam webhook] 📊 Mapped: callStatus=${callStatus}, outcome=${outcome}, sentiment=${sentiment}`);

      const transcript = payload.interaction_transcript || null;
      const interactionId = payload.interaction_id || null;
      const recordingUrl = recordingProxyUrl(interactionId);
      console.log(`[Sarvam webhook] 📝 Transcript msgs=${transcript ? transcript.length : 0}, interactionId=${interactionId}`);

      if (confirmedSlot) {
        await db.query(
          'UPDATE bulk_contacts SET booked_datetime_text = $1 WHERE id = $2',
          [confirmedSlot, bulkAttempt.contact_id]
        );
        console.log(`[Sarvam webhook] 📅 booked_datetime_text set: ${confirmedSlot}`);
      }

      const { resolveAttempt } = require('./bulk-calling');
      await resolveAttempt(bulkAttempt, callStatus, outcome, summary, sentiment, recordingUrl, transcript);
      if (interactionId) {
        await db.query('UPDATE bulk_attempts SET interaction_id = $1 WHERE id = $2', [interactionId, bulkAttempt.id]);
      }
      console.log(`[Sarvam webhook] ✅ resolveAttempt done for attempt ${bulkAttempt.id}`);

      return res.status(200).json({ success: true });
    }

    // ── STEP 3: Not a bulk call — try single-lead path ──
    if (metadata.kind === 'single' && metadata.lead_id) {
      console.log('[Sarvam webhook] single branch: looking up lead', metadata.lead_id);
      const leadRes = await db.query('SELECT * FROM leads WHERE id = $1', [metadata.lead_id]);
      if (leadRes.rows.length === 0) {
        console.log('[Sarvam webhook] single branch: lead not found, ack');
        return res.status(200).json({ success: true });
      }
      const lead = leadRes.rows[0];

      const { callStatus, outcome, summary, confirmedSlot, sentiment } = mapSarvamOutcome(payload);
      console.log('[Sarvam webhook] single branch mapped:', { callStatus, outcome, confirmedSlot });

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
      console.log('[Sarvam webhook] single branch: leads UPDATE done ->', { last_ai_call_status: callStatus, status: newLeadStatus });

      const detail = `Status: ${callStatus} | Outcome: ${outcome}\nSummary: ${summary}` + (confirmedSlot ? `\nSlot: ${confirmedSlot}` : '');

      if (lead.user_id != null) {
        await db.query(`
          INSERT INTO agent_activity (user_id, agent_name, activity_type, status, lead_name, company_name, detail)
          VALUES ($1, 'Ketki (AI)', 'call_completed', $2, $3, $4, $5)
        `, [lead.user_id, callStatus, [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.name || 'Lead', lead.company, detail]);
        console.log('[Sarvam webhook] single branch: agent_activity INSERT done');
      } else {
        console.warn('[Sarvam webhook] single branch: skipped agent_activity, lead.user_id is null for lead', lead.id);
      }

      return res.status(200).json({ success: true });
    }

    // ── STEP 4: Nothing matched ──
    console.log('[Sarvam webhook] ⚠️ No matching attempt or lead found. attempt_id=' + payload.attempt_id + ' kind=' + metadata.kind);
    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('[Sarvam Webhook Error]:', err && (err.stack || err));
    return res.status(200).json({ success: false, error: err.message });
  }
});

module.exports = { router };
