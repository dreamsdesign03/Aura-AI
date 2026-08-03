const db = require('./db');

const GEMINI_MODEL = 'gemini-1.5-flash-latest';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const TRIGGER_ICONS = {
  new_lead_meta_ad: 'Tag',
  missed_booking: 'AlertCircle',
  no_response: 'RotateCcw',
  call_booked: 'Calendar',
  proposal_sent: 'Send',
  lead_lost: 'Star',
};

const TRIGGER_COLORS = {
  new_lead_meta_ad: '#4F35A8',
  missed_booking: '#EF4444',
  no_response: '#F59E0B',
  call_booked: '#3B82F6',
  proposal_sent: '#8B5CF6',
  lead_lost: '#6B7280',
};

function parseDelayMs(text) {
  const m = String(text || '').match(/(\d+)\s*(minute|hour|day)s?/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const mult = unit.startsWith('minute') ? 60000 : unit.startsWith('hour') ? 3600000 : 86400000;
  return n * mult;
}

function personalizeMessage(text, ctx) {
  const c = ctx || {};
  const replacers = {
    '{{name}}': c.first_name || c.name || 'there',
    '{{firstName}}': c.first_name || 'there',
    '{{lastName}}': c.last_name || '',
    '{{company}}': c.company || 'your business',
    '{{phone}}': c.phone || '',
    '{{date}}': c.date || '',
    '{{time}}': c.time || '',
    '{{service}}': c.service || 'Aura Skin Clinic',
    '{{doctor}}': 'Dr. Aditya Shah',
    '{{clinic}}': 'Aura Skin Clinic',
  };
  let out = String(text || '');
  for (const [key, value] of Object.entries(replacers)) {
    out = out.split(key).join(value);
  }
  return out;
}

async function generateWhatsAppCopy(template, ctx, automationName) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.length < 10) return template;
  const c = ctx || {};
  const prompt = `You are a WhatsApp sales copywriter for Aura Skin Clinic (Dr. Aditya Shah). Rewrite the message below into one short, warm, professional WhatsApp message (max 120 words). Use the lead's details naturally. NEVER output placeholders like {{name}}. Output ONLY the final message text, no headers, no quotes.

AUTOMATION: ${automationName || 'Aura AI automation'}
MESSAGE TEMPLATE:
${template}

LEAD CONTEXT:
- Name: ${c.first_name || c.name || 'there'}
- Company/Business: ${c.company || 'their business'}
- Appointment date: ${c.date || ''}
- Appointment time: ${c.time || ''}
- Service: ${c.service || 'Aura Skin Clinic'}`;
  try {
    const res = await fetch(GEMINI_URL + `?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7 },
      }),
    });
    if (!res.ok) return template;
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return text && text.length > 5 ? text : template;
  } catch (err) {
    console.warn('[automation] Gemini copy failed, using template:', err.message);
    return template;
  }
}

async function sendWhatsAppMessage(phone, message, userId) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    console.log(`[automation][whatsapp] Gateway not configured. Simulated send to ${phone}: ${String(message).slice(0, 80)}`);
    return { success: true, simulated: true };
  }
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone.replace(/\D/g, ''),
        type: 'text',
        text: { body: message },
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('[automation][whatsapp] Send failed:', JSON.stringify(data).slice(0, 300));
      return { success: false, error: data?.error?.message || 'WhatsApp send failed' };
    }
    return { success: true };
  } catch (err) {
    console.error('[automation][whatsapp] Send error:', err.message);
    return { success: false, error: err.message };
  }
}

async function recordActivity(userId, automationId, trigger, message, entityName, icon, color) {
  try {
    await db.query(
      `INSERT INTO automation_activity (user_id, automation_id, trigger, message, entity_name, icon, color, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [userId, automationId, trigger, message, entityName || 'Lead', icon || 'Zap', color || '#4F35A8']
    );
  } catch (err) {
    console.error('[automation] recordActivity error:', err.message);
  }
}

