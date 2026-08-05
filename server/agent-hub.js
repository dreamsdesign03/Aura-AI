const db = require('./db');
const nodemailer = require('nodemailer');

const GEMINI_MODEL = 'gemini-1.5-flash-latest';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const APOLLO_BASE = 'https://api.apollo.io/api/v1';

const AGENT_DEFAULTS = {
  brain: { active: true },
  scout: { active: true },
  sales: { active: true, config: { dailyCap: 50 } },
  followup: { active: true, config: { dailyCap: 15 } },
  lead_hunter: { active: true, config: { frequency: '24h', minQualScore: 60, dailyTarget: 10, sources: ['apollo', 'gemini'] } },
  autopilot_email: { active: true },
};

const AGENT_NAMES = {
  brain: 'Brain Orchestrator',
  scout: 'Scout Agent',
  sales: 'Sales Agent',
  followup: 'Follow-up Agent',
  lead_hunter: 'Lead Hunter',
  autopilot_email: 'Email Autopilot',
};

const FOLLOWUP_DAYS = [3, 6, 9, 14];

function todayStartSql() {
  return `(NOW() - interval '5 hours 30 minutes')::date::timestamp + interval '5 hours 30 minutes'`;
}

async function init() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS agent_settings (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL,
        agent_key TEXT NOT NULL,
        active BOOLEAN DEFAULT TRUE,
        config JSONB DEFAULT '{}',
        last_run_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (user_id, agent_key)
      );
      CREATE TABLE IF NOT EXISTS agent_activity (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL,
        agent_name TEXT,
        activity_type TEXT,
        status TEXT DEFAULT 'completed',
        lead_name TEXT,
        company_name TEXT,
        detail TEXT,
        error_message TEXT,
        executed_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS agent_toggle_history (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL,
        agent_name TEXT,
        detail JSONB DEFAULT '{}',
        executed_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS website_status TEXT;
      CREATE INDEX IF NOT EXISTS idx_agent_activity_user ON agent_activity (user_id, executed_at DESC);
    `);
    console.log('[agent-hub] tables ready');
  } catch (e) {
    console.error('[agent-hub] init error:', e.message);
  }
}

async function ensureSettings(userId) {
  if (!userId) return;
  for (const [key, def] of Object.entries(AGENT_DEFAULTS)) {
    try {
      await db.query(
        `INSERT INTO agent_settings (user_id, agent_key, active, config)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, agent_key) DO NOTHING`,
        [userId, key, def.active === false ? false : true, def.config || {}]
      );
    } catch (e) {
      console.error('[agent-hub] ensureSettings error:', e.message);
    }
  }
}

async function getSetting(userId, key) {
  try {
    const r = await db.query('SELECT * FROM agent_settings WHERE user_id = $1 AND agent_key = $2', [userId, key]);
    if (r.rows.length === 0) return { active: true, config: AGENT_DEFAULTS[key]?.config || {}, lastRunAt: null };
    return {
      active: r.rows[0].active,
      config: r.rows[0].config || {},
      lastRunAt: r.rows[0].last_run_at,
    };
  } catch (e) {
    console.error('[agent-hub] getSetting error:', e.message);
    return { active: true, config: {}, lastRunAt: null };
  }
}

async function setLastRun(userId, key) {
  try {
    await db.query(`UPDATE agent_settings SET last_run_at = NOW(), updated_at = NOW() WHERE user_id = $1 AND agent_key = $2`, [userId, key]);
  } catch {}
}

async function setActive(userId, key, active) {
  try {
    await db.query(`UPDATE agent_settings SET active = $3, updated_at = NOW() WHERE user_id = $1 AND agent_key = $2`, [userId, key, active]);
  } catch (e) {
    console.error('[agent-hub] setActive error:', e.message);
  }
}

async function recordActivity(userId, entry) {
  const { agentName, activityType, status, leadName, companyName, detail, errorMessage } = entry || {};
  try {
    if (leadName || companyName) {
      await db.query(
        `DELETE FROM agent_activity 
         WHERE user_id = $1 
           AND COALESCE(lead_name, '') = COALESCE($2, '') 
           AND COALESCE(company_name, '') = COALESCE($3, '')`,
        [userId, leadName || '', companyName || '']
      );
    }
    await db.query(
      `INSERT INTO agent_activity (user_id, agent_name, activity_type, status, lead_name, company_name, detail, error_message, executed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [userId, agentName || 'Agent', activityType || 'email_sent', status || 'completed', leadName || null, companyName || null, detail || null, errorMessage || null]
    );
  } catch (e) {
    console.error('[agent-hub] recordActivity error:', e.message);
  }
}

async function recordToggle(userId, agentName, active, userName) {
  try {
    await db.query(
      `INSERT INTO agent_toggle_history (user_id, agent_name, detail, executed_at)
       VALUES ($1, $2, $3, NOW())`,
      [userId, agentName, JSON.stringify({ active, userName: userName || 'User' })]
    );
  } catch (e) {
    console.error('[agent-hub] recordToggle error:', e.message);
  }
}

async function userNameFor(userId) {
  try {
    const r = await db.query('SELECT first_name, last_name FROM users WHERE id = $1', [userId]);
    if (r.rows.length === 0) return 'User';
    return [r.rows[0].first_name, r.rows[0].last_name].filter(Boolean).join(' ') || 'User';
  } catch {
    return 'User';
  }
}

async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.length < 10) throw new Error('GEMINI_API_KEY not configured');
  const res = await fetch(GEMINI_URL + `?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7 } }),
  });
  if (!res.ok) throw new Error(`Gemini failed (${res.status})`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
  return text;
}

async function getTransporter(userId) {
  let config = {};
  if (userId) {
    try {
      const sRes = await db.query('SELECT * FROM smtp_settings WHERE user_id = $1', [userId]);
      if (sRes.rows.length > 0) {
        const s = sRes.rows[0];
        config = { host: s.host, port: s.port, user: s.smtp_user, pass: s.pass, fromEmail: s.from_email, fromName: s.from_name };
      }
    } catch {}
  }
  const host = config.host || process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = config.port || Number(process.env.SMTP_PORT) || 587;
  const user = config.user || process.env.SMTP_USER || 'dreamsdesign.in03@gmail.com';
  const pass = config.pass || process.env.SMTP_PASS || '';
  const fromEmail = config.fromEmail || process.env.SMTP_FROM || 'dreamsdesign.in03@gmail.com';
  const fromName = config.fromName || process.env.SMTP_FROM_NAME || 'Aura AI';
  const transporter = nodemailer.createTransport({
    host, port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
  });
  return { transporter, fromEmail, fromName, configured: Boolean(user && pass) };
}

async function sendAgentEmail(userId, { to, toName, subject, body }) {
  try {
    const { transporter, fromEmail, fromName, configured } = await getTransporter(userId);
    if (!configured) return { sent: false, reason: 'SMTP not configured' };
    if (!to) return { sent: false, reason: 'No recipient email' };
    const htmlBody = body ? `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#333">${body.replace(/\n/g, '<br>')}</div>` : '';
    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject: subject || 'No subject',
      text: body || '',
      html: htmlBody,
    });
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

