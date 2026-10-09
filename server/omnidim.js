const express = require('express');
const db = require('./db');

const OMNIDIM_API_KEY = process.env.OMNIDIM_API_KEY;
const OMNIDIM_BASE_URL = process.env.OMNIDIM_BASE_URL || 'https://omnidim.io/api/v1';
const OMNIDIM_AGENT_ID = process.env.OMNIDIM_AGENT_ID;
const OMNIDIM_PHONE_NUMBER_ID = process.env.OMNIDIM_PHONE_NUMBER_ID;

const router = express.Router();

async function omnidimFetch(path, init = {}) {
  const url = `${OMNIDIM_BASE_URL}${path}`;
  const headers = {
    'Authorization': `Bearer ${OMNIDIM_API_KEY}`,
    'Content-Type': 'application/json',
    ...(init.headers || {})
  };
  
  const res = await fetch(url, { ...init, headers });
  const data = await res.json().catch(() => null);
  
  if (!res.ok) {
    const msg = data?.message || data?.error || res.statusText || 'Omnidim API Error';
    throw new Error(msg);
  }
  return data;
}

function normalizePhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/D/g, '');
  if (digits.length === 10) {
    return { e164: `+91${digits}`, local: digits };
  } else if (digits.length === 12 && digits.startsWith('91')) {
    return { e164: `+${digits}`, local: digits.substring(2) };
  } else if (digits.length === 11 && digits.startsWith('0')) {
    const local = digits.substring(1);
    return { e164: `+91${local}`, local };
  }
  return null;
}

function buildContext(lead) {
  const phoneObj = normalizePhone(lead.phone || lead.whatsapp);
  return {
    lead_name: [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.name || 'Lead',
    company_name: lead.company || "",
    lead_phone: phoneObj ? phoneObj.local : "",
    lead_email: lead.email || "",
    booking_type: "proposal_call",
    lead_id: String(lead.id)
  };
}

function isCallingHours() {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  });
  const parts = formatter.formatToParts(new Date());
  const hour = parseInt(parts.find(p => p.type === 'hour').value, 10);
  const minute = parseInt(parts.find(p => p.type === 'minute').value, 10);
  
  const timeNum = hour + minute / 60;
  return timeNum >= 10 && timeNum <= 19.5; // 10:00 to 19:30
}

function canCall(lead, isScheduled = false) {
  const phoneObj = normalizePhone(lead.phone || lead.whatsapp);
  if (!phoneObj) return { ok: false, reason: "No valid 10-digit Indian phone number" };
  if (lead.do_not_call) return { ok: false, reason: "Lead opted out (do_not_call=true)" };
  
  if (!isScheduled && !isCallingHours()) {
    return { ok: false, reason: "Outside calling hours (10:00-19:30 IST)" };
  }
  
  const allowlist = process.env.OMNIDIM_TEST_ALLOWLIST;
  if (allowlist) {
    const allowedNumbers = allowlist.split(',').map(n => n.trim());
    if (!allowedNumbers.includes(phoneObj.local)) {
      return { ok: false, reason: "Number not in OMNIDIM_TEST_ALLOWLIST" };
    }
  }
  
  return { ok: true, reason: null, e164: phoneObj.e164 };
}

