const express = require('express');
const db = require('./db');
const { normalizePhone, isCallingHours } = require('./call-utils');
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
    const u = await db.query('SELECT id FROM users WHERE email = $1', [decodeURIComponent(match[1])]);
    if (u.rows.length === 0) return res.status(401).json({ error: 'Unauthenticated' });
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Full conversation (original language) for one call, straight from Sarvam.
router.get('/calls/transcript', requireUserCookie, async (req, res) => {
  try {
    const iid = String(req.query.iid || '');
    if (!validInteractionId(iid)) return res.status(400).json({ error: 'invalid iid' });
    res.json({ messages: await fetchSarvamTranscript(iid) });
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

// Create the Sarvam campaign for a draft AuraAI campaign and stream its pending contacts.
async function launchSarvamCampaign(camp) {
  const pending = await db.query("SELECT * FROM bulk_contacts WHERE campaign_id = $1 AND status = 'pending' ORDER BY id", [camp.id]);
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

async function resolveAttempt(attempt, callStatus, outcome, summary, sentiment, recordingUrl, transcript) {
  await db.query(
    'UPDATE bulk_attempts SET ended_at = NOW(), call_status = $1, outcome = $2, summary = $3, sentiment = $4, recording_url = $5, transcript = $6 WHERE id = $7',
    [callStatus, outcome, summary, sentiment, recordingUrl, JSON.stringify(transcript), attempt.id]
  );

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

  await db.query(
    'UPDATE bulk_contacts SET status = $1, next_attempt_at = $2, last_summary = $3, last_sentiment = $4, recording_url = $5, transcript = $6 WHERE id = $7',
    [nextStatus, nextAttemptAt, summary, sentiment, recordingUrl, JSON.stringify(transcript), contact.id]
  );

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
}

// GET all campaigns
router.get('/', async (req, res) => {
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
router.post('/', async (req, res) => {
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

    const insertCamp = await db.query(
      'INSERT INTO bulk_campaigns (name, max_attempts, retry_delay_min, gap_seconds, total, created_by, sarvam_settings) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [name, maxAttempts, retryDelay, gap_seconds || 20, contacts.length, req.user ? req.user.id : 1, settings ? JSON.stringify(settings) : null]
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

      await db.query(
        'INSERT INTO bulk_contacts (campaign_id, name, company, phone_e164, phone10, email, extra_json, lead_id, status, last_summary) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
        [campaignId, c.name || '', c.company || '', phoneObj ? phoneObj.e164 : null, phoneObj ? phoneObj.local : null, c.email || '', c.extra_json || {}, c.lead_id || null, status, reason]
      );
    }

    res.json({ success: true, campaignId });
  } catch (err) {
    res.status(err.status === 400 ? 400 : 500).json({ error: err.message });
  }
});

// GET campaign details
router.get('/:id', async (req, res) => {
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
router.get('/:id/contacts', async (req, res) => {
  try {
    const contacts = await db.query('SELECT * FROM bulk_contacts WHERE campaign_id = $1 ORDER BY id ASC', [req.params.id]);
    res.json(contacts.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET attempts for a contact
router.get('/:id/contacts/:contactId/attempts', async (req, res) => {
  try {
    const attempts = await db.query('SELECT * FROM bulk_attempts WHERE contact_id = $1 ORDER BY attempt_no ASC', [req.params.contactId]);
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

    const done = await db.query('SELECT * FROM bulk_attempts WHERE campaign_id = $1 AND request_id = $2 LIMIT 1', [camp.id, a.attempt_id]);

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
        if (confirmedSlot) await db.query('UPDATE bulk_contacts SET booked_datetime_text = $1 WHERE id = $2', [confirmedSlot, contact.id]);
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
    if (confirmedSlot) await db.query('UPDATE bulk_contacts SET booked_datetime_text = $1 WHERE id = $2', [confirmedSlot, contact.id]);
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
    console.error('[Bulk Sync] failed:', err.message);
    res.status(err.status ? 502 : 500).json({ error: err.message });
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
  const secret = req.query.secret || req.headers['authorization'];
  if (secret !== process.env.CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });

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

module.exports = { router, resolveAttempt };