async function checkWebsite(url) {
  const target = String(url || '').trim();
  if (!target) return { status: 'no_website', code: 0 };
  const normalized = /^https?:\/\//i.test(target) ? target : `https://${target}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(normalized, { method: 'GET', redirect: 'follow', signal: controller.signal });
    clearTimeout(timer);
    return { status: res.ok ? 'live' : 'down', code: res.status };
  } catch {
    return { status: 'down', code: 0 };
  }
}

// ── SCOUT AGENT ─────────────────────────────────────────────
async function runScout(userId) {
  const leads = await db.query(
    `SELECT id, first_name, last_name, company, website FROM leads
     WHERE user_id = $1 AND website IS NOT NULL AND website <> '' ORDER BY created_at DESC LIMIT 60`,
    [userId]
  );
  const summary = { ok: true, scanned: 0, live: 0, down: 0, noWebsite: 0 };
  for (const lead of leads.rows) {
    const res = await checkWebsite(lead.website);
    let status = res.status;
    if (status === 'no_website') status = 'live';
    await db.query('UPDATE leads SET website_status = $1 WHERE id = $2', [status === 'live' ? 'live' : status === 'down' ? 'down' : 'error', lead.id]);
    const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.company || 'Lead';
    await recordActivity(userId, {
      agentName: 'Scout Agent',
      activityType: 'scout_website_checked',
      status: status === 'live' ? 'completed' : 'warning',
      leadName: name,
      companyName: lead.company,
      detail: `${lead.website} — ${status === 'live' ? 'live' : `down (HTTP ${res.code || 'no response'})`}`,
      errorMessage: status === 'live' ? null : 'Website down',
    });
    summary.scanned++;
    if (status === 'live') summary.live++;
    else summary.down++;
  }
  await setLastRun(userId, 'scout');
  await recordActivity(userId, {
    agentName: 'Scout Agent',
    activityType: 'audit',
    status: 'completed',
    detail: `Scout scan finished: ${summary.scanned} checked, ${summary.live} live, ${summary.down} down.`,
  });
  return summary;
}

// ── SALES AGENT ─────────────────────────────────────────────
async function createSalesProposal(userId, lead, name) {
  try {
    const company = lead.company || 'Clinic / Healthcare Practice';
    const title = `AI Patient Acquisition & Sales Automation Proposal for ${company}`;
    const services = ['AI Sales Agent', 'WhatsApp Booking Automation', 'High-Ticket Treatment Campaigns', 'Brand Audit Optimization'];
    const investment = 150000;
    const content = {
      executiveSummary: `Aura AI proposes an end-to-end AI Patient Acquisition Engine designed exclusively for ${company}. By automating patient engagement across web, Instagram, and WhatsApp, ${company} will capture high-intent patients for premium treatments (Dermatology, Laser, Aesthetics) 24/7.`,
      understandingAndChallenges: `${company} operates in the highly competitive ${lead.industry || 'aesthetic'} market. Current challenges include after-hours lead drop-off, manual phone booking delays, and no-shows for consultation appointments.`,
      proposedSolution: `1. 24/7 AI Medical Receptionist: Instantly answers patient questions regarding packages, pricing, and prep instructions.\n2. Direct EMR / Calendar Booking: Patients book consultations automatically.\n3. WhatsApp Follow-Up Sequence: Automated appointment reminders & post-treatment care instructions.`,
      scopeAndDeliverables: `- Custom AI Chatbot trained on ${company}'s specific treatment menu & pricing.\n- WhatsApp Business API Integration with multi-agent inbox.\n- Meta & Google Ad Campaign Funnels for High-Margin Procedures.\n- Monthly Performance Dashboard & ROI Reporting.`,
      investmentPackage: `Complete Implementation: ₹1,50,000 (Includes setup, AI model training, WhatsApp API integration, and 30 days of managed growth optimization).`,
      expectedROI: `Projected 35% increase in month-1 appointment volume and 50% reduction in patient no-show rates.`
    };
    await db.query(
      `INSERT INTO proposals (user_id, lead_id, title, services, investment, status, content, created_at)
       VALUES ($1, $2, $3, $4, $5, 'sent', $6, NOW())`,
      [userId, lead.id, title, JSON.stringify(services), investment, JSON.stringify(content)]
    );
  } catch (e) {
    console.error('[agent-hub] createSalesProposal error:', e.message);
  }
}