// A) SINGLE CALL (replace old one)
router.post('/call', async (req, res) => {
  try {
    const { leadId } = req.body;
    if (!leadId) return res.status(400).json({ success: false, error: "leadId required" });
    
    const leadResult = await db.query('SELECT * FROM leads WHERE id = $1', [leadId]);
    if (leadResult.rows.length === 0) return res.status(404).json({ success: false, error: "Lead not found" });
    const lead = leadResult.rows[0];
    
    const check = canCall(lead);
    if (!check.ok) return res.status(400).json({ success: false, error: check.reason });
    
    const context = buildContext(lead);
    
    const payload = {
      agent_id: Number(OMNIDIM_AGENT_ID),
      to_number: check.e164,
      from_number_id: Number(OMNIDIM_PHONE_NUMBER_ID),
      call_context: context,
      metadata: { lead_id: String(lead.id) }
    };
    
    const apiRes = await omnidimFetch('/calls/dispatch', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    
    const requestId = apiRes.request_id || apiRes.id || 'dispatched';
    
    await db.query(`
      UPDATE leads 
      SET last_ai_call_status = 'queued', last_ai_call_at = NOW(), last_ai_call_request_id = $1
      WHERE id = $2
    `, [requestId, lead.id]);
    
    // Add activity
    await db.query(`
      INSERT INTO agent_activity (user_id, agent_name, activity_type, status, lead_name, company_name, detail)
      VALUES ($1, 'Riya (AI)', 'call_started', 'queued', $2, $3, $4)
    `, [lead.user_id, context.lead_name, lead.company, `AI call dispatched to ${check.e164}`]);
    
    res.json({ success: true, requestId });
  } catch (err) {
    console.error('[Omnidim Call Error]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// B) BULK CALLING
router.post('/bulk-call', async (req, res) => {
  try {
    const { name, leadIds, scheduled, concurrent, autoRetry } = req.body;
    if (!leadIds || !Array.isArray(leadIds)) return res.status(400).json({ error: "leadIds must be an array" });
    if (leadIds.length > 200) return res.status(400).json({ error: "Max 200 leads per campaign" });
    
    const isScheduled = !!scheduled;
    
    const leadsRes = await db.query('SELECT * FROM leads WHERE id = ANY($1)', [leadIds]);
    const leads = leadsRes.rows;
    
    const contactList = [];
    const skipped = [];
    const seenPhones = new Set();
    const queuedLeadIds = [];
    
    for (const lead of leads) {
      const check = canCall(lead, isScheduled);
      if (!check.ok) {
        skipped.push({ leadId: lead.id, reason: check.reason });
        continue;
      }
      if (seenPhones.has(check.e164)) {
        skipped.push({ leadId: lead.id, reason: "Duplicate phone number" });
        continue;
      }
      seenPhones.add(check.e164);
      queuedLeadIds.push(lead.id);
      
      contactList.push({
        phone_number: check.e164,
        ...buildContext(lead)
      });
    }
    
    if (contactList.length === 0) {
      return res.status(400).json({ error: "No valid leads to call", skipped });
    }
    
    const maxConcurrent = Number(process.env.OMNIDIM_MAX_CONCURRENT || 1);
    const concurrentLimit = Math.min(Number(concurrent) || 1, maxConcurrent);
    
    const payload = {
      name: name || `Aura Leads - ${new Date().toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})}`,
      phone_number_id: String(OMNIDIM_PHONE_NUMBER_ID),
      bot_id: Number(OMNIDIM_AGENT_ID),
      contact_list: contactList,
      concurrent_call_limit: concurrentLimit,
      is_scheduled: isScheduled,
      enabled_reschedule_call: true
    };
    
    if (isScheduled) {
      payload.scheduled_datetime = scheduled;
      payload.timezone = "Asia/Kolkata";
    }
    
    if (autoRetry) {
      payload.retry_config = {
        auto_retry: true,
        auto_retry_schedule: "next_day",
        retry_limit: 2
      };
    }
    
    const apiRes = await omnidimFetch('/calls/bulk_call/create', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    
    const campaignId = apiRes.campaign_id || apiRes.id || apiRes.bulk_call_id;
    
    // Call set time control
    try {
      await omnidimFetch('/calls/bulk_call/time_control', {
        method: 'POST',
        body: JSON.stringify({
          bulk_call_id: campaignId,
          start_time: "10:00",
          end_time: "19:00",
          timezone: "Asia/Kolkata"
        })
      });
    } catch (e) {
      console.warn("Failed to set time control for campaign:", e.message);
    }
    
    // Save to DB
    const insertRes = await db.query(`
      INSERT INTO ai_call_campaigns (omnidim_campaign_id, name, status, total, lead_ids, scheduled_at, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [
      campaignId, 
      payload.name, 
      isScheduled ? 'scheduled' : 'running',
      contactList.length,
      JSON.stringify(queuedLeadIds),
      isScheduled ? scheduled : null,
      req.user ? req.user.id : 1 // fallback if auth middleware not applied here
    ]);
    
    const localId = insertRes.rows[0].id;
    
    // Update queued leads
    if (queuedLeadIds.length > 0) {
      await db.query(`
        UPDATE leads 
        SET last_ai_call_status = 'queued', last_ai_call_at = NOW()
        WHERE id = ANY($1)
      `, [queuedLeadIds]);
    }
    
    res.json({ success: true, campaignId: localId, omnidimCampaignId: campaignId, queued: contactList.length, skipped });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/bulk-call', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM ai_call_campaigns ORDER BY created_at DESC LIMIT 50');
    // Ideally we would poll omnidim for live status of running campaigns here, but keeping it simple for now
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/bulk-call/:id', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM ai_call_campaigns WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Campaign not found" });
    const campaign = result.rows[0];
    
    // Fetch live status from Omnidim
    try {
      const liveRes = await omnidimFetch(`/calls/bulk_call/${campaign.omnidim_campaign_id}/status`);
      campaign.live_status = liveRes;
    } catch (e) {
      campaign.live_status = { error: e.message };
    }
    
    res.json(campaign);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/bulk-call/:id/results', async (req, res) => {
  try {
    const result = await db.query('SELECT omnidim_campaign_id FROM ai_call_campaigns WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Campaign not found" });
    const omniId = result.rows[0].omnidim_campaign_id;
    
    const listRes = await omnidimFetch(`/calls/bulk_call/${omniId}/lines`);
    res.json(listRes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/bulk-call/:id/action', async (req, res) => {
  try {
    const { action } = req.body; // pause, resume, cancel
    if (!['pause', 'resume', 'cancel'].includes(action)) return res.status(400).json({ error: "Invalid action" });
    
    const result = await db.query('SELECT omnidim_campaign_id FROM ai_call_campaigns WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Campaign not found" });
    const omniId = result.rows[0].omnidim_campaign_id;
    
    if (action === 'cancel') {
      await omnidimFetch(`/calls/bulk_call/${omniId}/cancel`, { method: 'POST' });
      await db.query('UPDATE ai_call_campaigns SET status = $1 WHERE id = $2', ['cancelled', req.params.id]);
    } else {
      await omnidimFetch(`/calls/bulk_call/${omniId}/action`, {
        method: 'POST',
        body: JSON.stringify({ action })
      });
      await db.query('UPDATE ai_call_campaigns SET status = $1 WHERE id = $2', [
        action === 'pause' ? 'paused' : 'running', 
        req.params.id
      ]);
    }
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// WEBHOOK
router.post('/webhook', async (req, res) => {
  try {
    const secret = req.query.secret || req.headers['x-omnidim-signature'] || req.headers.authorization;
    if (secret !== process.env.OMNIDIM_WEBHOOK_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    console.log('[Omnidim Webhook Payload]:', JSON.stringify(req.body, null, 2));
    
    const payload = req.body;
    const metadata = payload.metadata || {};
    const context = payload.call_context || {};
    const leadId = metadata.lead_id || context.lead_id;
    
    const extracted = payload.extracted_variables || {};
    const summary = payload.call_summary || payload.summary || "";
    const sentiment = payload.sentiment || extracted.sentiment || "Neutral";
    const recordingUrl = payload.recording_url || payload.recording || "";
    const callStatus = payload.call_status || payload.status || "completed";
    
    let lead = null;
    if (leadId) {
      const lr = await db.query('SELECT * FROM leads WHERE id = $1', [leadId]);
      if (lr.rows.length > 0) lead = lr.rows[0];
    }
    
    if (!lead && payload.to_number) {
      const digits = payload.to_number.replace(/D/g, '');
      const last10 = digits.slice(-10);
      if (last10.length === 10) {
        const lr = await db.query('SELECT * FROM leads WHERE phone LIKE $1 OR whatsapp LIKE $1', [`%${last10}`]);
        if (lr.rows.length > 0) lead = lr.rows[0];
      }
    }
    
    if (lead) {
      const doNotCall = extracted.do_not_call?.toString().toLowerCase() === 'true';
      const interested = extracted.interested?.toString().toLowerCase() === 'true' || extracted.interested === 'yes';
      
      let newLeadStatus = lead.status;
      if (interested && lead.status !== 'project_won' && lead.status !== 'quote_sent') {
        newLeadStatus = 'discovery_call';
      }
      
      await db.query(`
        UPDATE leads 
        SET last_ai_call_status = $1, 
            last_ai_call_at = NOW(),
            do_not_call = CASE WHEN $2 = TRUE THEN TRUE ELSE do_not_call END,
            status = $3
        WHERE id = $4
      `, [callStatus, doNotCall, newLeadStatus, lead.id]);
      
      const activityDetail = `Status: ${callStatus} | Sentiment: ${sentiment} nSummary: ${summary}` + (recordingUrl ? `nRecording: ${recordingUrl}` : '');
      
      await db.query(`
        INSERT INTO agent_activity (user_id, agent_name, activity_type, status, lead_name, company_name, detail)
        VALUES ($1, 'Riya (AI)', 'call_completed', $2, $3, $4, $5)
      `, [lead.user_id, callStatus, [lead.first_name, lead.last_name].join(' '), lead.company, activityDetail]);
    }
    
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('[Omnidim Webhook Error]:', err);
    // Always return 200 quickly per docs to avoid retries on failure
    res.status(200).json({ success: false, error: err.message });
  }
});

module.exports = { router };
