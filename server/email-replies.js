const db = require('./db');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

const HOST = 'imap.gmail.com';
const PORT = 993;
const MAX_FETCH = 300;

async function ensureTables() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS email_replies (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      lead_id BIGINT,
      outreach_email_id BIGINT,
      from_email TEXT,
      from_name TEXT,
      subject TEXT,
      body TEXT,
      message_id TEXT UNIQUE,
      received_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS email_reply_state (
      user_id BIGINT PRIMARY KEY,
      last_polled_at TIMESTAMPTZ
    )
  `);
}

function imapCredentials() {
  const user = process.env.IMAP_USER || process.env.SMTP_USER || '';
  const pass = process.env.IMAP_PASS || process.env.SMTP_PASS || '';
  return { user, pass };
}

async function lastPolled(userId) {
  const res = await db.query('SELECT last_polled_at FROM email_reply_state WHERE user_id = $1', [userId]);
  return res.rows[0]?.last_polled_at || null;
}

async function setLastPolled(userId, date) {
  await db.query(
    `INSERT INTO email_reply_state (user_id, last_polled_at)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET last_polled_at = EXCLUDED.last_polled_at`,
    [userId, date]
  );
}

function stripHtml(html) {
  return (html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

function stripReplyPrefix(subject) {
  return String(subject || '').replace(/^\s*(re|fwd|fw|aw|antwort|sv)\s*[:：]\s*/i, '').trim().toLowerCase();
}

function isReplyMessage(subject, inReplyTo) {
  return !!inReplyTo || /^\s*(re|fwd|fw|aw|antwort|sv)\s*[:：]/i.test(String(subject || ''));
}

async function pollReplies(userId) {
  const { user, pass } = imapCredentials();
  if (!user || !pass) {
    return { ok: false, added: 0, error: 'IMAP credentials are not configured. Enable IMAP in Gmail and use an app password (IMAP_USER / IMAP_PASS).' };
  }

  const [leadsRes, outreachRes] = await Promise.all([
    db.query(`SELECT id, email FROM leads WHERE user_id = $1 AND email IS NOT NULL AND email <> ''`, [userId]),
    db.query(`SELECT id, lead_id, COALESCE(to_email, recipient_email) AS recipient, subject FROM outreach_emails WHERE user_id = $1`, [userId])
  ]);

  const emailToLead = new Map();
  const emailToOutreach = new Map();
  const subjectToOutreach = new Map();
  for (const row of leadsRes.rows) emailToLead.set(String(row.email).toLowerCase(), row.id);
  for (const row of outreachRes.rows) {
    if (row.recipient) {
      const key = String(row.recipient).toLowerCase();
      emailToOutreach.set(key, { id: row.id, lead_id: row.lead_id });
      if (!emailToLead.has(key) && row.lead_id) emailToLead.set(key, row.lead_id);
    }
    if (row.subject) {
      const subjKey = stripReplyPrefix(row.subject);
      if (subjKey && !subjectToOutreach.has(subjKey)) subjectToOutreach.set(subjKey, { id: row.id, lead_id: row.lead_id });
    }
  }

  // Scan past 30 days of INBOX to ensure no replies are missed
  const since = new Date(Date.now() - 30 * 86400000);

  const client = new ImapFlow({
    host: HOST,
    port: PORT,
    secure: true,
    auth: { user, pass },
    logger: false,
    connectionTimeout: 20000
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    let added = 0;
    try {
      const seq = await client.search({ since });
      const recent = seq.slice(-MAX_FETCH);
      if (recent.length) {
        for await (const msg of client.fetch(recent, { envelope: true, source: true })) {
          let parsed;
          try {
            parsed = await simpleParser(msg.source);
          } catch {
            continue;
          }
          const from = parsed.from?.value?.[0];
          const fromEmail = (from?.address || '').toLowerCase().trim();
          if (!fromEmail) continue;

          // NEVER count emails sent FROM our own account (or SMTP_USER) as a prospect reply!
          const ownUser = user.toLowerCase().trim();
          if (fromEmail === ownUser || fromEmail === 'aurabackoffice123@gmail.com' || fromEmail.includes('aurabackoffice')) {
            continue;
          }

          const messageId = parsed.messageId || String(msg.uid);
          const dup = await db.query('SELECT 1 FROM email_replies WHERE message_id = $1', [messageId]);
          if (dup.rows.length) continue;

          const isReply = isReplyMessage(parsed.subject, parsed.inReplyTo);

          let leadId = emailToLead.get(fromEmail) || null;
          let outreach = emailToOutreach.get(fromEmail) || null;

          if (!leadId || !outreach) {
            const dbMatch = await db.query(
              `SELECT id, lead_id FROM outreach_emails WHERE LOWER(recipient_email) = $1 OR LOWER(to_email) = $1 ORDER BY id DESC LIMIT 1`,
              [fromEmail]
            );
            if (dbMatch.rows.length) {
              outreach = dbMatch.rows[0];
              if (!leadId) leadId = outreach.lead_id;
            }
          }

          if (!outreach && isReply) {
            const subjKey = stripReplyPrefix(parsed.subject);
            if (subjKey) {
              outreach = subjectToOutreach.get(subjKey) || null;
              if (outreach && !leadId) leadId = outreach.lead_id;
            }
          }

          if (!outreach) {
            const latestOutreach = await db.query(
              `SELECT id, lead_id FROM outreach_emails WHERE user_id = $1 ORDER BY id DESC LIMIT 1`,
              [userId]
            );
            if (latestOutreach.rows.length) {
              outreach = latestOutreach.rows[0];
              if (!leadId) leadId = outreach.lead_id;
            }
          }

          const body = parsed.text || stripHtml(parsed.html) || '';
          const receivedAt = parsed.date && !isNaN(parsed.date.getTime()) ? parsed.date : new Date();

          await db.query(
            `INSERT INTO email_replies (user_id, lead_id, outreach_email_id, from_email, from_name, subject, body, message_id, received_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [userId, leadId, outreach?.id || null, fromEmail, from?.name || '', (parsed.subject || '').slice(0, 500), body.slice(0, 10000), messageId, receivedAt]
          );
          added++;
        }
      }
    } finally {
      lock.release();
    }
    await setLastPolled(userId, new Date());
    await client.logout();
    return { ok: true, added };
  } catch (err) {
    try { await client.logout(); } catch {}
    console.error('[email-replies] poll error:', err.message);
    return { ok: false, added: 0, error: err.message || 'IMAP poll failed. Enable IMAP in Gmail and use an app password.' };
  }
}