async function runSales(userId, opts = {}) {
  const { manual = false } = opts;
  const sales = await getSetting(userId, 'sales');
  const emailAutopilot = await getSetting(userId, 'autopilot_email');
  const autopilotActive = Boolean(emailAutopilot.active);
  const dailyCap = Number(sales.config?.dailyCap) || 50;
  const autoSend = sales.config?.autoSend === true;

  if (autoSend && !manual && !autopilotActive) {
    return { ok: true, drafted: 0, sent: 0, skipped: 0, failed: 0, paused: true, reason: 'Email sending is paused — enable Email Autopilot or use Run Now' };
  }

  const sentToday = await db.query(
    `SELECT COUNT(*)::int AS n FROM outreach_emails WHERE user_id = $1 AND status = 'sent' AND sent_at >= ${todayStartSql()}`,
    [userId]
  );

  const leadsRes = await db.query(
    `SELECT l.* FROM leads l
     WHERE l.user_id = $1
       AND l.pipeline_stage NOT IN ('won','lost','call_booked','proposal_sent')
       AND COALESCE(l.email, '') <> ''
       AND (l.website_status IS NULL OR l.website_status NOT IN ('down', 'error'))
       AND NOT EXISTS (
         SELECT 1 FROM outreach_emails oe WHERE oe.lead_id = l.id AND oe.status IN ('sent','draft')
       )
     ORDER BY l.created_at ASC LIMIT 50`,
    [userId]
  );

  const summary = { ok: true, drafted: 0, sent: 0, skipped: 0, failed: 0 };
  const capReachedAtStart = sentToday.rows[0].n >= dailyCap;

  for (const lead of leadsRes.rows) {
    if (sentToday.rows[0].n >= dailyCap) break;
    const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'there';
    let subject = '';
    let body = '';
    try {
      const gen = await callGemini(
        `You are a sales engagement engine for Aura Skin Clinic (Dr. Aditya Shah), a premium aesthetic clinic. Write a personalized PROPOSAL PITCH email (a mini pitch deck in email form) as JSON:
        {
          "subject": "email subject line under 60 chars, no placeholder tokens",
          "body": "4-6 sentence proposal pitch. First line uses the contact first name. Introduce Aura Skin Clinic + Dr. Aditya Shah, then pitch the AI patient-acquisition & sales-automation proposal with 3 high-value points (24/7 AI receptionist & WhatsApp booking automation, high-ticket treatment campaigns, automated follow-ups that cut no-shows). End with a clear call to action to book a 15-minute discovery call. No placeholders like {{name}}."
        }
        LEAD: name=${name}, company=${lead.company || 'unknown'}, title=${lead.title || 'business owner'}, website=${lead.website || 'unknown'}, industry=${lead.industry || ''}, email=${lead.email}`
      );
      const parsed = JSON.parse(gen.replace(/```json|```/g, '').trim());
      subject = parsed.subject || '';
      body = parsed.body || '';
    } catch {
      subject = `Partnership with ${lead.company || 'your clinic'}`;
      body = `Hi ${name},\n\nI run Aura Skin Clinic (Dr. Aditya Shah). We help clinics like ${lead.company || 'yours'} grow patient volume with an AI patient-acquisition engine — 24/7 AI receptionist, WhatsApp booking automation, and high-ticket treatment campaigns.\n\nWould you be open to a quick 15-minute call this week to walk through a tailored proposal?\n\nBest,\nDr. Aditya Shah\nAura Skin Clinic`;
    }

    const ins = await db.query(
      `INSERT INTO outreach_emails (user_id, lead_id, recipient_email, to_email, to_name, company, subject, body, status, created_at)
       VALUES ($1, $2, $3, $3, $4, $5, $6, $7, 'draft', NOW()) RETURNING id`,
      [userId, lead.id, lead.email, name, lead.company || '', subject, body]
    );
    const emailId = ins.rows[0].id;
    summary.drafted++;

    if (!autoSend) {
      await recordActivity(userId, {
        agentName: 'Sales Agent',
        activityType: 'email_drafted',
        status: 'draft',
        leadName: name,
        companyName: lead.company,
        detail: `Drafted proposal pitch "${subject}" → ${lead.email}`,
      });
      continue;
    }

    const result = await sendAgentEmail(userId, { to: lead.email, toName: name, subject, body });
    if (result.sent) {
      await db.query(`UPDATE outreach_emails SET status = 'sent', sent_at = NOW() WHERE id = $1`, [emailId]);
      sentToday.rows[0].n++;
      summary.sent++;
      await createSalesProposal(userId, lead, name);
      await recordActivity(userId, {
        agentName: 'Sales Agent',
        activityType: 'email_sent',
        status: 'completed',
        leadName: name,
        companyName: lead.company,
        detail: `Sent proposal pitch "${subject}" → ${lead.email}`,
      });
    } else {
      await db.query(`UPDATE outreach_emails SET status = 'failed' WHERE id = $1`, [emailId]);
      summary.failed++;
      await recordActivity(userId, {
        agentName: 'Sales Agent',
        activityType: 'email_failed',
        status: 'failed',
        leadName: name,
        companyName: lead.company,
        detail: result.reason || 'Send failed',
        errorMessage: result.reason || 'Send failed',
      });
    }
  }

  if (capReachedAtStart || (summary.drafted === 0 && summary.sent === 0 && summary.failed === 0)) {
    summary.skipped = leadsRes.rows.length;
    await recordActivity(userId, {
      agentName: 'Sales Agent',
      activityType: 'email_sent',
      status: 'skipped',
      detail: capReachedAtStart
        ? `Daily cap (${dailyCap}) reached — ${leadsRes.rows.length} leads found, nothing sent`
        : 'No new leads to pitch',
    });
  }

  await setLastRun(userId, 'sales');
  return summary;
}

// ── FOLLOW-UP AGENT ─────────────────────────────────────────
async function runFollowup(userId) {
  const followup = await getSetting(userId, 'followup');
  const dailyCap = Number(followup.config?.dailyCap) || 15;
  const emailAutopilot = await getSetting(userId, 'autopilot_email');

  const leadsRes = await db.query(
    `SELECT l.* FROM leads l
     WHERE l.user_id = $1
       AND l.pipeline_stage NOT IN ('won','lost','call_booked','proposal_sent')
       AND EXISTS (SELECT 1 FROM outreach_emails oe WHERE oe.lead_id = l.id AND oe.status = 'sent')
     ORDER BY l.created_at ASC LIMIT 40`,
    [userId]
  );

  const summary = { ok: true, due: 0, sent: 0, skipped: 0, failed: 0 };
  const dueLeads = [];

  for (const lead of leadsRes.rows) {
    const emails = await db.query(
      `SELECT id, subject, body, sent_at FROM outreach_emails
       WHERE lead_id = $1 AND user_id = $2 AND status = 'sent' ORDER BY sent_at ASC`,
      [lead.id, userId]
    );
    if (emails.rows.length === 0) continue;
    const followupCount = emails.rows.length - 1;
    if (followupCount >= FOLLOWUP_DAYS.length) continue;
    const lastSent = new Date(emails.rows[emails.rows.length - 1].sent_at);
    const daysSince = (Date.now() - lastSent.getTime()) / 86400000;
    if (daysSince < FOLLOWUP_DAYS[followupCount]) continue;
    dueLeads.push({ lead, followupCount, daysSince: Math.round(daysSince) });
  }

  const sentToday = await db.query(
    `SELECT COUNT(*)::int AS n FROM outreach_emails WHERE user_id = $1 AND status = 'sent' AND sent_at >= ${todayStartSql()}`,
    [userId]
  );
  const canSend = emailAutopilot.active && sentToday.rows[0].n < dailyCap;

  for (const { lead, followupCount, daysSince } of dueLeads) {
    summary.due++;
    const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'there';
    let subject = '';
    let body = '';
    try {
      const gen = await callGemini(
        `You are a follow-up engine for Aura Skin Clinic (Dr. Aditya Shah). Write follow-up email number ${followupCount + 1} (this is the D${FOLLOWUP_DAYS[followupCount]} follow-up, ${daysSince} days since last contact) as JSON:
        {"subject": "subject under 60 chars, no placeholders", "body": "short warm email referencing the previous outreach, add one new value point about modern aesthetic treatments, propose a 15-min call. No placeholders like {{name}}."}
        LEAD: name=${name}, company=${lead.company || 'business'}, email=${lead.email}`
      );
      const parsed = JSON.parse(gen.replace(/```json|```/g, '').trim());
      subject = parsed.subject || '';
      body = parsed.body || '';
    } catch {
      subject = `Re: quick follow-up`;
      body = `Hi ${name},\n\nJust bumping this — I'd love to walk you through how Aura Skin Clinic partners with clinics like ${lead.company || 'yours'}.\n\nAre you free for 15 minutes this week?\n\nBest,\nDr. Aditya Shah\nAura Skin Clinic`;
    }

    const ins = await db.query(
      `INSERT INTO outreach_emails (user_id, lead_id, recipient_email, to_email, to_name, company, subject, body, status, created_at)
       VALUES ($1, $2, $3, $3, $4, $5, $6, $7, 'draft', NOW()) RETURNING id`,
      [userId, lead.id, lead.email, name, lead.company || '', subject, body]
    );

    if (canSend && sentToday.rows[0].n < dailyCap) {
      const result = await sendAgentEmail(userId, { to: lead.email, toName: name, subject, body });
      if (result.sent) {
        await db.query(`UPDATE outreach_emails SET status = 'sent', sent_at = NOW() WHERE id = $1`, [ins.rows[0].id]);
        sentToday.rows[0].n++;
        summary.sent++;
        await recordActivity(userId, {
          agentName: 'Follow-up Agent',
          activityType: 'followup_sent',
          status: 'completed',
          leadName: name,
          companyName: lead.company,
          detail: `D${FOLLOWUP_DAYS[followupCount]} follow-up sent → ${lead.email}`,
        });
      } else {
        await db.query(`UPDATE outreach_emails SET status = 'failed' WHERE id = $1`, [ins.rows[0].id]);
        summary.failed++;
        await recordActivity(userId, {
          agentName: 'Follow-up Agent',
          activityType: 'followup_sent',
          status: 'failed',
          leadName: name,
          companyName: lead.company,
          detail: result.reason || 'Send failed',
          errorMessage: result.reason || 'Send failed',
        });
      }
    } else {
      summary.skipped++;
      await recordActivity(userId, {
        agentName: 'Follow-up Agent',
        activityType: 'followup_sent',
        status: 'skipped',
        leadName: name,
        companyName: lead.company,
        detail: `D${FOLLOWUP_DAYS[followupCount]} follow-up drafted but not sent (paused/cap)`,
      });
    }
  }

  await setLastRun(userId, 'followup');
  return summary;
}

