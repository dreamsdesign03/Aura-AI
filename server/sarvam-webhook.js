const express = require('express');
const db = require('./db');
const { mapSarvamOutcome, adaptCampaignPayload, recordingProxyUrl, listSarvamAnalytics } = require('./sarvam');
const { normalizePhone } = require('./call-utils');
const { resolveAttempt } = require('./bulk-calling');
const { updateContactName } = require('./contact-name');

const router = express.Router();

// In-memory rate limiter for /sync endpoint
let lastDirectSyncAt = 0;
const DIRECT_SYNC_MIN_INTERVAL_MS = 10000;

/**
 * Handle Sarvam webhook for calls NOT matched to a bulk campaign/contact.
 * Covers: single outbound (Leads/Dialer), inbound, and unknown calls.
 */
async function handleDirectCallWebhook(payload) {
  const interactionId = payload.interaction_id || null;
  const requestId = payload.attempt_id || interactionId || `att-${Date.now()}`;
  const startedAt = payload.start_datetime || payload.executed_at || new Date().toISOString();

  // Extract direction and phones
  const direction = (payload.channel_direction || 'outbound').toLowerCase();
  const isInbound = direction === 'inbound';
  
  // Customer phone: user_phone_number for outbound, caller number for inbound
  const customerPhoneRaw = isInbound 
    ? (payload.caller_number || payload.user_phone_number || payload.from_number || '')
    : (payload.user_phone_number || payload.user_config?.user_phone_number || payload.phone_number || '');
  const botPhone = payload.bot_contact_identifier || process.env.SARVAM_AGENT_NUMBER || '+917965852999';
  
  const toPhone = isInbound ? botPhone : customerPhoneRaw;
  const fromPhone = isInbound ? customerPhoneRaw : botPhone;
  const customerPhoneForLeadMatch = customerPhoneRaw;

  // Normalize phone for matching
  const cleanCustomerPhone = normalizePhone(customerPhoneForLeadMatch);
  const customerPhone10 = cleanCustomerPhone ? cleanCustomerPhone.local.replace(/\D/g, '').slice(-10) : '';

  // Resolve lead: 1) metadata.lead_id, 2) match by phone10 on leads.phone or leads.whatsapp
  let lead = null;
  let leadId = null;

  // 1) Try metadata.lead_id (from webhook_config metadata echoed in payload)
  const metaLeadId = payload.metadata?.lead_id || payload.webhook_config?.metadata?.lead_id;
  if (metaLeadId) {
    const r = await db.query('SELECT * FROM leads WHERE id = $1', [metaLeadId]);
    if (r.rows.length > 0) {
      lead = r.rows[0];
      leadId = lead.id;
    }
  }

  // 2) Match by last 10 digits of phone or whatsapp
  if (!lead && customerPhone10.length === 10) {
    const r = await db.query(
      `SELECT * FROM leads 
       WHERE REPLACE(REPLACE(REPLACE(COALESCE(phone,''), '+', ''), '-', ''), ' ', '') LIKE '%' || $1
          OR REPLACE(REPLACE(REPLACE(COALESCE(whatsapp,''), '+', ''), '-', ''), ' ', '') LIKE '%' || $1
       ORDER BY id DESC LIMIT 1`,
      [customerPhone10]
    );
    if (r.rows.length > 0) {
      lead = r.rows[0];
      leadId = lead.id;
    }
  }

  // 3) Create lead if none exists (so call is never orphaned)
  if (!lead) {
    const ins = await db.query(
      `INSERT INTO leads (phone, name_original, name_english, name_source, status, pipeline_stage, source, created_at, updated_at)
       VALUES ($1, $2, $3, 'call', 'New', 'Lead', 'AI Call', NOW(), NOW())
       RETURNING *`,
      [customerPhoneForLeadMatch, 'AI Caller', 'AI Caller']
    );
    lead = ins.rows[0];
    leadId = lead.id;
  }

  // Map outcome using existing helper
  const { callStatus, outcome, summary, confirmedSlot, sentiment, spokenName } = mapSarvamOutcome(adaptCampaignPayload(payload));
  
  const duration = payload.duration != null ? Math.round(payload.duration) : (payload.duration_in_seconds ? Math.round(payload.duration_in_seconds) : 0);
  const recUrl = recordingProxyUrl(interactionId);
  const transcript = payload.interaction_transcript ? JSON.stringify(payload.interaction_transcript) : null;
  const bookingType = isInbound ? 'inbound_call' : 'single_call';

  const isMishaWebhook = payload.app_id === 'Misha-Skinn-4e9816f8-ead9'
    || payload.metadata?.app_id === 'Misha-Skinn-4e9816f8-ead9'
    || payload.webhook_config?.metadata?.app_id === 'Misha-Skinn-4e9816f8-ead9'
    || payload.metadata?.agent_type === 'makeup_artist'
    || payload.webhook_config?.metadata?.agent_type === 'makeup_artist'
    || /misha|skinnonest/i.test(summary || '')
    || /misha|skinnonest/i.test(transcript || '');

  const resolvedAgentName = isMishaWebhook
    ? 'Misha (Skinnonest AI)'
    : (payload.metadata?.agent_name || payload.webhook_config?.metadata?.agent_name || 'Ria (Aura Clinic AI)');
  const resolvedAgentType = isMishaWebhook
    ? 'makeup_artist'
    : (payload.metadata?.agent_type || payload.webhook_config?.metadata?.agent_type || 'customer');

  // Upsert ai_calls keyed by conversation_id (interaction_id) / call_sid (attempt_id)
  const existingAiCall = await db.query(
    'SELECT id, agent_name FROM ai_calls WHERE conversation_id = $1 OR call_sid = $2 LIMIT 1',
    [interactionId, requestId]
  );

  if (existingAiCall.rows.length === 0) {
    await db.query(`
      INSERT INTO ai_calls (
        lead_id, conversation_id, call_sid, to_phone, from_phone,
        lead_name, company_name, status, booking_type, duration_secs,
        transcript_summary, recording_url, sentiment, outcome, provider,
        direction, transcript, started_at, agent_name, agent_type, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14, 'sarvam',
        $15, $16, COALESCE($17::timestamptz, NOW()), $18, $19, NOW(), NOW()
      )
    `, [
      leadId,
      interactionId,
      requestId,
      toPhone,
      fromPhone,
      ([lead?.first_name, lead?.last_name].filter(Boolean).join(' ').trim() !== '.' && [lead?.first_name, lead?.last_name].filter(Boolean).join(' ').trim()) || spokenName || 'AI Caller',
      lead.company || 'Aura Clinic',
      callStatus || 'completed',
      bookingType,
      duration,
      summary,
      recUrl,
      sentiment || 'Neutral',
      outcome || 'not_booked',
      direction,
      transcript,
      startedAt,
      resolvedAgentName,
      resolvedAgentType
    ]);
  } else {
    // Idempotent update
    await db.query(`
      UPDATE ai_calls
         SET status = $1,
             duration_secs = GREATEST(duration_secs, $2),
             transcript_summary = COALESCE($3, transcript_summary),
             recording_url = COALESCE($4, recording_url),
             sentiment = COALESCE($5, sentiment),
             outcome = COALESCE($6, outcome),
             transcript = COALESCE($7, transcript),
             agent_name = COALESCE(agent_name, $8),
             agent_type = COALESCE(agent_type, $9),
             updated_at = NOW()
       WHERE id = $10
    `, [
      callStatus || 'completed',
      duration,
      summary,
      recUrl,
      sentiment || 'Neutral',
      outcome || 'not_booked',
      transcript,
      resolvedAgentName,
      resolvedAgentType,
      existingAiCall.rows[0].id
    ]);
  }

  // Update leads: last_ai_call_status, last_ai_call_at
  let updateLeadSql = 'UPDATE leads SET last_ai_call_status = $1, last_ai_call_at = NOW()';
  let updateLeadParams = [callStatus || 'completed', leadId];
  
  if (outcome === 'do_not_call') {
    updateLeadSql += ', do_not_call = TRUE';
  }
  
  if (outcome === 'booked') {
    const lr = await db.query('SELECT status FROM leads WHERE id = $1', [leadId]);
    if (lr.rows.length > 0 && lr.rows[0].status !== 'project_won' && lr.rows[0].status !== 'quote_sent') {
      updateLeadSql += ', status = $' + (updateLeadParams.length + 1);
      updateLeadParams.push('discovery_call');
    }
  }
  
  updateLeadSql += ' WHERE id = $' + (updateLeadParams.length + 1);
  updateLeadParams.push(leadId);
  await db.query(updateLeadSql, updateLeadParams);

  // Insert agent_activity 'call_completed' for the lead's user
  if (lead.user_id != null) {
    const activityDetail = `Status: ${callStatus} | Sentiment: ${sentiment} \nSummary: ${summary}` + (recUrl ? `\nRecording: ${recUrl}` : '');
    await db.query(
      'INSERT INTO agent_activity (user_id, agent_name, activity_type, status, lead_name, company_name, detail) VALUES ($1, \'Ria (AI)\', \'call_completed\', $2, $3, $4, $5)',
      [lead.user_id, callStatus || 'completed', [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'AI Caller', lead.company, activityDetail]
    );
  }

  // Update contact name with spoken name from final_agent_variables
  if (spokenName && spokenName.trim()) {
    try {
      await updateContactName({ phone: customerPhoneForLeadMatch, rawName: spokenName, nameSource: 'call' });
      console.log(`[Sarvam webhook] ✅ Updated contact name for ${customerPhoneForLeadMatch}: ${spokenName}`);
    } catch (nameErr) {
      console.warn('[Sarvam webhook] updateContactName warning:', nameErr.message);
    }
  }

  console.log(`[Sarvam webhook] ✅ Direct call saved: lead=${leadId}, type=${bookingType}, iid=${interactionId}, outcome=${outcome}`);
}

async function handleCampaignWebhook(campaignId, payload) {
  let contact = null;
  // Any unhandled error: record as not_booked so the contact isn't stuck
  const _contactId_holder = { id: null };

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
        'SELECT * FROM bulk_contacts WHERE campaign_id = $1 AND phone10 = $2 ORDER BY id LIMIT 1',
        [campaignId, p10]
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

  const { callStatus, outcome, summary, confirmedSlot, sentiment, spokenName } = mapSarvamOutcome(adaptCampaignPayload(payload));
  const interactionId = payload.interaction_id || null;
  const requestId = payload.attempt_id || interactionId || `att-${Date.now()}`;
  const recUrl = recordingProxyUrl(interactionId);

  // Check if an attempt exists for this same contact & request/interaction id.
  // contact_id must be part of the lookup: otherwise a shared/duplicated id can pull in
  // (and overwrite) a completely different person's attempt row.
  const existing = await db.query(
    'SELECT * FROM bulk_attempts WHERE campaign_id = $1 AND contact_id = $2 AND (request_id = $3 OR interaction_id = $4) LIMIT 1',
    [campaignId, contact.id, requestId, interactionId]
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
        callStatus,
        outcome,
        summary,
        JSON.stringify(payload)
      ]
    );
    attempt = ins.rows[0];

    await db.query(
      'UPDATE bulk_contacts SET attempts = GREATEST(attempts, $1), last_attempt_at = NOW(), last_request_id = $2, last_summary = $3 WHERE id = $4',
      [attemptNo, requestId, summary, contact.id]
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
      'UPDATE bulk_contacts SET last_summary = $1 WHERE id = $2',
      [summary, contact.id]
    );
  }

  if (outcome === 'booked' && confirmedSlot) {
    await db.query('UPDATE bulk_contacts SET booked_datetime_text = $1 WHERE id = $2', [confirmedSlot, contact.id]);
  } else if (outcome !== 'booked') {
    await db.query('UPDATE bulk_contacts SET booked_datetime_text = NULL WHERE id = $1', [contact.id]);
  }

  if (typeof resolveAttempt === 'function' && attempt) {
    try {
      await resolveAttempt(attempt, callStatus, outcome, summary, sentiment, recUrl, payload.interaction_transcript || null, spokenName);
    } catch (e) {
      console.warn('[Sarvam webhook] resolveAttempt warning:', e.message);
    }
  }

  // Update contact name from AI call (spoken name extracted from final_agent_variables)
  if (spokenName) {
    try {
      const phoneForName = contact.phone_e164 || rawPhone;
      await updateContactName({ phone: phoneForName, rawName: spokenName, nameSource: 'call' });
      console.log(`[Sarvam webhook] ✅ Updated contact name for ${phoneForName}: ${spokenName}`);
    } catch (nameErr) {
      console.warn('[Sarvam webhook] updateContactName warning:', nameErr.message);
    }
  }

  // Also sync to centralized ai_calls table for Call Review
  try {
    const toPhone = contact.phone_e164 || rawPhone;
    const fromPhone = payload.bot_contact_identifier || '+917965852999';
    const direction = payload.channel_direction || 'outbound';
    const duration = payload.duration != null ? Math.round(payload.duration) : (payload.duration_in_seconds ? Math.round(payload.duration_in_seconds) : 0);

    const freshRes = await db.query(
      `SELECT name, name_english FROM bulk_contacts WHERE id = $1`,
      [contact.id]
    );
    const freshName = (freshRes.rows[0]?.name_english || freshRes.rows[0]?.name || contact.name || '').trim();
    const cleanFinalName = (freshName === '.' || freshName === '-' || !freshName) ? 'Patient' : freshName;

    const existingAiCall = await db.query(
      'SELECT id FROM ai_calls WHERE conversation_id = $1 OR call_sid = $2 LIMIT 1',
      [interactionId, requestId]
    );

    if (existingAiCall.rows.length === 0) {
      await db.query(`
        INSERT INTO ai_calls (
          lead_id, conversation_id, call_sid, to_phone, from_phone,
          lead_name, company_name, status, booking_type, duration_secs,
          transcript_summary, recording_url, sentiment, outcome, provider,
          direction, transcript, started_at, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, 'bulk_campaign', $9,
          $10, $11, $12, $13, 'sarvam',
          $14, $15, COALESCE($16::timestamptz, NOW()), NOW(), NOW()
        )
      `, [
        contact.lead_id || null,
        interactionId,
        requestId,
        toPhone,
        fromPhone,
        cleanFinalName,
        contact.company || 'Aura Clinic',
        callStatus || 'completed',
        duration,
        summary,
        recUrl,
        sentiment || 'Neutral',
        outcome || 'not_booked',
        direction,
        payload.interaction_transcript ? JSON.stringify(payload.interaction_transcript) : null,
        payload.start_datetime || null
      ]);
    } else {
      await db.query(`
        UPDATE ai_calls
           SET status = $1,
               duration_secs = GREATEST(duration_secs, $2),
               transcript_summary = COALESCE($3, transcript_summary),
               recording_url = COALESCE($4, recording_url),
               sentiment = COALESCE($5, sentiment),
               outcome = COALESCE($6, outcome),
               transcript = COALESCE($7, transcript),
               lead_name = (CASE WHEN lead_name IS NULL OR lead_name IN ('.', '-', 'Patient', '') THEN $9 ELSE lead_name END),
               lead_name_english = (CASE WHEN lead_name_english IS NULL OR lead_name_english IN ('.', '-', '') THEN $9 ELSE lead_name_english END),
               updated_at = NOW()
         WHERE id = $8
      `, [
        callStatus || 'completed',
        duration,
        summary,
        recUrl,
        sentiment || 'Neutral',
        outcome || 'booked',
        payload.interaction_transcript ? JSON.stringify(payload.interaction_transcript) : null,
        existingAiCall.rows[0].id,
        cleanFinalName
      ]);
    }
  } catch (syncErr) {
    console.warn('[Sarvam webhook] ai_calls sync warning:', syncErr.message);
  }

  console.log(`[Sarvam webhook] ✅ Successfully saved dynamic call: Contact=${contact.name || contact.id} (${contact.phone10}) -> IID=${interactionId}`);
}

router.post('/', async (req, res) => {
  try {
    const _whSecret = process.env.SARVAM_WEBHOOK_SECRET;
    if (_whSecret) {
      if (req.query.secret !== _whSecret) {
        console.warn('[Sarvam webhook] rejected: missing/invalid secret');
        return res.status(401).json({ error: 'Unauthorized' });
      }
    } else {
      console.warn('[Sarvam webhook] SARVAM_WEBHOOK_SECRET not set — accepting all webhook calls (set it to require authentication)');
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
        'SELECT id, campaign_id FROM bulk_contacts WHERE phone10 = $1 ORDER BY id DESC LIMIT 1',
        [p10]
      );
      if (contRes.rows.length > 0) {
        await handleCampaignWebhook(contRes.rows[0].campaign_id, payload);
        return res.status(200).json({ success: true });
      }
    }

    // No bulk campaign/contact matched — handle as direct call (single outbound, inbound, or unknown)
    try {
      await handleDirectCallWebhook(payload);
    } catch (directErr) {
      console.error('[Sarvam webhook] handleDirectCallWebhook error:', directErr);
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[Sarvam Webhook Error]:', err);
    return res.status(200).json({ success: false, error: err.message });
  }
});

module.exports = { router };