// ── ROUTES ──────────────────────────────────────────────────
function registerEmailReplyRoutes(app, resolveUserId) {
  ensureTables().catch((err) => console.error('[email-replies] ensureTables error:', err.message));

  // GET /api/outreach/replies
  app.get('/api/outreach/replies', async (req, res) => {
    try {
      const email = req.query?.email;
      const userId = await resolveUserId(email || null, req.headers.cookie);
      const leadFilter = req.query?.leadId;
      const params = [userId];
      let where = "WHERE (r.user_id = $1 OR r.user_id IS NULL) AND LOWER(r.from_email) NOT LIKE '%aurabackoffice%' AND LOWER(r.from_email) <> 'aurabackoffice123@gmail.com'";
      if (leadFilter) {
        params.push(Number(leadFilter));
        where += ' AND r.lead_id = $' + params.length;
      }
      const result = await db.query(
        `SELECT r.id, r.lead_id, r.outreach_email_id, r.from_email, r.from_name, r.subject,
                r.body, r.received_at,
                l.first_name, l.last_name, l.company, l.pipeline_stage,
                oe.subject AS original_subject
         FROM email_replies r
         LEFT JOIN leads l ON l.id = r.lead_id
         LEFT JOIN outreach_emails oe ON oe.id = r.outreach_email_id
         ${where}
         ORDER BY r.received_at DESC
         LIMIT 200`,
        params
      );
      res.json({ replies: result.rows });
    } catch (err) {
      console.error('[email-replies] list error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/email/replies/poll
  app.post('/api/email/replies/poll', async (req, res) => {
    try {
      const email = req.body?.email;
      const userId = await resolveUserId(email || null, req.headers.cookie);
      const result = await pollReplies(userId);
      res.json(result);
    } catch (err) {
      console.error('[email-replies] poll error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { registerEmailReplyRoutes, pollReplies, ensureTables };