// ── LEAD HUNTER ─────────────────────────────────────────────
function parseCompanySize(size) {
  const ranges = { '1-10': ['1_to_10'], '11-50': ['11_to_50'], '51-200': ['51_to_200'], '201-500': ['201_to_500'], '501-1000': ['501_to_1000'], '1001-5000': ['1001_to_5000'], '5001+': ['5001_to_10000'] };
  if (ranges[size]) return ranges[size];
  if (!size) return ['1_to_50'];
  return [`${size}`];
}

function parseRoles(roles) {
  if (Array.isArray(roles)) return roles;
  if (!roles) return [];
  return String(roles).split(',').map(s => s.trim()).filter(Boolean);
}

function cleanCompanyName(raw) {
  if (!raw) return raw;
  let name = String(raw).trim();
  if (!name) return name;
  const sep = name.match(/\s*(?:[—–|•]|\s-\s)\s*/);
  if (sep) name = name.slice(0, sep.index).trim();
  name = name.replace(/\s+(?:in|at)\s+.{2,}$/i, '');
  name = name.replace(/^(?:Best|Top|Leading|Advanced|Premium|Most|Trusted|No\.?\s?1|Award[\s-]?Winning)\s+/i, '');
  if (name.length > 45) {
    const cut = name.slice(0, 45);
    const ws = cut.lastIndexOf(' ');
    name = (ws > 20 ? cut.slice(0, ws) : cut).trim();
  }
  return name.replace(/[,\s\-]+$/g, '').trim();
}

async function fetchApolloLeads(icp, count, apiKey) {
  if (!apiKey) throw new Error('APOLLO_API_KEY not configured');
  let rawTags = [];
  if (Array.isArray(icp.industries)) rawTags.push(...icp.industries);
  else if (icp.industries) rawTags.push(icp.industries);
  if (Array.isArray(icp.roles)) rawTags.push(...icp.roles);
  else if (icp.roles) rawTags.push(icp.roles);
  const tagList = rawTags.flatMap(t => String(t).split(/[,/&\s]+/)).map(t => t.trim().toLowerCase()).filter(t => t.length > 2);
  const keywordTags = Array.from(new Set(tagList)).slice(0, 6);
  const locations = Array.isArray(icp.markets) ? icp.markets : icp.markets ? [icp.markets] : ['India'];

  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'x-api-key': apiKey, 'api-key': apiKey };
  const body = { api_key: apiKey, page: 1, per_page: Math.max(Math.min(count * 2, 25), 10) };
  if (keywordTags.length) body.q_organization_keyword_tags = keywordTags;
  if (locations.length) body.organization_locations = locations;

  const orgRes = await fetch(`${APOLLO_BASE}/organizations/search`, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!orgRes.ok) throw new Error(`Apollo org search failed (${orgRes.status})`);
  const orgData = await orgRes.json();
  const accounts = orgData.accounts || [];
  if (accounts.length === 0) return [];

  const people = [];
  for (const account of accounts) {
    if (people.length >= count) break;
    try {
      const pRes = await fetch(`${APOLLO_BASE}/mixed_people/search`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          api_key: apiKey,
          page: 1,
          per_page: 5,
          organization_ids: [account.id],
          person_titles: parseRoles(icp.roles).length ? parseRoles(icp.roles) : ['Founder', 'CEO', 'Owner', 'Director'],
          organization_num_employees_ranges: parseCompanySize(icp.company_size),
        }),
      });
      const pData = await pRes.json();
      for (const p of pData.people || []) {
        if (people.length >= count) break;
        const email = p.email || '';
        if (!email) continue;
        people.push({
          firstName: p.first_name || '',
          lastName: p.last_name || '',
          email,
          phone: p.phone || '',
          company: cleanCompanyName((p.organization && p.organization.name) || account.name || ''),
          title: p.title || '',
          website: (p.organization && p.organization.website_url) || account.website_url || '',
          industry: (p.organization && p.organization.industry) || '',
          linkedin: p.linkedin_url || '',
          source: 'apollo',
        });
      }
    } catch {
      continue;
    }
  }
  return people.slice(0, count);
}

async function fetchGeminiLeads(icp, count) {
  const icpDesc = [
    icp.name || 'Aura Skin Clinic ICP',
    icp.industries ? `Industries: ${icp.industries}` : '',
    icp.roles ? `Roles: ${icp.roles}` : '',
    icp.markets ? `Markets: ${icp.markets}` : '',
    icp.company_size ? `Company size: ${icp.company_size}` : '',
  ].filter(Boolean).join(' | ');
  const gen = await callGemini(
    `You are a B2B Lead Generation & Market Intelligence Expert. Generate EXACTLY ${count} REAL businesses that EXACTLY match this ICP. DO NOT invent, guess, or fabricate any business or person — only real, verifiable prospects with their real owner/decision-maker names.
Rules:
1. company MUST be the SHORT brand/business name only (e.g. "Cutis Skin & Laser Clinic") — NEVER a tagline, service list, SEO title, or anything with "—", "|", "Best", or a location like "in Mumbai".
2. firstName and lastName MUST be the real decision-maker's person name, NOT the business name.
3. title is the real job title (e.g. Founder, CEO, Medical Director, Owner).
4. email/phone/website must be the business's real contact details.
5. country MUST be the REAL city & country where the business is actually located — NEVER guessed or filled with the ICP's default location; if you don't know the real location, output "".
Output ONLY JSON array (no markdown) of objects with keys: firstName, lastName, email, phone, company, title, website, industry, country.\nICP: ${icpDesc}`
  );
  const arr = JSON.parse(gen.replace(/```json|```/g, '').trim());
  return (Array.isArray(arr) ? arr : []).slice(0, count).map(l => ({
    ...l,
    company: cleanCompanyName(l.company || ''),
    linkedin: '',
    source: 'gemini',
  }));
}

