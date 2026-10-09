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
  const digits = raw.replace(/\D/g, '');
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
    
    const extracted = payload.extracted_variables || {};
    const summary = payload.call_summary || payload.summary || "";
    const sentiment = payload.sentiment || extracted.sentiment || "Neutral";
    const recordingUrl = payload.recording_url || payload.recording || "";
    const callStatus = payload.call_status || payload.status || "completed";
    
    const appointment_booked = String(extracted.appointment_booked).toLowerCase() === 'yes' || !!extracted.callback_datetime;
    const interested = String(extracted.interested).toLowerCase() === 'true' || String(extracted.interested).toLowerCase() === 'yes';
    const doNotCall = String(extracted.do_not_call).toLowerCase() === 'true';

    let outcome = 'completed';
    if (appointment_booked) outcome = 'booked';
    else if (doNotCall) outcome = 'do_not_call';
    else if (callStatus !== 'completed') outcome = callStatus;
    else if (!interested) outcome = 'not_interested';
    else outcome = 'not_booked';

    // Bulk Engine resolution
    if (metadata.kind === 'bulk') {
      const { resolveAttempt } = require('./bulk-calling');
      const attemptRes = await db.query('SELECT * FROM bulk_attempts WHERE request_id = $1 ORDER BY id DESC LIMIT 1', [payload.request_id || payload.call_request_id || payload.id]);
      if (attemptRes.rows.length > 0) {
        await resolveAttempt(attemptRes.rows[0], callStatus, outcome, summary, sentiment, recordingUrl);
      }
      return res.status(200).json({ success: true });
    }
    
    // Legacy / Single Call resolution
    const context = payload.call_context || {};
    const leadId = metadata.lead_id || context.lead_id;
    
    let lead = null;
    if (leadId) {
      const lr = await db.query('SELECT * FROM leads WHERE id = $1', [leadId]);
      if (lr.rows.length > 0) lead = lr.rows[0];
    }
    
    if (!lead && payload.to_number) {
      const digits = payload.to_number.replace(/\D/g, '');
      const last10 = digits.slice(-10);
      if (last10.length === 10) {
        const lr = await db.query('SELECT * FROM leads WHERE phone LIKE $1 OR whatsapp LIKE $1', [`%${last10}`]);
        if (lr.rows.length > 0) lead = lr.rows[0];
      }
    }
    
    if (lead) {
      let newLeadStatus = lead.status;
      if (appointment_booked && lead.status !== 'project_won' && lead.status !== 'quote_sent') {
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
      
      const activityDetail = `Status: ${callStatus} | Sentiment: ${sentiment} \nSummary: ${summary}` + (recordingUrl ? `\nRecording: ${recordingUrl}` : '');
      
      await db.query(`
        INSERT INTO agent_activity (user_id, agent_name, activity_type, status, lead_name, company_name, detail)
        VALUES ($1, 'Riya (AI)', 'call_completed', $2, $3, $4, $5)
      `, [lead.user_id, callStatus, [lead.first_name, lead.last_name].join(' '), lead.company, activityDetail]);
    }
    
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('[Omnidim Webhook Error]:', err);
    res.status(200).json({ success: false, error: err.message });
  }
});

module.exports = { router, omnidimFetch, normalizePhone, buildContext, isCallingHours, canCall };