async function appendRunLog(runId, entry) {
  try {
    await db.query(
      `UPDATE automation_runs SET log = COALESCE(log, '[]'::jsonb) || $1::jsonb, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify([entry]), runId]
    );
  } catch (err) {
    console.error('[automation] appendRunLog error:', err.message);
  }
}

async function evaluateCondition(step, auto, run, ctx) {
  const text = `${step.label || ''} ${step.detail || ''}`.toLowerCase();
  const isResponseCheck = /response|reply|answer|responded/.test(text);
  if (!isResponseCheck) return true;
  const status = String(ctx.status || '').toLowerCase();
  const hasAdvancedStatus = status && !['new', 'contacted', 'lead in'].includes(status);
  if (hasAdvancedStatus) {
    await appendRunLog(run.id, { type: 'condition', label: step.label, detail: 'Lead already responded — sequence stopped', at: new Date().toISOString() });
    await recordActivity(auto.user_id, auto.id, auto.trigger, `${ctx.entity_name || 'Lead'} replied — sequence ${auto.name} stopped`, ctx.entity_name || 'Lead', 'GitBranch', '#D97706');
    return false;
  }
  return true;
}

async function executeAction(step, auto, run, ctx) {
  const detail = step.detail || '';
  let message = personalizeMessage(detail, ctx);
  message = await generateWhatsAppCopy(message, ctx, auto.name);
  const entityName = ctx.entity_name || ctx.name || 'Lead';
  await recordActivity(auto.user_id, auto.id, auto.trigger, message, entityName, 'MessageCircle', '#25D366');
  if (ctx.phone) {
    const result = await sendWhatsAppMessage(ctx.phone, message, auto.user_id);
    await appendRunLog(run.id, {
      type: 'action',
      label: step.label,
      detail: message,
      delivery: result.simulated ? 'simulated (no gateway configured)' : result.success ? 'sent' : result.error || 'unknown',
      at: new Date().toISOString(),
    });
    if (!result.simulated && !result.success) {
      await recordActivity(auto.user_id, auto.id, auto.trigger, `⚠️ Failed to send to ${entityName}: ${result.error}`, entityName, 'AlertCircle', '#EF4444');
    }
  } else {
    await appendRunLog(run.id, { type: 'action', label: step.label, detail: message, delivery: 'logged (no phone on lead)', at: new Date().toISOString() });
  }
  return message;
}

async function processRun(run) {
  const autoRes = await db.query('SELECT * FROM automations WHERE id = $1', [run.automation_id]);
  if (autoRes.rows.length === 0) {
    await db.query("UPDATE automation_runs SET status = 'failed', updated_at = NOW() WHERE id = $1", [run.id]);
    return;
  }
  const auto = autoRes.rows[0];
  if (!auto.active) {
    await db.query("UPDATE automation_runs SET status = 'cancelled', run_after = NULL, updated_at = NOW() WHERE id = $1", [run.id]);
    return;
  }
  const steps = Array.isArray(auto.steps) ? auto.steps : [];
  let idx = run.step_index || 0;
  let ctx = run.context;
  try {
    ctx = typeof ctx === 'string' ? JSON.parse(ctx) : ctx || {};
  } catch {
    ctx = {};
  }
  while (idx < steps.length) {
    const step = steps[idx] || {};
    const type = step.type;
    if (type === 'delay') {
      const ms = parseDelayMs(step.label || step.detail);
      if (ms) {
        const runAfter = new Date(Date.now() + ms);
        await db.query(
          "UPDATE automation_runs SET step_index = $1, run_after = $2, status = 'waiting', updated_at = NOW() WHERE id = $3",
          [idx, runAfter, run.id]
        );
        return;
      }
      idx++;
    } else if (type === 'action') {
      await executeAction(step, auto, run, ctx);
      idx++;
    } else if (type === 'condition') {
      const shouldContinue = await evaluateCondition(step, auto, run, ctx);
      idx++;
      if (!shouldContinue) {
        await db.query("UPDATE automation_runs SET status = 'completed', run_after = NULL, updated_at = NOW() WHERE id = $1", [run.id]);
        await db.query('UPDATE automations SET conversions = conversions + 1 WHERE id = $1', [auto.id]);
        return;
      }
    } else {
      idx++;
    }
    await db.query('UPDATE automation_runs SET step_index = $1, updated_at = NOW() WHERE id = $2', [idx, run.id]);
  }
  await db.query("UPDATE automation_runs SET status = 'completed', run_after = NULL, updated_at = NOW() WHERE id = $1", [run.id]);
  await db.query('UPDATE automations SET runs = runs + 1 WHERE id = $1', [auto.id]);
  await recordActivity(auto.user_id, auto.id, auto.trigger, `✅ Sequence "${auto.name}" completed for ${ctx.entity_name || ctx.name || 'lead'}`, ctx.entity_name || ctx.name || 'Lead', 'CheckCircle2', '#059669');
}

async function triggerAutomation(userId, trigger, context) {
  try {
    const res = await db.query(
      'SELECT * FROM automations WHERE user_id = $1 AND trigger = $2 AND active = TRUE',
      [userId, trigger]
    );
    for (const auto of res.rows) {
      const duplicate = await db.query(
        "SELECT id FROM automation_runs WHERE user_id = $1 AND automation_id = $2 AND entity_id = $3 AND trigger = $4 AND status IN ('running', 'waiting')",
        [userId, auto.id, context.entity_id || null, trigger]
      );
      if (duplicate.rows.length > 0) continue;
      const runRes = await db.query(
        `INSERT INTO automation_runs (user_id, automation_id, trigger, entity_type, entity_id, context, step_index, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 0, 'running', NOW()) RETURNING *`,
        [userId, auto.id, trigger, context.entity_type || 'lead', context.entity_id || null, JSON.stringify(context)]
      );
      const run = runRes.rows[0];
      await recordActivity(userId, auto.id, trigger, `▶️ Trigger "${trigger}" fired for ${context.entity_name || context.name || 'lead'}`, context.entity_name || context.name || 'Lead', TRIGGER_ICONS[trigger] || 'Zap', TRIGGER_COLORS[trigger] || '#4F35A8');
      await processRun(run);
    }
  } catch (err) {
    console.error(`[automation] trigger "${trigger}" error:`, err.message);
  }
}

async function processDueAutomations() {
  try {
    const due = await db.query(
      "SELECT * FROM automation_runs WHERE status = 'waiting' AND run_after IS NOT NULL AND run_after <= NOW() LIMIT 20"
    );
    for (const run of due.rows) {
      await processRun(run);
    }
  } catch (err) {
    console.error('[automation] sweep error:', err.message);
  }
}

async function processNoResponseTriggers() {
  try {
    const active = await db.query(
      "SELECT user_id FROM automations WHERE trigger = 'no_response' AND active = TRUE"
    );
    const userIds = [...new Set(active.rows.map(r => r.user_id))];
    for (const userId of userIds) {
      const stale = await db.query(
        `SELECT id, first_name, last_name, phone, company, email, status FROM leads
         WHERE user_id = $1 AND status IN ('New', 'Contacted') AND created_at < NOW() - INTERVAL '48 hours'
         AND id NOT IN (
           SELECT entity_id FROM automation_runs WHERE user_id = $1 AND trigger = 'no_response' AND entity_type = 'lead'
         )
         LIMIT 10`,
        [userId]
      );
      for (const lead of stale.rows) {
        await triggerAutomation(userId, 'no_response', {
          entity_type: 'lead',
          entity_id: lead.id,
          entity_name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || lead.email || 'Lead',
          first_name: lead.first_name,
          last_name: lead.last_name,
          name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
          phone: lead.phone,
          company: lead.company,
          email: lead.email,
          status: lead.status,
          service: 'Aura Skin Clinic',
        });
      }
    }
  } catch (err) {
    console.error('[automation] no_response sweep error:', err.message);
  }
}

async function init() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS automations (
        id SERIAL PRIMARY KEY,
        user_id INT,
        name TEXT,
        trigger TEXT,
        description TEXT,
        active BOOLEAN DEFAULT FALSE,
        runs INT DEFAULT 0,
        conversions INT DEFAULT 0,
        steps JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await db.query(`ALTER TABLE automations ADD COLUMN IF NOT EXISTS user_id INT;`);
    await db.query(`ALTER TABLE automations ADD COLUMN IF NOT EXISTS org_id INT;`);
    await db.query(`UPDATE automations SET user_id = org_id WHERE user_id IS NULL AND org_id IS NOT NULL;`);
    await db.query(`UPDATE automations SET org_id = user_id WHERE org_id IS NULL AND user_id IS NOT NULL;`);
    await db.query(`ALTER TABLE automations ADD COLUMN IF NOT EXISTS name TEXT;`);
    await db.query(`ALTER TABLE automations ADD COLUMN IF NOT EXISTS trigger TEXT;`);
    await db.query(`ALTER TABLE automations ADD COLUMN IF NOT EXISTS description TEXT;`);
    await db.query(`ALTER TABLE automations ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT FALSE;`);
    await db.query(`ALTER TABLE automations ADD COLUMN IF NOT EXISTS runs INT DEFAULT 0;`);
    await db.query(`ALTER TABLE automations ADD COLUMN IF NOT EXISTS conversions INT DEFAULT 0;`);
    await db.query(`ALTER TABLE automations ADD COLUMN IF NOT EXISTS steps JSONB DEFAULT '[]';`);
    await db.query(`ALTER TABLE automations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();`);
    await db.query(`ALTER TABLE automations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();`);
    await db.query(`
      CREATE TABLE IF NOT EXISTS automation_runs (
        id SERIAL PRIMARY KEY,
        user_id INT,
        automation_id INT,
        trigger TEXT,
        entity_type TEXT,
        entity_id INT,
        context JSONB DEFAULT '{}',
        step_index INT DEFAULT 0,
        run_after TIMESTAMPTZ,
        status TEXT DEFAULT 'running',
        log JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS automation_activity (
        id SERIAL PRIMARY KEY,
        user_id INT,
        automation_id INT,
        trigger TEXT,
        message TEXT,
        entity_name TEXT,
        icon TEXT DEFAULT 'Zap',
        color TEXT DEFAULT '#4F35A8',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('[automations] Tables ready.');
    await seedTemplates();
  } catch (err) {
    console.error('[automations] init error:', err.message);
  }
}

function templateSteps(seedId, steps) {
  return steps.map((s, i) => ({ id: `seed${seedId}_s${i + 1}`, ...s }));
}

const TEMPLATES = [
  {
    trigger: 'new_lead_meta_ad',
    name: 'New Meta Ad Lead — Instant Engage',
    description: 'Reach new ad leads within minutes, then nurture with a 3-day WhatsApp sequence until they respond.',
    steps: templateSteps(1, [
      { type: 'trigger', label: 'Trigger: New Meta Ad Lead', detail: 'Fires the moment a new ad lead is captured', icon: 'Tag', color: '#4F35A8' },
      { type: 'action', label: 'Send WhatsApp Message', detail: 'Hi {{name}} 👋 Thanks for reaching out to Aura Skin Clinic. This is Dr. Aditya Shah’s team — we’d love to understand your skin goals and how we can help. Could you share what you’re currently most concerned about?', icon: 'MessageCircle', color: '#25D366' },
      { type: 'delay', label: 'Wait 6 hours', detail: 'Give the lead time to respond naturally', icon: 'Clock', color: '#6B7280' },
      { type: 'condition', label: 'Check for Response', detail: 'If the lead replied, stop this sequence', icon: 'GitBranch', color: '#D97706' },
      { type: 'action', label: 'Send Follow-Up', detail: 'Hi {{name}}, just following up on my earlier message 😊 We have a few slots opening this week for a free skin consultation. Would you like me to reserve one for you?', icon: 'MessageCircle', color: '#25D366' },
      { type: 'delay', label: 'Wait 3 days', detail: 'Wait 3 days before the final touchpoint', icon: 'Clock', color: '#6B7280' },
      { type: 'condition', label: 'Check for Response', detail: 'If the lead replied, stop this sequence', icon: 'GitBranch', color: '#D97706' },
      { type: 'action', label: 'Send Final Touch', detail: 'Hi {{name}}, I don’t want to miss you! If skin goals are on your mind, we’re here to help at Aura Skin Clinic. Reply "YES" and I’ll book you in for a consultation.', icon: 'MessageCircle', color: '#25D366' },
    ]),
  },
  {
    trigger: 'missed_booking',
    name: 'Missed Booking — Recovery',
    description: 'Automatically re-engage patients who cancel or no-show with a gentle rescheduling sequence.',
    steps: templateSteps(2, [
      { type: 'trigger', label: 'Trigger: Missed Booking', detail: 'Fires when an appointment is cancelled or no-showed', icon: 'AlertCircle', color: '#EF4444' },
      { type: 'delay', label: 'Wait 1 hour', detail: 'Give the patient some breathing room', icon: 'Clock', color: '#6B7280' },
      { type: 'action', label: 'Send Reschedule Message', detail: 'Hi {{name}}, sorry we missed you at Aura Skin Clinic today. No worries at all — would you like to pick a new time that suits you better? I can hold the best slot for you.', icon: 'MessageCircle', color: '#25D366' },
      { type: 'delay', label: 'Wait 1 day', detail: 'Wait 1 day before the second reminder', icon: 'Clock', color: '#6B7280' },
      { type: 'condition', label: 'Check for Response', detail: 'If the patient replied, stop this sequence', icon: 'GitBranch', color: '#D97706' },
      { type: 'action', label: 'Send Reminder', detail: 'Hi {{name}}, just a gentle reminder that we kept a slot open for you. Reply with a convenient day/time and we’ll confirm instantly!', icon: 'MessageCircle', color: '#25D366' },
      { type: 'delay', label: 'Wait 3 days', detail: 'Wait 3 days for the last attempt', icon: 'Clock', color: '#6B7280' },
      { type: 'action', label: 'Send Last Attempt', detail: 'Hi {{name}}, hope all is well. If you’d still like a consultation at Aura Skin Clinic, reply "RESCHEDULE" and we’ll take care of everything.', icon: 'MessageCircle', color: '#25D366' },
    ]),
  },
  {
    trigger: 'no_response',
    name: 'No Response — 5-Day Drip',
    description: 'Re-engage cold leads who never replied with a value-driven WhatsApp drip over 5 days.',
    steps: templateSteps(3, [
      { type: 'trigger', label: 'Trigger: No Response', detail: 'Fires for leads with no reply after 48 hours', icon: 'RotateCcw', color: '#F59E0B' },
      { type: 'delay', label: 'Wait 2 days', detail: 'Wait 2 days before the first re-engagement', icon: 'Clock', color: '#6B7280' },
      { type: 'action', label: 'Send Value Message', detail: 'Hi {{name}}, came across your business and thought this might help — most clinics we work with miss up to 30% of leads simply because the first response is too slow. Want me to share how we fix that?', icon: 'MessageCircle', color: '#25D366' },
      { type: 'delay', label: 'Wait 3 days', detail: 'Wait 3 days before the final value message', icon: 'Clock', color: '#6B7280' },
      { type: 'condition', label: 'Check for Response', detail: 'If the lead replied, stop this sequence', icon: 'GitBranch', color: '#D97706' },
      { type: 'action', label: 'Send Final Value Message', detail: 'Hi {{name}}, last one from me — I’d love to send you a free 10-point digital marketing checklist for your clinic. Just reply "SEND" and it’s yours.', icon: 'MessageCircle', color: '#25D366' },
    ]),
  },
  {
    trigger: 'call_booked',
    name: 'Discovery Call Booked — Pre-Call Warm-Up',
    description: 'Warm up booked discovery calls with confirmations and a pre-call checklist.',
    steps: templateSteps(4, [
      { type: 'trigger', label: 'Trigger: Discovery Call Booked', detail: 'Fires the moment a call is booked via Calendly', icon: 'Calendar', color: '#3B82F6' },
      { type: 'action', label: 'Send Confirmation', detail: 'Hi {{name}}, thanks for booking your discovery call with Dr. Aditya Shah 🎉 You’re all set for {{date}} at {{time}}. I’ll send you a short pre-call checklist shortly!', icon: 'MessageCircle', color: '#25D366' },
      { type: 'delay', label: 'Wait 24 hours', detail: 'Wait 24 hours before the pre-call checklist', icon: 'Clock', color: '#6B7280' },
      { type: 'action', label: 'Send Pre-Call Checklist', detail: 'Hi {{name}}, here’s what to expect on our call: 1) Quick intro of your goals 2) We’ll review your current situation 3) You’ll leave with clear next steps. Nothing to prepare — just bring yourself!', icon: 'MessageCircle', color: '#25D366' },
      { type: 'delay', label: 'Wait 1 hour', detail: 'Send the final reminder 1 hour before', icon: 'Clock', color: '#6B7280' },
      { type: 'action', label: 'Send Call Reminder', detail: '⏰ Reminder {{name}} — your call with Dr. Aditya Shah is today at {{time}}. Here’s your link: {{meeting_link}}. See you there!', icon: 'MessageCircle', color: '#25D366' },
    ]),
  },
  {
    trigger: 'proposal_sent',
    name: 'Proposal Sent — 3-Day Follow-Up',
    description: 'Gently follow up after a proposal is sent so deals never go cold.',
    steps: templateSteps(5, [
      { type: 'trigger', label: 'Trigger: Proposal Sent', detail: 'Fires when a proposal is marked sent', icon: 'Send', color: '#8B5CF6' },
      { type: 'delay', label: 'Wait 1 day', detail: 'Wait 1 day before the first follow-up', icon: 'Clock', color: '#6B7280' },
      { type: 'action', label: 'Send Follow-Up', detail: 'Hi {{name}}, sending this as a quick nudge — did you get a chance to look through the proposal we sent? Happy to walk you through it if any part is unclear.', icon: 'MessageCircle', color: '#25D366' },
      { type: 'delay', label: 'Wait 2 days', detail: 'Wait 2 days before the second follow-up', icon: 'Clock', color: '#6B7280' },
      { type: 'condition', label: 'Check for Response', detail: 'If the lead replied, stop this sequence', icon: 'GitBranch', color: '#D97706' },
      { type: 'action', label: 'Send Second Follow-Up', detail: 'Hi {{name}}, just checking in once more — if now isn’t the right time, totally fine, we can revisit later. If you’d like to move ahead, I’ll have the team ready to start this week.', icon: 'MessageCircle', color: '#25D366' },
    ]),
  },
  {
    trigger: 'lead_lost',
    name: 'Lead Lost — 90-Day Reactivation',
    description: 'Stay top-of-mind with lost leads through a quarterly reactivation sequence.',
    steps: templateSteps(6, [
      { type: 'trigger', label: 'Trigger: Lead Lost / Cold', detail: 'Fires when a lead is marked lost or cold', icon: 'Star', color: '#6B7280' },
      { type: 'delay', label: 'Wait 30 days', detail: 'Wait 30 days before the first check-in', icon: 'Clock', color: '#6B7280' },
      { type: 'action', label: 'Send Check-In', detail: 'Hi {{name}}, just a friendly check-in from Aura Skin Clinic. If your situation has changed, we’d love to pick the conversation back up. No pressure either way!', icon: 'MessageCircle', color: '#25D366' },
      { type: 'delay', label: 'Wait 30 days', detail: 'Wait 30 days before the second check-in', icon: 'Clock', color: '#6B7280' },
      { type: 'condition', label: 'Check for Response', detail: 'If the lead replied, stop this sequence', icon: 'GitBranch', color: '#D97706' },
      { type: 'action', label: 'Send Second Check-In', detail: 'Hi {{name}}, we now have some new treatments that may be a better fit for you. Open to a quick 10-minute call to see?', icon: 'MessageCircle', color: '#25D366' },
      { type: 'delay', label: 'Wait 30 days', detail: 'Wait 30 days for the final reactivation touch', icon: 'Clock', color: '#6B7280' },
      { type: 'action', label: 'Send Final Reactivation', detail: 'Hi {{name}}, this is our last check-in for a while. If you ever want a complimentary skin consultation at Aura Skin Clinic, just reply "REACTIVATE". Wishing you well either way!', icon: 'MessageCircle', color: '#25D366' },
    ]),
  },
];

async function seedTemplates() {
  try {
    const users = await db.query('SELECT id FROM users');
    for (const { id: userId } of users.rows) {
      const existing = await db.query('SELECT COUNT(*)::int AS c FROM automations WHERE user_id = $1', [userId]);
      if (existing.rows[0].c > 0) continue;
      for (const t of TEMPLATES) {
        await db.query(
          `INSERT INTO automations (user_id, name, trigger, description, active, runs, conversions, steps, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, 0, 0, $6, NOW(), NOW())`,
          [userId, t.name, t.trigger, t.description, false, JSON.stringify(t.steps)]
        );
      }
      console.log(`[automations] Seeded ${TEMPLATES.length} templates for user ${userId}`);
    }
  } catch (err) {
    console.error('[automations] seed error:', err.message);
  }
}

function registerAutomationRoutes(app, resolveUserId) {
  app.get('/api/automations', async (req, res) => {
    try {
      await processDueAutomations();
      await processNoResponseTriggers();
      const userId = await resolveUserId(req.query.email, req.headers.cookie);
      if (!userId) return res.json({ automations: [] });
      const r = await db.query('SELECT * FROM automations WHERE user_id = $1 ORDER BY id ASC', [userId]);
      const automations = r.rows.map(row => ({
        ...row,
        steps: typeof row.steps === 'string' ? JSON.parse(row.steps) : row.steps || [],
      }));
      res.json({ automations });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/automations/activity', async (req, res) => {
    try {
      const userId = await resolveUserId(req.query.email, req.headers.cookie);
      if (!userId) return res.json({ activity: [] });
      const r = await db.query(
        'SELECT * FROM automation_activity WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30',
        [userId]
      );
      res.json({ activity: r.rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/automations', async (req, res) => {
    try {
      const userId = await resolveUserId(req.body.email, req.headers.cookie);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const { name, trigger, description, steps } = req.body.data || req.body;
      if (!name || !String(name).trim()) return res.status(400).json({ error: 'Name is required' });
      const r = await db.query(
        `INSERT INTO automations (user_id, name, trigger, description, active, runs, conversions, steps, created_at, updated_at)
         VALUES ($1, $2, $3, $4, FALSE, 0, 0, $5, NOW(), NOW()) RETURNING *`,
        [userId, name.trim(), trigger || 'new_lead_meta_ad', description || '', JSON.stringify(Array.isArray(steps) ? steps : [])]
      );
      res.status(201).json({ automation: r.rows[0] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/automations/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const body = req.body.data || req.body;
      const sets = [];
      const params = [];
      ['name', 'trigger', 'description', 'steps', 'active', 'runs', 'conversions'].forEach(key => {
        if (body[key] === undefined) return;
        if (key === 'steps') {
          params.push(JSON.stringify(body[key]));
          sets.push(`steps = $${params.length}`);
        } else {
          params.push(body[key]);
          sets.push(`${key} = $${params.length}`);
        }
      });
      if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
      params.push(id);
      const r = await db.query(
        `UPDATE automations SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`,
        params
      );
      if (r.rows.length === 0) return res.status(404).json({ error: 'Automation not found' });
      res.json({ automation: r.rows[0] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/automations/:id', async (req, res) => {
    try {
      const { id } = req.params;
      await db.query('DELETE FROM automation_runs WHERE automation_id = $1', [id]);
      await db.query('DELETE FROM automation_activity WHERE automation_id = $1', [id]);
      await db.query('DELETE FROM automations WHERE id = $1', [id]);
      res.json({ success: true, id: Number(id) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

setInterval(() => {
  processDueAutomations();
  processNoResponseTriggers();
}, 60000).unref();

module.exports = { init, triggerAutomation, processDueAutomations, registerAutomationRoutes };