async function runLeadHunter(userId, onEvent) {
  const hunter = await getSetting(userId, 'lead_hunter');
  const config = hunter.config || {};
  const dailyTarget = Number(config.dailyTarget) || 10;

  const icpsRes = await db.query('SELECT * FROM icps WHERE user_id = $1 AND COALESCE(active, true) ORDER BY created_at DESC LIMIT 3', [userId]);
  let icps = icpsRes.rows;
  if (icps.length === 0) {
    icps = [{ name: 'Aesthetic clinics & wellness centers', markets: ['India'], industries: ['Health, Wellness and Fitness'], roles: 'Founder,Owner,Director', company_size: '1-50' }];
  }

  const summary = { ok: true, found: 0, added: 0, qualified: 0, skipped: 0 };
  const perIcp = Math.max(1, Math.ceil(dailyTarget / icps.length));
  const seenEmails = new Set();

  const apolloKey = process.env.APOLLO_API_KEY;
  const useApollo = apolloKey && apolloKey.length > 10 && (config.sources || []).includes('apollo');

  for (const icp of icps) {
    if (summary.added >= dailyTarget) break;
    let candidates = [];
    try {
      candidates = useApollo
        ? await fetchApolloLeads(icp, Math.min(perIcp, dailyTarget - summary.added), apolloKey)
        : await fetchGeminiLeads(icp, Math.min(perIcp, dailyTarget - summary.added));
    } catch (err) {
      onEvent && onEvent({ type: 'status', message: `ICP "${icp.name}": ${err.message}` });
      continue;
    }

    for (const c of candidates) {
      if (summary.added >= dailyTarget) break;
      const email = String(c.email || '').trim().toLowerCase();
      if (!email || seenEmails.has(email)) { summary.skipped++; continue; }
      seenEmails.add(email);
      const dup = await db.query('SELECT id FROM leads WHERE user_id = $1 AND LOWER(COALESCE(email, \'\')) = $2', [userId, email]);
      if (dup.rows.length > 0) { summary.skipped++; continue; }
      summary.found++;
      const personFirstName = cleanCompanyName(String(c.firstName || '').split(/[,/&\s]+/)[0]) || c.company || 'Lead';
      const personLastName = cleanCompanyName(c.lastName || '');
      const ins = await db.query(
        `INSERT INTO leads (user_id, first_name, last_name, email, phone, company, title, website, industry, country, linkedin, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [userId, personFirstName, personLastName, email, c.phone || '', c.company || '', c.title || '', c.website || '', c.industry || '', c.country || '', c.linkedin || '', c.source || 'gemini']
      );
      summary.added++;
      const lead = { id: ins.rows[0].id, ...c, firstName: personFirstName, lastName: personLastName };
      onEvent && onEvent({ type: 'lead', lead, icp: icp.name });
    }
  }

  summary.qualified = summary.found;
  await db.query(
    `UPDATE agent_settings SET config = config || $3::jsonb, last_run_at = NOW(), updated_at = NOW()
     WHERE user_id = $1 AND agent_key = 'lead_hunter'`,
    [userId, null, JSON.stringify({
      totalLeadsFound: Number(config.totalLeadsFound) + summary.found,
      totalQualified: Number(config.totalQualified) + summary.qualified,
      totalPipelineAdded: Number(config.totalPipelineAdded) + summary.added,
      lastHuntDate: new Date().toISOString().slice(0, 10),
    })]
  );
  await setLastRun(userId, 'lead_hunter');
  return summary;
}

async function runBrain(userId) {
  const scout = await runScout(userId);
  const sales = await runSales(userId);
  const followup = await runFollowup(userId);
  await setLastRun(userId, 'brain');
  return { ok: true, scout, sales, followup };
}

async function runAgent(userId, key, opts = {}) {
  switch (key) {
    case 'scout': return runScout(userId);
    case 'sales': return runSales(userId, opts);
    case 'followup': return runFollowup(userId);
    case 'lead_hunter': return runLeadHunter(userId);
    case 'brain': return runBrain(userId);
    default: return { ok: false, reason: `Unknown agent: ${key}` };
  }
}

// ── STATUS / METRICS ────────────────────────────────────────
async function buildEmailHealth(userId) {
  const sentTodayRes = await db.query(
    `SELECT COUNT(*)::int AS n FROM outreach_emails WHERE user_id = $1 AND status = 'sent' AND sent_at >= ${todayStartSql()}`,
    [userId]
  );
  const failedTodayRes = await db.query(
    `SELECT COUNT(*)::int AS n FROM outreach_emails WHERE user_id = $1 AND status = 'failed' AND sent_at >= ${todayStartSql()}`,
    [userId]
  );
  const sentToday = sentTodayRes.rows[0].n;
  const failedToday = failedTodayRes.rows[0].n;
  const gmailDailyLimit = 500;
  const usagePct = Math.min(100, Math.round((sentToday / gmailDailyLimit) * 100));
  return {
    sentToday,
    failedToday,
    gmailDailyLimit,
    usagePct,
    limitCritical: sentToday >= gmailDailyLimit,
    limitWarning: sentToday >= gmailDailyLimit * 0.8,
  };
}

async function buildEmailHistory(userId) {
  const r = await db.query(
    `SELECT (sent_at AT TIME ZONE 'Asia/Kolkata')::date AS day, status, COUNT(*)::int AS n
     FROM outreach_emails WHERE user_id = $1 AND sent_at IS NOT NULL
     GROUP BY day, status ORDER BY day DESC LIMIT 14`,
    [userId]
  );
  const byDay = new Map();
  for (const row of r.rows) {
    const key = row.day.toISOString().slice(0, 10);
    const cur = byDay.get(key) || { delivered: 0, failed: 0 };
    if (row.status === 'sent') cur.delivered += row.n;
    else if (row.status === 'failed') cur.failed += row.n;
    byDay.set(key, cur);
  }
  return Array.from(byDay.entries()).map(([day, v]) => ({ dayLabel: day, ...v }));
}

async function buildEmailFailureHealth(userId) {
  const r = await db.query(
    `SELECT activity_type, detail, error_message, executed_at
     FROM agent_activity WHERE user_id = $1 AND activity_type IN ('email_sent','email_failed','followup_sent')
     ORDER BY executed_at DESC LIMIT 50`,
    [userId]
  );
  let consecutive = 0;
  let lastFailureError = '';
  for (const row of r.rows) {
    const failed = row.activity_type === 'email_failed' || (row.activity_type === 'followup_sent' && row.status === 'failed');
    const isEmailFailed = row.activity_type === 'email_failed';
    if (isEmailFailed || (row.activity_type === 'followup_sent' && row.status === 'failed')) {
      consecutive++;
      lastFailureError = row.error_message || row.detail || lastFailureError;
    } else break;
  }
  const threshold = 5;
  return {
    consecutiveFailures: consecutive,
    threshold,
    isCritical: consecutive >= threshold,
    lastFailureError,
    fetchedAt: new Date().toISOString(),
  };
}

async function buildPipelineStats(userId) {
  const total = await db.query(`SELECT COUNT(*)::int AS n FROM leads WHERE user_id = $1`, [userId]);
  const stages = await db.query(
    `SELECT COALESCE(NULLIF(pipeline_stage, ''), 'Lead In') AS stage, COUNT(*)::int AS n
     FROM leads WHERE user_id = $1 GROUP BY 1 ORDER BY n DESC`,
    [userId]
  );
  const stageCount = {};
  for (const row of stages.rows) stageCount[row.stage] = row.n;
  return { total: total.rows[0].n, stageCount };
}

async function buildWarmup(userId) {
  const r = await db.query(
    `SELECT activity_type, status, executed_at FROM agent_activity
     WHERE user_id = $1 AND activity_type IN ('email_sent','email_failed','followup_sent')
     ORDER BY executed_at DESC LIMIT 50`,
    [userId]
  );
  let failed = 0, total = 0;
  for (const row of r.rows) {
    if (row.activity_type === 'email_sent' && row.status === 'completed') total++;
    else if (row.activity_type === 'followup_sent' && row.status === 'completed') total++;
    else if (row.activity_type === 'email_failed' || row.status === 'failed') { failed++; total++; }
  }
  const firstRes = await db.query(
    `SELECT MIN(sent_at) AS first_send FROM outreach_emails WHERE user_id = $1 AND status = 'sent'`,
    [userId]
  );
  const firstSend = firstRes.rows[0].first_send;
  let sendingDay = 0, weekNumber = 1, dailyCap = 15;
  if (firstSend) {
    const days = Math.floor((Date.now() - new Date(firstSend).getTime()) / 86400000) + 1;
    sendingDay = Math.max(1, days);
    weekNumber = Math.min(4, Math.ceil(sendingDay / 7));
    const caps = [15, 25, 40, 80];
    dailyCap = caps[weekNumber - 1];
  }
  const sentToday = await db.query(
    `SELECT COUNT(*)::int AS n FROM outreach_emails WHERE user_id = $1 AND status = 'sent' AND sent_at >= ${todayStartSql()}`,
    [userId]
  );
  return {
    bounceRate: total > 0 ? failed / total : 0,
    sentToday: sentToday.rows[0].n,
    dailyCap,
    sendingDay,
    weekNumber,
    firstSendDate: firstSend ? new Date(firstSend).toISOString() : null,
  };
}

async function buildStatus(userId) {
  await ensureSettings(userId);
  const [brain, scout, sales, followup, hunter, emailAutopilot] = await Promise.all([
    getSetting(userId, 'brain'),
    getSetting(userId, 'scout'),
    getSetting(userId, 'sales'),
    getSetting(userId, 'followup'),
    getSetting(userId, 'lead_hunter'),
    getSetting(userId, 'autopilot_email'),
  ]);

  const today = todayStartSql();
  const [leadsHunted, meetings, sentEmails, failedEmails, followups, whatsapp, scanned, proposals, errorsCount] = await Promise.all([
    db.query(`SELECT COUNT(*)::int AS n FROM leads WHERE user_id = $1 AND created_at >= ${today} AND source IN ('apollo','gemini')`, [userId]),
    db.query(`SELECT COUNT(*)::int AS n FROM calendly_events WHERE user_id = $1 AND created_at >= ${today} AND status IN ('confirmed','completed','scheduled')`, [userId]),
    db.query(`SELECT COUNT(*)::int AS n FROM outreach_emails WHERE user_id = $1 AND status = 'sent' AND sent_at >= ${today}`, [userId]),
    db.query(`SELECT COUNT(*)::int AS n FROM outreach_emails WHERE user_id = $1 AND status = 'failed' AND sent_at >= ${today}`, [userId]),
    db.query(`SELECT COUNT(*)::int AS n FROM agent_activity WHERE user_id = $1 AND activity_type = 'followup_sent' AND status = 'completed' AND executed_at >= ${today}`, [userId]),
    db.query(`SELECT COUNT(*)::int AS n FROM agent_activity WHERE user_id = $1 AND activity_type = 'whatsapp_sent' AND status = 'completed' AND executed_at >= ${today}`, [userId]),
    db.query(`SELECT COUNT(*)::int AS n FROM agent_activity WHERE user_id = $1 AND activity_type = 'scout_website_checked' AND executed_at >= ${today}`, [userId]),
    db.query(`SELECT COUNT(*)::int AS n FROM proposals WHERE user_id = $1 AND created_at >= ${today}`, [userId]),
    db.query(`SELECT COUNT(*)::int AS n FROM agent_activity WHERE user_id = $1 AND status = 'failed' AND executed_at >= ${today}`, [userId]),
  ]);

  const totals = await db.query(
    `SELECT
       (SELECT COUNT(*)::int FROM proposals WHERE user_id = $1) AS proposals,
       (SELECT COUNT(*)::int FROM agent_activity WHERE user_id = $1 AND activity_type = 'followup_sent' AND status = 'completed') AS followups`,
    [userId]
  );

  const recentErrors = await db.query(
    `SELECT detail, error_message, executed_at FROM agent_activity
     WHERE user_id = $1 AND status = 'failed' ORDER BY executed_at DESC LIMIT 5`,
    [userId]
  );

  const emailHealth = await buildEmailHealth(userId);
  const warmup = await buildWarmup(userId);

  return {
    orchestrator: {
      brainActive: brain.active,
      scoutActive: scout.active,
      salesActive: sales.active,
      followupActive: followup.active,
      autopilotEmailPaused: !emailAutopilot.active,
      lastBrainTick: brain.lastRunAt,
      lastScoutRun: scout.lastRunAt,
      lastSalesRun: sales.lastRunAt,
      lastFollowupRun: followup.lastRunAt,
      totalProposalsSent: totals.rows[0].proposals,
      totalFollowupsSent: totals.rows[0].followups,
      errors: recentErrors.rows.map(r => r.error_message || r.detail || 'Unknown error'),
    },
    leadHunter: {
      active: hunter.active,
      config: {
        frequency: hunter.config?.frequency || '24h',
        minQualScore: Number(hunter.config?.minQualScore) || 60,
        dailyTarget: Number(hunter.config?.dailyTarget) || 10,
        sources: hunter.config?.sources || ['apollo', 'gemini'],
        totalLeadsFound: Number(hunter.config?.totalLeadsFound) || 0,
        totalQualified: Number(hunter.config?.totalQualified) || 0,
        totalPipelineAdded: Number(hunter.config?.totalPipelineAdded) || 0,
        lastRunAt: hunter.lastRunAt,
        lastHuntDate: hunter.config?.lastHuntDate || null,
      },
    },
    today: {
      leadsHuntedToday: leadsHunted.rows[0].n,
      meetingsBookedToday: meetings.rows[0].n,
      emailsSent: sentEmails.rows[0].n,
      failedEmails: failedEmails.rows[0].n,
      followupsSent: followups.rows[0].n,
      whatsappSent: whatsapp.rows[0].n,
      websitesScanned: scanned.rows[0].n,
      proposalsSent: proposals.rows[0].n,
      errors: errorsCount.rows[0].n,
    },
    emailHealth,
    warmup,
  };
}

// ── ROUTES ──────────────────────────────────────────────────
function registerAgentHubRoutes(app, resolveUserId) {
  const resolve = async (req) => {
    const email = req.query?.email || req.body?.email;
    return await resolveUserId(email || null, req.headers.cookie);
  };

  // GET /api/agent-hub/status
  app.get('/api/agent-hub/status', async (req, res) => {
    try {
      const userId = await resolve(req);
      const status = await buildStatus(userId);
      res.json(status);
    } catch (err) {
      console.error('[agent-hub] status error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/agent-hub/activity?limit=&agent=
  app.get('/api/agent-hub/activity', async (req, res) => {
    try {
      const userId = await resolve(req);
      const limit = Math.min(Number(req.query.limit) || 100, 500);
      const agent = req.query.agent;
      const params = [userId];
      let where = "WHERE user_id = $1";

      if (agent && agent !== 'all') {
        const agentLower = agent.toLowerCase();
        if (agentLower === 'scout') {
          where += ` AND LOWER(agent_name) LIKE '%scout%'`;
        } else if (agentLower === 'sales') {
          where += ` AND LOWER(agent_name) LIKE '%sales%'`;
        } else if (agentLower === 'followup' || agentLower === 'follow-up') {
          where += ` AND LOWER(agent_name) LIKE '%follow%'`;
        } else if (agentLower === 'lead_hunter' || agentLower === 'hunter') {
          where += ` AND LOWER(agent_name) LIKE '%hunter%'`;
        } else {
          params.push(`%${agent}%`);
          where += ` AND LOWER(agent_name) LIKE LOWER($${params.length})`;
        }
      }

      params.push(limit);
      const r = await db.query(
        `SELECT DISTINCT ON (COALESCE(lead_name, company_name, id::text))
                id, agent_name, activity_type, status, lead_name, company_name, detail, error_message, executed_at
         FROM agent_activity ${where} ORDER BY COALESCE(lead_name, company_name, id::text), executed_at DESC LIMIT $${params.length}`, params);
      const sorted = r.rows.sort((a, b) => new Date(b.executed_at) - new Date(a.executed_at));
      const rows = sorted.map(row => ({
        id: row.id,
        agentName: row.agent_name,
        activityType: row.activity_type,
        status: row.status,
        leadName: row.lead_name,
        companyName: row.company_name,
        detail: row.detail,
        errorMessage: row.error_message,
        executedAt: row.executed_at,
      }));
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/agent-hub/toggle-history?limit=
  app.get('/api/agent-hub/toggle-history', async (req, res) => {
    try {
      const userId = await resolve(req);
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const r = await db.query(
        `SELECT id, agent_name, detail, executed_at FROM agent_toggle_history
         WHERE user_id = $1 ORDER BY executed_at DESC LIMIT $2`, [userId, limit]);
      res.json(r.rows.map(row => ({
        id: row.id,
        agentName: row.agent_name,
        detail: row.detail,
        executedAt: row.executed_at,
      })));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/agent-hub/email-health/history
  app.get('/api/agent-hub/email-health/history', async (req, res) => {
    try {
      const userId = await resolve(req);
      res.json(await buildEmailHistory(userId));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/agent-hub/email-failure-health
  app.get('/api/agent-hub/email-failure-health', async (req, res) => {
    try {
      const userId = await resolve(req);
      res.json(await buildEmailFailureHealth(userId));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/agent-hub/email-failure-health/reset
  app.post('/api/agent-hub/email-failure-health/reset', async (req, res) => {
    try {
      const userId = await resolve(req);
      await db.query(
        `DELETE FROM agent_activity WHERE user_id = $1 AND activity_type IN ('email_failed')`, [userId]);
      res.json({ success: true, consecutiveFailures: 0 });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/agent-hub/autopilot-email-pause { paused }
  app.post('/api/agent-hub/autopilot-email-pause', async (req, res) => {
    try {
      const userId = await resolve(req);
      const paused = Boolean(req.body.paused);
      await setActive(userId, 'autopilot_email', !paused);
      const name = await userNameFor(userId);
      await recordToggle(userId, 'Email Autopilot', !paused, name);
      await recordActivity(userId, {
        agentName: 'Email Autopilot',
        activityType: 'autopilot_email',
        status: paused ? 'warning' : 'completed',
        detail: paused ? 'Email sending paused' : 'Email sending resumed',
      });
      res.json({ success: true, paused });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/agent-hub/:agent/toggle
  app.post('/api/agent-hub/:agent/toggle', async (req, res) => {
    try {
      const userId = await resolve(req);
      const agent = req.params.agent;
      const cur = await getSetting(userId, agent);
      const next = !cur.active;
      await setActive(userId, agent, next);
      const name = await userNameFor(userId);
      await recordToggle(userId, AGENT_NAMES[agent] || agent, next, name);
      await recordActivity(userId, {
        agentName: AGENT_NAMES[agent] || agent,
        activityType: 'toggle',
        status: next ? 'completed' : 'warning',
        detail: `${AGENT_NAMES[agent] || agent} ${next ? 'enabled' : 'disabled'}`,
      });
      res.json({ success: true, agent, active: next });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/agent-hub/:agent/run-now
  app.post('/api/agent-hub/:agent/run-now', async (req, res) => {
    try {
      const userId = await resolve(req);
      const agent = req.params.agent;
      const result = await runAgent(userId, agent, { manual: true });
      res.json(result);
    } catch (err) {
      console.error('[agent-hub] run-now error:', err.message);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ── /api/agents/* routes (Agents, LeadHunter, SalesAgentControl pages) ──

  // GET /api/agents/orchestrator/status
  app.get('/api/agents/orchestrator/status', async (req, res) => {
    try {
      const userId = await resolve(req);
      const status = await buildStatus(userId);
      res.json({
        ...status.orchestrator,
        today: status.today,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/agents/orchestrator/toggle { agent }
  app.post('/api/agents/orchestrator/toggle', async (req, res) => {
    try {
      const userId = await resolve(req);
      const agent = req.body.agent;
      const cur = await getSetting(userId, agent);
      const next = !cur.active;
      await setActive(userId, agent, next);
      const name = await userNameFor(userId);
      await recordToggle(userId, AGENT_NAMES[agent] || agent, next, name);
      res.json({ success: true, agent, active: next });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/agents/orchestrator/tick
  app.post('/api/agents/orchestrator/tick', async (req, res) => {
    try {
      const userId = await resolve(req);
      const result = await runBrain(userId);
      res.json(result);
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // GET /api/agents/lead-hunter/status
  app.get('/api/agents/lead-hunter/status', async (req, res) => {
    try {
      const userId = await resolve(req);
      const status = await buildStatus(userId);
      res.json(status.leadHunter);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/agents/lead-hunter/toggle
  app.post('/api/agents/lead-hunter/toggle', async (req, res) => {
    try {
      const userId = await resolve(req);
      const cur = await getSetting(userId, 'lead_hunter');
      const next = !cur.active;
      await setActive(userId, 'lead_hunter', next);
      const name = await userNameFor(userId);
      await recordToggle(userId, AGENT_NAMES.lead_hunter, next, name);
      res.json({ success: true, agent: 'lead_hunter', active: next });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // PUT /api/agents/lead-hunter/config
  app.put('/api/agents/lead-hunter/config', async (req, res) => {
    try {
      const userId = await resolve(req);
      const body = req.body || {};
      const cur = await getSetting(userId, 'lead_hunter');
      const config = {
        ...(cur.config || {}),
        frequency: body.frequency || cur.config?.frequency || '24h',
        minQualScore: body.minQualScore != null ? Number(body.minQualScore) : Number(cur.config?.minQualScore) || 60,
        dailyTarget: body.dailyTarget != null ? Number(body.dailyTarget) : Number(cur.config?.dailyTarget) || 10,
        sources: Array.isArray(body.sources) && body.sources.length ? body.sources : cur.config?.sources || ['apollo', 'gemini'],
      };
      await db.query(`UPDATE agent_settings SET config = $3, updated_at = NOW() WHERE user_id = $1 AND agent_key = 'lead_hunter'`, [userId, null, JSON.stringify(config)]);
      res.json({ success: true, config });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/agents/lead-hunter/activity?limit=&since=&until=
  app.get('/api/agents/lead-hunter/activity', async (req, res) => {
    try {
      const userId = await resolve(req);
      const limit = Math.min(Number(req.query.limit) || 100, 500);
      const since = req.query.since ? new Date(req.query.since) : null;
      const until = req.query.until ? new Date(req.query.until) : null;
      let where = 'WHERE user_id = $1 AND agent_name = $2';
      const params = [userId, AGENT_NAMES.lead_hunter];
      if (since) { params.push(since); where += ` AND executed_at >= $${params.length}`; }
      if (until) { params.push(until); where += ` AND executed_at <= $${params.length}`; }
      params.push(limit);
      const r = await db.query(
        `SELECT id, agent_name, activity_type, status, lead_name, company_name, detail, error_message, executed_at
         FROM agent_activity ${where} ORDER BY executed_at DESC LIMIT $${params.length}`, params);
      res.json(r.rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/agents/lead-hunter/hunt (SSE stream)
  app.post('/api/agents/lead-hunter/hunt', async (req, res) => {
    const userId = await resolve(req);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    const emit = (event, data) => {
      if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    try {
      emit('status', { message: 'Lead Hunter starting…' });
      const result = await runLeadHunter(userId, ({ type, lead, message, icp }) => {
        if (type === 'status') emit('status', { message });
        if (type === 'lead') emit('lead', { lead, icp });
      });
      emit('done', result);
    } catch (err) {
      emit('status', { message: `Error: ${err.message}` });
      emit('done', { ok: false, error: err.message });
    } finally {
      if (!res.writableEnded) res.end();
    }
  });

  // GET /api/agents/pipeline-stats
  app.get('/api/agents/pipeline-stats', async (req, res) => {
    try {
      const userId = await resolve(req);
      res.json(await buildPipelineStats(userId));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/agents/activities
  app.get('/api/agents/activities', async (req, res) => {
    try {
      const userId = await resolve(req);
      const limit = Math.min(Number(req.query.limit) || 50, 500);
      const agent = req.query.agent;
      const params = [userId];
      let where = "WHERE user_id = $1";

      if (agent && agent !== 'all') {
        const agentLower = agent.toLowerCase();
        if (agentLower === 'scout') {
          where += ` AND LOWER(agent_name) LIKE '%scout%'`;
        } else if (agentLower === 'sales') {
          where += ` AND LOWER(agent_name) LIKE '%sales%'`;
        } else if (agentLower === 'followup' || agentLower === 'follow-up') {
          where += ` AND LOWER(agent_name) LIKE '%follow%'`;
        } else if (agentLower === 'lead_hunter' || agentLower === 'hunter') {
          where += ` AND LOWER(agent_name) LIKE '%hunter%'`;
        } else {
          params.push(`%${agent}%`);
          where += ` AND LOWER(agent_name) LIKE LOWER($${params.length})`;
        }
      }

      params.push(limit);
      const r = await db.query(
        `SELECT DISTINCT ON (COALESCE(lead_name, company_name, id::text))
                id, agent_name, activity_type, status, lead_name, company_name, detail, error_message, executed_at
         FROM agent_activity ${where} 
         ORDER BY COALESCE(lead_name, company_name, id::text), executed_at DESC LIMIT $${params.length}`, params);
      const sorted = r.rows.sort((a, b) => new Date(b.executed_at) - new Date(a.executed_at));
      res.json(sorted);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/agents/reports
  app.get('/api/agents/reports', async (req, res) => {
    try {
      const userId = await resolve(req);
      const status = await buildStatus(userId);
      res.json([
        {
          id: 1,
          label: 'Daily Autopilot Summary',
          generatedAt: status.orchestrator.lastBrainTick || null,
          metrics: status.today,
        },
      ]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/agents/report/send
  app.post('/api/agents/report/send', async (req, res) => {
    try {
      const userId = await resolve(req);
      const email = req.body.email || req.query.email;
      if (!email) return res.status(400).json({ error: 'Recipient email is required' });
      const status = await buildStatus(userId);
      const body = [
        `Aura AI — Autopilot Daily Report`,
        ``,
        `Emails sent today: ${status.today.emailsSent}`,
        `Follow-ups sent today: ${status.today.followupsSent}`,
        `Websites scanned: ${status.today.websitesScanned}`,
        `Proposals sent: ${status.today.proposalsSent}`,
        `Meetings booked: ${status.today.meetingsBookedToday}`,
        `Leads hunted: ${status.today.leadsHuntedToday}`,
        `Errors: ${status.today.errors}`,
      ].join('\n');
      const result = await sendAgentEmail(userId, { to: email, subject: 'Aura AI — Autopilot Daily Report', body });
      if (!result.sent) return res.status(500).json({ error: result.reason || 'Send failed' });
      res.json({ success: true, message: 'Report sent' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/agents/scout/run, /api/agents/sales/run, /api/agents/followup/run
  for (const key of ['scout', 'sales', 'followup']) {
    app.post(`/api/agents/${key}/run`, async (req, res) => {
      try {
        const userId = await resolve(req);
        res.json(await runAgent(userId, key, { manual: true }));
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    });
  }
}

setInterval(() => {
  runScheduledTicks();
}, 300000).unref();

async function runScheduledTicks() {
  try {
    const r = await db.query('SELECT DISTINCT user_id FROM agent_settings');
    for (const row of r.rows) {
      const brain = await getSetting(row.user_id, 'brain');
      if (!brain.active) continue;
      await runBrain(row.user_id).catch(err => console.error('[agent-hub] scheduled tick error:', err.message));
    }
  } catch (err) {
    console.error('[agent-hub] scheduled sweep error:', err.message);
  }
}

module.exports = { init, runAgent, runScout, runSales, runFollowup, runLeadHunter, registerAgentHubRoutes };
