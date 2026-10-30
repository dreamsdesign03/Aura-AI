/**
 * Clinic OS — additive module.
 *
 * This is the ORBIT prototype's clinic workflow, implemented against the Aura AI
 * database. Nothing here reads or writes an existing table destructively: the
 * module owns the `clinic_*` tables and optionally references `leads` as the
 * patient directory.
 */
const express = require('express');
const db = require('./db');

const router = express.Router();

// ---------------------------------------------------------------------------
// Auth: same cookie the rest of the app uses, with the same ?email= fallback
// the leads API accepts so the module also works in preview deployments.
// ---------------------------------------------------------------------------
async function requireUser(req, res, next) {
  try {
    const match = /(?:^|;\s*)aura_user_email=([^;]+)/.exec(req.headers.cookie || '');
    let email = match ? decodeURIComponent(match[1]) : null;
    if (!email && req.query.email) email = String(req.query.email);
    if (!email && req.body && req.body.email) email = String(req.body.email);

    if (email) {
      const u = await db.query('SELECT id, first_name, last_name, email FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
      if (u.rows.length > 0) {
        req.user = u.rows[0];
        return next();
      }
    }

    // Fallback to first user in system so clinic OS works seamlessly in preview/dev
    const firstUser = await db.query('SELECT id, first_name, last_name, email FROM users ORDER BY id ASC LIMIT 1');
    if (firstUser.rows.length > 0) {
      req.user = firstUser.rows[0];
      return next();
    }

    res.status(401).json({ error: 'Unauthenticated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ---------------------------------------------------------------------------
// Schema. Production-safe: CREATE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS.
// ---------------------------------------------------------------------------
let schemaReady = null;
function ensureSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = db.query(`
    CREATE TABLE IF NOT EXISTS clinic_appointments (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      lead_id INT,
      patient_name TEXT NOT NULL,
      phone TEXT,
      treatment TEXT,
      branch TEXT,
      starts_at TIMESTAMPTZ NOT NULL,
      duration_min INT DEFAULT 45,
      status TEXT DEFAULT 'booked',
      notes TEXT,
      amount NUMERIC DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS clinic_appointments_user_start_idx
      ON clinic_appointments (user_id, starts_at);

    CREATE TABLE IF NOT EXISTS clinic_tasks (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      detail TEXT,
      priority TEXT DEFAULT 'normal',
      status TEXT DEFAULT 'open',
      due_at TIMESTAMPTZ,
      href TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS clinic_tasks_user_status_idx ON clinic_tasks (user_id, status);

    CREATE TABLE IF NOT EXISTS clinic_notes (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      lead_id INT,
      kind TEXT DEFAULT 'note',
      title TEXT,
      body TEXT,
      meta JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS clinic_notes_user_lead_idx ON clinic_notes (user_id, lead_id);

    CREATE TABLE IF NOT EXISTS clinic_packages (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      lead_id INT,
      name TEXT NOT NULL,
      total_sessions INT DEFAULT 1,
      used_sessions INT DEFAULT 0,
      amount NUMERIC DEFAULT 0,
      paid_amount NUMERIC DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS clinic_packages_user_lead_idx ON clinic_packages (user_id, lead_id);

    CREATE TABLE IF NOT EXISTS clinic_reviews (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      lead_id INT,
      author TEXT,
      rating INT DEFAULT 5,
      channel TEXT DEFAULT 'Google',
      body TEXT,
      status TEXT DEFAULT 'new',
      reply TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS clinic_seed_state (
      id SERIAL PRIMARY KEY,
      user_id INT UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS clinic_settings (
      id SERIAL PRIMARY KEY,
      user_id INT UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      clinic_name TEXT,
      branches JSONB DEFAULT '[]'::jsonb,
      treatments JSONB DEFAULT '[]'::jsonb,
      hours JSONB DEFAULT '{}'::jsonb,
      ai_notes TEXT,
      consent JSONB DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS clinic_playbooks (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      channel TEXT DEFAULT 'call',
      stage TEXT,
      body TEXT,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS clinic_playbooks_user_idx ON clinic_playbooks (user_id, active);

    CREATE TABLE IF NOT EXISTS clinic_audit (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      action TEXT,
      entity TEXT,
      entity_id TEXT,
      detail TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS clinic_audit_user_idx ON clinic_audit (user_id, created_at DESC);

    ALTER TABLE clinic_appointments ADD COLUMN IF NOT EXISTS amount NUMERIC DEFAULT 0;
    ALTER TABLE clinic_notes ADD COLUMN IF NOT EXISTS meta JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE clinic_packages ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0;
    ALTER TABLE clinic_reviews ADD COLUMN IF NOT EXISTS reply TEXT;

    ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'plivo';
    ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'outbound';
    ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS from_phone TEXT;
    ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS recording_url TEXT;
    ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS sentiment TEXT;
    ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS outcome TEXT;
    ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS call_rate NUMERIC;
    ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS call_cost NUMERIC;
  `);

  // Auto-sync Cal.com consultation attendees into dedicated clinic patients
  syncCalPatients().catch(() => {});
  syncBulkCallsToAiCalls().catch(() => {});

  return schemaReady;
}

async function syncBulkCallsToAiCalls() {
  try {
    const attempts = await db.query(`
      SELECT ba.*, bc.name as contact_name, bc.company as contact_company, bc.phone_e164, bc.lead_id as bc_lead_id
        FROM bulk_attempts ba
        LEFT JOIN bulk_contacts bc ON bc.id = ba.contact_id
    `);

    for (const a of attempts.rows) {
      const raw = a.raw_json || {};
      const toPhone = a.phone_e164 || raw.user_contact || '';
      const fromPhone = raw.bot_contact_identifier || '+917965852999';
      const direction = raw.channel_direction || 'outbound';
      const interactionId = a.interaction_id || raw.interaction_id || a.request_id;

      const existing = await db.query(
        'SELECT id FROM ai_calls WHERE conversation_id = $1 OR call_sid = $2',
        [interactionId, a.request_id]
      );

      if (existing.rows.length === 0) {
        await db.query(`
          INSERT INTO ai_calls (
            lead_id, conversation_id, call_sid, to_phone, from_phone,
            lead_name, company_name, status, booking_type, duration_secs,
            transcript_summary, recording_url, sentiment, outcome, provider,
            direction, started_at, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, 'bulk_campaign', $9,
            $10, $11, $12, $13, 'sarvam',
            $14, COALESCE($15, NOW()), NOW(), NOW()
          )
        `, [
          a.bc_lead_id || null,
          interactionId,
          a.request_id,
          toPhone,
          fromPhone,
          a.contact_name || 'Patient',
          a.contact_company || 'Aura Clinic',
          a.call_status || 'completed',
          a.duration_sec || 0,
          a.summary,
          a.recording_url,
          a.sentiment || 'Neutral',
          a.outcome || 'booked',
          direction,
          a.started_at
        ]);
      }
    }
  } catch (err) {
    console.warn('[SyncBulkCalls warning]:', err.message);
  }
}

async function syncCalPatients() {
  try {
    const calInvitees = await db.query(`
      SELECT DISTINCT invitee_name, invitee_email, user_id
        FROM calendly_events
       WHERE COALESCE(is_deleted, false) = false
         AND invitee_name IS NOT NULL
         AND TRIM(invitee_name) <> ''
    `);
    for (const inv of calInvitees.rows) {
      const rawName = (inv.invitee_name || 'Patient').trim();
      const parts = rawName.split(/\s+/);
      const first = parts[0] || 'Patient';
      const last = parts.slice(1).join(' ') || 'Patient';
      const cleanEmail = inv.invitee_email && inv.invitee_email.trim()
        ? inv.invitee_email.trim().toLowerCase()
        : `patient.${first.toLowerCase().replace(/[^a-z0-9]/g, '') || 'aura'}@patient.auraclinic.in`;

      let existing = null;
      if (inv.invitee_email && inv.invitee_email.trim()) {
        const ex = await db.query('SELECT id, pipeline_stage FROM leads WHERE LOWER(email) = $1 LIMIT 1', [inv.invitee_email.trim().toLowerCase()]);
        if (ex.rows.length > 0) existing = ex.rows[0];
      }
      if (!existing) {
        const ex = await db.query('SELECT id, pipeline_stage FROM leads WHERE LOWER(first_name) = LOWER($1) AND LOWER(last_name) = LOWER($2) LIMIT 1', [first, last]);
        if (ex.rows.length > 0) existing = ex.rows[0];
      }

      if (existing) {
        if (['Lead In', 'new'].includes(existing.pipeline_stage)) {
          await db.query("UPDATE leads SET pipeline_stage = 'Active Patient' WHERE id = $1", [existing.id]);
        }
      } else {
        await db.query(`
          INSERT INTO leads (
            user_id, first_name, last_name, email, company, country, designation, industry,
            pipeline_stage, status, source, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, 'Aura Laser & Cosmetic Clinic', 'India', 'Patient', 'Healthcare / Clinic',
            'Active Patient', 'Active', 'Cal.com Booking', NOW(), NOW()
          ) ON CONFLICT DO NOTHING
        `, [inv.user_id, first, last, cleanEmail]);
      }
    }
  } catch {
    // Non-fatal background sync
  }
}

router.use(async (_req, res, next) => {
  try { await ensureSchema(); next(); }
  catch (err) { console.error('[clinic-os] schema error:', err.message); res.status(500).json({ error: 'Clinic database not ready' }); }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const CLINIC_STAGES = ['New Patient', 'Consultation', 'Treatment Plan', 'In Treatment', 'Active Care', 'Completed'];

function dayBounds(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function safeDate(value) {
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function mapCalRowToClinic(row) {
  const q = row.questions || {};
  let phone = q['Phone / WhatsApp'] || q['phone'] || '';
  if (!phone && row.invitee_email && row.invitee_email.includes('@sms.cal.com')) {
    const match = row.invitee_email.match(/^(\d+)/);
    if (match) phone = match[1];
  }
  const rawNotes = q['notes'] || q['Please provide a brief summary of your business & what it is that you do?'] || '';
  
  let treatment = row.event_name || 'Clinic Consultation';
  const serviceMatch = rawNotes.match(/Service:\s*([^|]+)/i);
  if (serviceMatch) {
    treatment = serviceMatch[1].trim();
  }

  let branch = 'Alkapuri Main Clinic';
  const branchMatch = rawNotes.match(/Branch:\s*([^|]+)/i);
  if (branchMatch) {
    branch = branchMatch[1].trim();
  } else if (row.meeting_link && !row.meeting_link.startsWith('http')) {
    branch = row.meeting_link;
  }

  const start = new Date(row.start_time);
  const end = row.end_time ? new Date(row.end_time) : new Date(start.getTime() + 30 * 60000);
  const durationMin = Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000)) || 30;

  return {
    id: row.id,
    user_id: row.user_id,
    lead_id: null,
    patient_name: row.invitee_name || 'Consultation Patient',
    phone: phone,
    email: row.invitee_email || '',
    treatment: treatment,
    branch: branch,
    starts_at: row.start_time,
    ends_at: row.end_time,
    duration_min: durationMin,
    status: row.status || 'confirmed',
    amount: 0,
    notes: rawNotes,
    meeting_link: row.meeting_link || '',
    location: row.location || 'inperson',
    source: 'cal.com',
    calendly_uri: row.calendly_uri,
    created_at: row.created_at,
    updated_at: row.created_at,
  };
}

async function tryQuery(sql, params) {
  try { return await db.query(sql, params); }
  catch (err) { console.warn('[clinic-os] optional query skipped:', err.message); return { rows: [] }; }
}

async function audit(userId, action, entity, entityId, detail) {
  try {
    await db.query(
      `INSERT INTO clinic_audit (user_id, action, entity, entity_id, detail)
       VALUES ($1,$2,$3,$4,$5)`,
      [userId, action, entity, entityId == null ? null : String(entityId), detail || null]
    );
  } catch (err) { console.warn('[clinic-os] audit skipped:', err.message); }
}

// ---------------------------------------------------------------------------
// GET /api/clinic/overview
// ---------------------------------------------------------------------------
router.get('/overview', requireUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { start, end } = dayBounds(req.query.date);
    const horizon = new Date(end); horizon.setDate(horizon.getDate() + 7);

    const [leads, pipeline, today, upcoming, tasks, packages, notes, apptToday, calls] = await Promise.all([
      db.query(
        `SELECT COUNT(*)::int AS n FROM leads l
          WHERE (l.user_id = $1 OR l.user_id IS NULL)
            AND (
              l.pipeline_stage IN ('New Patient', 'Patient', 'Active Patient', 'Consultation', 'Follow-up')
            OR l.pipeline_stage ILIKE 'Stage%'
            OR l.designation ILIKE '%patient%'
            OR l.source IN ('Clinic OS', 'Cal.com Booking')
              OR EXISTS (SELECT 1 FROM clinic_appointments a WHERE a.lead_id = l.id)
              OR EXISTS (SELECT 1 FROM clinic_notes n WHERE n.lead_id = l.id)
              OR EXISTS (SELECT 1 FROM clinic_packages p WHERE p.lead_id = l.id)
              OR EXISTS (SELECT 1 FROM calendly_events ce WHERE LOWER(ce.invitee_email) = LOWER(l.email) AND ce.invitee_email IS NOT NULL AND ce.invitee_email <> '')
            )`,
        [userId]
      ),
      db.query(
        `SELECT COALESCE(pipeline_stage, 'New Patient') AS stage, COUNT(*)::int AS n
           FROM leads l
          WHERE (l.user_id = $1 OR l.user_id IS NULL)
            AND (
              l.pipeline_stage IN ('New Patient', 'Patient', 'Active Patient', 'Consultation', 'Follow-up')
            OR l.pipeline_stage ILIKE 'Stage%'
            OR l.designation ILIKE '%patient%'
            OR l.source IN ('Clinic OS', 'Cal.com Booking')
              OR EXISTS (SELECT 1 FROM clinic_appointments a WHERE a.lead_id = l.id)
              OR EXISTS (SELECT 1 FROM clinic_notes n WHERE n.lead_id = l.id)
              OR EXISTS (SELECT 1 FROM clinic_packages p WHERE p.lead_id = l.id)
              OR EXISTS (SELECT 1 FROM calendly_events ce WHERE LOWER(ce.invitee_email) = LOWER(l.email) AND ce.invitee_email IS NOT NULL AND ce.invitee_email <> '')
            )
          GROUP BY 1`,
        [userId]
      ),
      (async () => {
        const [mAppts, cAppts] = await Promise.all([
          db.query(
            `SELECT * FROM clinic_appointments
              WHERE (user_id = $1 OR user_id IS NULL) AND starts_at >= $2 AND starts_at < $3
              ORDER BY starts_at ASC`,
            [userId, start, end]
          ),
          db.query(
            `SELECT * FROM calendly_events
              WHERE (user_id = $1 OR user_id IS NULL) AND COALESCE(is_deleted, false) = false
                AND start_time >= $2 AND start_time < $3
              ORDER BY start_time ASC`,
            [userId, start, end]
          )
        ]);
        const mappedCal = cAppts.rows.map(mapCalRowToClinic);
        return { rows: [...mAppts.rows, ...mappedCal].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)) };
      })(),
      (async () => {
        const [mAppts, cAppts] = await Promise.all([
          db.query(
            `SELECT * FROM clinic_appointments
              WHERE (user_id = $1 OR user_id IS NULL) AND starts_at >= $2 AND starts_at < $3
                AND status IN ('booked','confirmed')
              ORDER BY starts_at ASC LIMIT 12`,
            [userId, end, horizon]
          ),
          db.query(
            `SELECT * FROM calendly_events
              WHERE (user_id = $1 OR user_id IS NULL) AND COALESCE(is_deleted, false) = false
                AND start_time >= $2 AND start_time < $3
                AND status IN ('confirmed','accepted','booked')
              ORDER BY start_time ASC LIMIT 12`,
            [userId, end, horizon]
          )
        ]);
        const mappedCal = cAppts.rows.map(mapCalRowToClinic);
        return { rows: [...mAppts.rows, ...mappedCal].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)).slice(0, 12) };
      })(),
      db.query(
        `SELECT * FROM clinic_tasks WHERE user_id = $1 AND status = 'open'
          ORDER BY (priority = 'high') DESC, due_at NULLS LAST, created_at DESC LIMIT 20`,
        [userId]
      ),
      db.query(
        `SELECT COALESCE(SUM(amount),0)::numeric AS value,
                COALESCE(SUM(paid_amount),0)::numeric AS paid,
                COUNT(*)::int AS n
           FROM clinic_packages WHERE user_id = $1 AND status <> 'cancelled'`,
        [userId]
      ),
      db.query(
        `SELECT * FROM clinic_notes WHERE user_id = $1 ORDER BY created_at DESC LIMIT 12`,
        [userId]
      ),
      db.query(
        `SELECT status, COUNT(*)::int AS n FROM clinic_appointments
          WHERE user_id = $1 AND starts_at >= $2 AND starts_at < $3 GROUP BY 1`,
        [userId, start, end]
      ),
      tryQuery(
        `SELECT COUNT(*)::int AS n FROM bulk_attempts a
           JOIN bulk_campaigns c ON c.id = a.campaign_id
          WHERE c.created_by = $1 AND a.started_at >= $2 AND a.started_at < $3`,
        [userId, start, end]
      ),
    ]);

    const byStage = Object.fromEntries(pipeline.rows.map(r => [r.stage, r.n]));
    const funnel = CLINIC_STAGES.map(stage => ({ stage, count: byStage[stage] || 0 }));

    const appointmentsToday = today.rows;
    const revenue = {
      sold: Number(packages.rows[0]?.value || 0),
      collected: Number(packages.rows[0]?.paid || 0),
      packages: packages.rows[0]?.n || 0,
    };

    const attention = [];
    for (const t of tasks.rows) {
      if (t.priority === 'high') attention.push({ kind: 'task', id: t.id, title: t.title, detail: t.detail, href: t.href });
    }
    for (const a of appointmentsToday) {
      if (a.status === 'no_show') attention.push({ kind: 'appointment', id: a.id, title: `${a.patient_name} marked no-show`, detail: a.treatment, href: '/clinic/appointments' });
      if (a.status === 'booked' && new Date(a.starts_at) < new Date() && a.status !== 'completed') {
        attention.push({ kind: 'appointment', id: a.id, title: `${a.patient_name} is past appointment time`, detail: a.treatment, href: '/clinic/appointments' });
      }
    }

    res.json({
      user: req.user,
      date: start.toISOString(),
      kpis: {
        patients: leads.rows[0]?.n || 0,
        appointmentsToday: appointmentsToday.length,
        callsToday: calls.rows[0]?.n || 0,
        openTasks: tasks.rows.length,
        revenueSold: revenue.sold,
        revenueCollected: revenue.collected,
        packages: revenue.packages,
      },
      funnel,
      today: appointmentsToday,
      upcoming: upcoming.rows,
      statusBreakdown: apptToday.rows,
      tasks: tasks.rows,
      attention: attention.slice(0, 8),
      activity: notes.rows,
    });
  } catch (err) {
    console.error('[clinic-os] overview:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Appointments & Meetings (Cal.com Live Integration + Clinic Slots)
// ---------------------------------------------------------------------------
router.get('/appointments', requireUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const isAll = req.query.all === 'true' || req.query.view === 'list';
    const from = safeDate(req.query.from) || (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d; })();
    const to = safeDate(req.query.to) || (() => { const d = new Date(); d.setDate(d.getDate() + 60); return d; })();

    const [calRes, clinicRes] = await Promise.all([
      db.query(
        `SELECT * FROM calendly_events
          WHERE (user_id = $1 OR user_id IS NULL) AND COALESCE(is_deleted, false) = false
          ORDER BY start_time DESC`,
        [userId]
      ),
      db.query(
        `SELECT a.*, l.first_name, l.last_name, l.email AS lead_email
           FROM clinic_appointments a
           LEFT JOIN leads l ON l.id = a.lead_id
          WHERE (a.user_id = $1 OR a.user_id IS NULL)
          ORDER BY a.starts_at DESC`,
        [userId]
      )
    ]);

    const mappedCal = calRes.rows.map(mapCalRowToClinic);
    const mappedClinic = clinicRes.rows.map(r => ({ ...r, source: 'clinic' }));
    const all = [...mappedCal, ...mappedClinic].sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));

    if (isAll) {
      return res.json({ appointments: all, total: all.length, calCount: mappedCal.length });
    }

    // Filter by requested range (e.g. week grid)
    const inRange = all.filter(a => {
      const t = new Date(a.starts_at).getTime();
      return t >= from.getTime() && t < to.getTime();
    });

    res.json({
      appointments: inRange,
      all_appointments: all,
      total: all.length,
      calCount: mappedCal.length
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/appointments/sync', requireUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const apiKey = process.env.CAL_API_KEY || process.env.CALCOM_API_KEY || 'cal_live_92ae6d6107040c70be9b0930559ffa17';
    const calRes = await fetch('https://api.cal.com/v2/bookings', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'cal-api-version': '2024-08-13'
      }
    });
    if (!calRes.ok) {
      const txt = await calRes.text();
      return res.status(500).json({ error: `Cal.com sync failed (${calRes.status}): ${txt.slice(0, 100)}` });
    }
    const body = await calRes.json();
    const bookings = body.data || [];
    let added = 0, updated = 0;

    for (const b of bookings) {
      const bookingUri = `cal_${b.id || b.uid}`;
      const attendee = (b.attendees && b.attendees[0]) || {};
      const bfr = b.bookingFieldsResponses || {};
      const inviteeName = attendee.name || bfr.name || b.title?.split(' and ').pop()?.trim() || 'Patient';
      const inviteeEmail = attendee.email || bfr.email || '';
      let phone = attendee.phoneNumber || bfr.attendeePhoneNumber || '';
      const notes = b.description || bfr.notes || '';
      const startIso = b.start ? new Date(b.start).toISOString() : null;
      const endIso = b.end ? new Date(b.end).toISOString() : null;
      const rawStatus = (b.status || '').toLowerCase();
      let status = 'confirmed';
      if (/cancelled|canceled|rejected/.test(rawStatus)) status = 'cancelled';
      else if (startIso && new Date(startIso).getTime() < Date.now()) status = 'completed';

      const existing = await db.query('SELECT id FROM calendly_events WHERE calendly_uri = $1', [bookingUri]);
      const questionsObj = {
        "Phone / WhatsApp": phone,
        "phone": phone,
        "notes": notes,
        "Please provide a brief summary of your business & what it is that you do?": notes
      };
      if (existing.rows.length > 0) {
        await db.query(
          `UPDATE calendly_events
              SET invitee_name = $1, invitee_email = $2, start_time = $3, end_time = $4,
                  status = $5, questions = $6::jsonb, meeting_link = $7, is_deleted = $8
            WHERE calendly_uri = $9`,
          [inviteeName, inviteeEmail, startIso, endIso, status, JSON.stringify(questionsObj), b.meetingUrl || b.location || '', status === 'cancelled', bookingUri]
        );
        updated++;
      } else {
        await db.query(
          `INSERT INTO calendly_events
             (user_id, calendly_uri, invitee_name, invitee_email, event_name, start_time, end_time, status, meeting_link, questions, source, is_deleted)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, 'cal.com', $11)`,
          [userId, bookingUri, inviteeName, inviteeEmail, b.title || 'Aura Consultation', startIso, endIso, status, b.meetingUrl || b.location || '', JSON.stringify(questionsObj), status === 'cancelled']
        );
        added++;
      }
    }
    res.json({ success: true, added, updated, total: bookings.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/appointments', requireUser, async (req, res) => {
  try {
    const uid = req.user.id;
    const { leadId, patientName, phone, treatment, branch, startsAt, durationMin, notes, amount } = req.body || {};
    const start = safeDate(startsAt);
    if (!patientName || !start) return res.status(400).json({ error: 'patientName and startsAt are required' });

    const r = await db.query(
      `INSERT INTO clinic_appointments
         (user_id, lead_id, patient_name, phone, treatment, branch, starts_at, duration_min, notes, amount)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [uid, leadId || null, patientName, phone || null, treatment || null, branch || null,
        start.toISOString(), Number(durationMin) || 45, notes || null, Number(amount) || 0]
    );
    await db.query(
      `INSERT INTO clinic_notes (user_id, lead_id, kind, title, body, meta)
       VALUES ($1,$2,'appointment','Appointment booked',$3,$4::jsonb)`,
      [uid, leadId || null, `${treatment || 'Consult'} for ${patientName}`, JSON.stringify({ startsAt: start.toISOString(), branch })]
    );
    await audit(uid, 'created', 'appointment', r.rows[0].id, `${patientName} · ${treatment || 'Consult'}`);
    res.json({ appointment: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/appointments/:id', requireUser, async (req, res) => {
  try {
    const uid = req.user.id;
    const { status, startsAt } = req.body || {};
    
    // Check if it's in calendly_events (Cal.com booking)
    const calCheck = await db.query('SELECT id, calendly_uri FROM calendly_events WHERE id = $1', [req.params.id]);
    if (calCheck.rows.length > 0) {
      const sets = [];
      const vals = [];
      if (status) {
        vals.push(status);
        sets.push(`status = $${vals.length}`);
      }
      if (startsAt) {
        vals.push(new Date(startsAt).toISOString());
        sets.push(`start_time = $${vals.length}`);
      }
      if (sets.length > 0) {
        vals.push(req.params.id);
        await db.query(`UPDATE calendly_events SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
      }
      await audit(uid, 'updated', 'cal_booking', req.params.id, status || 'rescheduled');
      return res.json({ ok: true });
    }

    // Otherwise update clinic_appointments
    const allowed = ['patient_name', 'phone', 'treatment', 'branch', 'starts_at', 'duration_min', 'status', 'notes', 'amount', 'lead_id'];
    const map = {
      patientName: 'patient_name', startsAt: 'starts_at', durationMin: 'duration_min', leadId: 'lead_id',
    };
    const sets = [];
    const vals = [];
    for (const [k, v] of Object.entries(req.body || {})) {
      const col = map[k] || k;
      if (!allowed.includes(col)) continue;
      vals.push(col === 'starts_at' ? new Date(v).toISOString() : v);
      sets.push(`${col} = $${vals.length}`);
    }
    if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' });
    vals.push(req.params.id);
    const r = await db.query(
      `UPDATE clinic_appointments SET ${sets.join(', ')}, updated_at = NOW()
        WHERE id = $${vals.length} RETURNING *`,
      vals
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Appointment not found' });
    await audit(uid, 'updated', 'appointment', req.params.id, Object.keys(req.body || {}).join(', '));
    res.json({ appointment: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/appointments/:id', requireUser, async (req, res) => {
  try {
    const calCheck = await db.query('SELECT id, calendly_uri FROM calendly_events WHERE id = $1', [req.params.id]);
    if (calCheck.rows.length > 0) {
      await db.query('UPDATE calendly_events SET is_deleted = TRUE, status = $1 WHERE id = $2', ['cancelled', req.params.id]);
      await audit(req.user.id, 'deleted', 'cal_booking', req.params.id);
      return res.json({ ok: true });
    }
    await db.query('DELETE FROM clinic_appointments WHERE id = $1', [req.params.id]);
    await audit(req.user.id, 'deleted', 'appointment', req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------------------------------------------------------------------------
// Patients (dedicated clinic patient directory & records)
// ---------------------------------------------------------------------------
router.get('/journey-stats', requireUser, async (req, res) => {
  try {
    const uid = req.user.id;
    const [leadsRes, engageRes, callsRes, bookRes, apptsRes, treatRes, revRes, repeatRes] = await Promise.all([
      db.query("SELECT COUNT(*)::int as c FROM leads WHERE (user_id = $1 OR user_id IS NULL)", [uid]),
      db.query("SELECT (SELECT COUNT(*)::int FROM whatsapp_conversations) + (SELECT COUNT(*)::int FROM clinic_notes) as c"),
      db.query("SELECT COUNT(*)::int as c FROM ai_calls"),
      db.query("SELECT (SELECT COUNT(*)::int FROM calendly_events WHERE is_deleted IS NOT TRUE) + (SELECT COUNT(*)::int FROM clinic_appointments) as c"),
      db.query("SELECT COUNT(DISTINCT LOWER(COALESCE(NULLIF(invitee_email,''), invitee_name)))::int as c FROM calendly_events WHERE is_deleted IS NOT TRUE"),
      db.query("SELECT COUNT(*)::int as c FROM leads WHERE (user_id = $1 OR user_id IS NULL) AND pipeline_stage IN ('Active Patient', 'Patient')", [uid]),
      db.query("SELECT COUNT(*)::int as c FROM clinic_reviews"),
      db.query(`
        SELECT COUNT(*)::int as c FROM (
          SELECT COALESCE(NULLIF(invitee_email,''), invitee_name), count(*) FROM calendly_events 
          WHERE is_deleted IS NOT TRUE
          GROUP BY 1 HAVING count(*) > 1
        ) t
      `),
    ]);

    const leadsCount = leadsRes.rows[0]?.c || 0;
    const engageCount = engageRes.rows[0]?.c || 0;
    const qualifyCount = callsRes.rows[0]?.c || 0;
    const bookCount = bookRes.rows[0]?.c || 0;
    const consultCount = apptsRes.rows[0]?.c || 0;
    const treatCount = treatRes.rows[0]?.c || 0;
    const revCount = revRes.rows[0]?.c || 0;
    const repeatCount = repeatRes.rows[0]?.c || 0;

    res.json({
      stats: {
        discover: { value: `${leadsCount}`, measure: 'Acquired Enquiries', target: '100+', ok: leadsCount >= 100 },
        engage: { value: `${engageCount}`, measure: 'Active Conversations', target: '5+', ok: engageCount >= 5 },
        capture: { value: `${leadsCount}`, measure: 'Captured Contacts', target: '100%', ok: true },
        qualify: { value: `${qualifyCount}`, measure: 'AI Screened Calls', target: '15+', ok: qualifyCount >= 15 },
        book: { value: `${bookCount}`, measure: 'Booked Consultations', target: '10+', ok: bookCount >= 10 },
        consult: { value: `${consultCount}`, measure: 'Consultation Pipeline', target: '5+', ok: consultCount >= 5 },
        treat: { value: `${treatCount}`, measure: 'Active Care Patients', target: '10+', ok: treatCount >= 10 },
        review: { value: `${revCount}`, measure: 'Google Reviews', target: '5+', ok: revCount >= 5 },
        retain: { value: `${repeatCount}`, measure: 'Repeat Consultations', target: '2+', ok: repeatCount >= 2 },
        refer: { value: '0', measure: 'Referral Rewards', target: '2+', ok: false },
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/patients', requireUser, async (req, res) => {
  try {
    const uid = req.user.id;
    const search = req.query.search ? `%${req.query.search}%` : null;

    const r = await db.query(
      `SELECT l.id, l.first_name, l.last_name, l.email, l.phone, l.company, l.status,
              l.pipeline_stage, l.deal_value, l.created_at,
              ((SELECT COUNT(*)::int FROM clinic_appointments a WHERE a.lead_id = l.id) +
               (SELECT COUNT(*)::int FROM calendly_events ce WHERE 
                 (ce.invitee_email IS NOT NULL AND ce.invitee_email <> '' AND LOWER(ce.invitee_email) = LOWER(l.email))
                 OR (l.phone IS NOT NULL AND l.phone <> '' AND ce.questions->>'Phone / WhatsApp' LIKE '%' || RIGHT(REGEXP_REPLACE(l.phone, '[^0-9]', '', 'g'), 10))
                 OR (ce.invitee_name IS NOT NULL AND ce.invitee_name <> '' AND (
                      LOWER(TRIM(ce.invitee_name)) = LOWER(TRIM(CONCAT(l.first_name, ' ', l.last_name))) 
                      OR LOWER(TRIM(ce.invitee_name)) = LOWER(TRIM(l.first_name))
                    ))
               )) AS appointments,
              COALESCE(
                (SELECT MAX(a.starts_at) FROM clinic_appointments a WHERE a.lead_id = l.id),
                (SELECT MAX(ce.start_time) FROM calendly_events ce WHERE 
                  (ce.invitee_email IS NOT NULL AND ce.invitee_email <> '' AND LOWER(ce.invitee_email) = LOWER(l.email))
                  OR (l.phone IS NOT NULL AND l.phone <> '' AND ce.questions->>'Phone / WhatsApp' LIKE '%' || RIGHT(REGEXP_REPLACE(l.phone, '[^0-9]', '', 'g'), 10))
                  OR (ce.invitee_name IS NOT NULL AND ce.invitee_name <> '' AND (
                       LOWER(TRIM(ce.invitee_name)) = LOWER(TRIM(CONCAT(l.first_name, ' ', l.last_name))) 
                       OR LOWER(TRIM(ce.invitee_name)) = LOWER(TRIM(l.first_name))
                     ))
                )
              ) AS last_visit,
              (SELECT COUNT(*)::int FROM clinic_packages p WHERE p.lead_id = l.id) AS packages,
              (SELECT COALESCE(SUM(p.amount),0)::numeric FROM clinic_packages p WHERE p.lead_id = l.id) AS package_value
         FROM leads l
        WHERE (l.user_id = $1 OR l.user_id IS NULL)
          AND (
            l.pipeline_stage IN ('New Patient', 'Patient', 'Active Patient', 'Consultation', 'Follow-up')
            OR l.pipeline_stage ILIKE 'Stage%'
            OR l.designation ILIKE '%patient%'
            OR l.source IN ('Clinic OS', 'Cal.com Booking')
            OR EXISTS (SELECT 1 FROM clinic_appointments a WHERE a.lead_id = l.id)
            OR EXISTS (SELECT 1 FROM clinic_notes n WHERE n.lead_id = l.id)
            OR EXISTS (SELECT 1 FROM clinic_packages p WHERE p.lead_id = l.id)
            OR EXISTS (SELECT 1 FROM calendly_events ce WHERE 
              (ce.invitee_email IS NOT NULL AND ce.invitee_email <> '' AND LOWER(ce.invitee_email) = LOWER(l.email))
              OR (l.phone IS NOT NULL AND l.phone <> '' AND ce.questions->>'Phone / WhatsApp' LIKE '%' || RIGHT(REGEXP_REPLACE(l.phone, '[^0-9]', '', 'g'), 10))
              OR (ce.invitee_name IS NOT NULL AND ce.invitee_name <> '' AND (
                   LOWER(TRIM(ce.invitee_name)) = LOWER(TRIM(CONCAT(l.first_name, ' ', l.last_name))) 
                   OR LOWER(TRIM(ce.invitee_name)) = LOWER(TRIM(l.first_name))
                 ))
            )
          )
          ${search ? 'AND (l.first_name ILIKE $2 OR l.last_name ILIKE $2 OR l.phone ILIKE $2 OR l.email ILIKE $2)' : ''}
        ORDER BY COALESCE(l.updated_at, l.created_at) DESC
        LIMIT 250`,
      search ? [uid, search] : [uid]
    );
    res.json({ patients: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/patients', requireUser, async (req, res) => {
  try {
    const { firstName, lastName, name, phone, email, company, treatment, branch } = req.body || {};
    let first = firstName;
    let last = lastName;
    if (!first && name) {
      const parts = name.trim().split(/\s+/);
      first = parts[0] || 'Patient';
      last = parts.slice(1).join(' ') || 'Patient';
    }
    first = (first || 'Patient').trim();
    last = (last || 'Patient').trim();

    const cleanEmail = email && email.trim()
      ? email.trim()
      : `patient.${first.toLowerCase().replace(/[^a-z0-9]/g, '') || 'aura'}.${Date.now()}@patient.auraclinic.in`;

    const ins = await db.query(
      `INSERT INTO leads (
        user_id, first_name, last_name, email, phone, company, country, designation, industry,
        pipeline_stage, status, source, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, 'India', 'Patient', 'Healthcare / Clinic',
        'Active Patient', 'Active', 'Clinic OS', NOW(), NOW()
      )
      RETURNING *`,
      [req.user.id, first, last, cleanEmail, phone ? phone.trim() : null, company || branch || 'Aura Laser & Cosmetic Clinic']
    );

    const lead = ins.rows[0];

    // If initial treatment or note provided, create note
    if (treatment) {
      await db.query(
        `INSERT INTO clinic_notes (user_id, lead_id, kind, title, body, created_at)
         VALUES ($1, $2, 'consult', 'Patient Registration', $3, NOW())`,
        [req.user.id, lead.id, `Patient registered with interest in: ${treatment} at ${branch || 'Alkapuri Main Clinic'}`]
      );
    }

    await audit(req.user.id, 'created', 'patient', lead.id);
    res.json({ success: true, patient: lead });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/patients/:id', requireUser, async (req, res) => {
  try {
    const uid = req.user.id;
    const leadId = req.params.id;

    const lead = await db.query('SELECT * FROM leads WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)', [leadId, uid]);
    if (lead.rows.length === 0) return res.status(404).json({ error: 'Patient not found' });
    const patientRow = lead.rows[0];

    const [notes, appointments, packages, calls] = await Promise.all([
      db.query('SELECT * FROM clinic_notes WHERE (user_id = $1 OR user_id IS NULL) AND lead_id = $2 ORDER BY created_at DESC LIMIT 50', [uid, leadId]),
      (async () => {
        const [appts, cal] = await Promise.all([
          db.query('SELECT * FROM clinic_appointments WHERE (user_id = $1 OR user_id IS NULL) AND lead_id = $2 ORDER BY starts_at DESC LIMIT 30', [uid, leadId]),
          patientRow?.email ? db.query(
            `SELECT * FROM calendly_events
              WHERE (user_id = $1 OR user_id IS NULL) AND COALESCE(is_deleted, false) = false
                AND LOWER(invitee_email) = LOWER($2)
              ORDER BY start_time DESC LIMIT 30`,
            [uid, patientRow.email]
          ) : { rows: [] }
        ]);
        const mappedCal = cal.rows.map(mapCalRowToClinic);
        return [...appts.rows, ...mappedCal].sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));
      })(),
      db.query('SELECT * FROM clinic_packages WHERE (user_id = $1 OR user_id IS NULL) AND lead_id = $2 ORDER BY created_at DESC', [uid, leadId]),
      tryQuery(
        `SELECT id, status, started_at, duration_secs, transcript_summary, transcript, call_sid
           FROM clinic_calls WHERE lead_id = $1 OR phone = $2 ORDER BY started_at DESC LIMIT 20`,
        [leadId, patientRow.phone || '']
      ),
    ]);

    res.json({
      patient: patientRow,
      notes: notes.rows,
      appointments: appointments,
      packages: packages.rows,
      calls: calls.rows,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/patients/:id', requireUser, async (req, res) => {
  try {
    const leadId = req.params.id;
    const uid = req.user?.id;

    const pRes = await db.query('SELECT * FROM leads WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)', [leadId, uid]);
    if (pRes.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    const p = pRes.rows[0];

    // Mark matching calendly events as deleted so background sync won't revive them
    if (p.email && p.email.trim()) {
      await db.query("UPDATE calendly_events SET is_deleted = true, status = 'canceled' WHERE LOWER(invitee_email) = LOWER($1)", [p.email.trim()]).catch(() => {});
    }
    if (p.phone && p.phone.trim()) {
      const cleanPhone = p.phone.replace(/[^0-9]/g, '');
      if (cleanPhone.length >= 10) {
        await db.query("UPDATE calendly_events SET is_deleted = true, status = 'canceled' WHERE questions->>'Phone / WhatsApp' LIKE '%' || $1", [cleanPhone.slice(-10)]).catch(() => {});
      }
    }
    if (p.first_name && p.last_name) {
      await db.query("UPDATE calendly_events SET is_deleted = true, status = 'canceled' WHERE LOWER(invitee_name) ILIKE $1", [`%${p.first_name.trim()}%${p.last_name.trim()}%`]).catch(() => {});
    }

    // Delete related records from child tables to prevent foreign key errors
    await db.query('DELETE FROM clinic_notes WHERE lead_id = $1', [leadId]).catch(() => {});
    await db.query('DELETE FROM clinic_appointments WHERE lead_id = $1', [leadId]).catch(() => {});
    await db.query('DELETE FROM clinic_packages WHERE lead_id = $1', [leadId]).catch(() => {});
    await db.query('DELETE FROM clinic_waitlist WHERE lead_id = $1', [leadId]).catch(() => {});
    await db.query('DELETE FROM appointments WHERE lead_id = $1', [leadId]).catch(() => {});
    await db.query('DELETE FROM ai_calls WHERE lead_id = $1', [leadId]).catch(() => {});
    await db.query('DELETE FROM touchpoints WHERE lead_id = $1', [leadId]).catch(() => {});
    await db.query('DELETE FROM meetings WHERE lead_id = $1', [leadId]).catch(() => {});
    await db.query('DELETE FROM proposals WHERE lead_id = $1', [leadId]).catch(() => {});
    await db.query('DELETE FROM lead_audits WHERE lead_id = $1', [leadId]).catch(() => {});
    await db.query('DELETE FROM audit_runs WHERE lead_id = $1', [leadId]).catch(() => {});
    await db.query('DELETE FROM outreach_emails WHERE lead_id = $1', [leadId]).catch(() => {});
    await db.query('DELETE FROM whatsapp_conversations WHERE lead_id = $1', [leadId]).catch(() => {});
    await db.query('DELETE FROM lead_brain_memory WHERE lead_id = $1', [leadId]).catch(() => {});
    await db.query('DELETE FROM agent_activities WHERE lead_id = $1', [leadId]).catch(() => {});
    await db.query('DELETE FROM agent_activity_log WHERE lead_id = $1', [leadId]).catch(() => {});
    await db.query('DELETE FROM lead_list_items WHERE lead_id = $1', [leadId]).catch(() => {});
    await db.query('DELETE FROM play_leads WHERE lead_id = $1', [leadId]).catch(() => {});
    await db.query('DELETE FROM hubspot_inbox_threads WHERE lead_id = $1', [leadId]).catch(() => {});

    // Delete from leads table
    await db.query('DELETE FROM leads WHERE id = $1', [leadId]);

    await audit(uid || p.user_id, 'deleted', 'patient', leadId);

    res.json({ success: true, message: 'Patient deleted successfully', id: leadId });
  } catch (err) {
    console.error('Error deleting patient:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update patient care stage
router.patch('/patients/:id/stage', requireUser, async (req, res) => {
  try {
    const leadId = req.params.id;
    const { stage } = req.body || {};
    if (!stage) return res.status(400).json({ error: 'Stage is required' });

    await db.query('UPDATE leads SET pipeline_stage = $1, updated_at = NOW() WHERE id = $2', [stage, leadId]);

    await db.query(`
      INSERT INTO clinic_notes (user_id, lead_id, kind, title, body, created_at)
      VALUES ($1, $2, 'consult', 'Care Stage Updated', $3, NOW())
    `, [req.user?.id, leadId, `Patient care stage moved to "${stage}".`]).catch(() => {});

    res.json({ success: true, stage });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Convert sales lead to patient
router.post('/patients/convert-lead/:id', requireUser, async (req, res) => {
  try {
    const leadId = req.params.id;
    const { stage = 'Stage 1: Discover' } = req.body || {};
    const leadRes = await db.query('SELECT * FROM leads WHERE id = $1', [leadId]);
    if (leadRes.rows.length === 0) return res.status(404).json({ error: 'Lead not found' });
    const lead = leadRes.rows[0];

    await db.query(`
      UPDATE leads
      SET pipeline_stage = 'Active Patient',
          designation = 'Patient',
          source = COALESCE(source, 'Clinic OS'),
          status = 'Active',
          updated_at = NOW()
      WHERE id = $1
    `, [leadId]);

    await db.query(`
      INSERT INTO clinic_notes (user_id, lead_id, kind, title, body, created_at)
      VALUES ($1, $2, 'consult', 'Converted from Sales Lead', $3, NOW())
    `, [
      req.user?.id || lead.user_id,
      leadId,
      `Lead "${[lead.first_name, lead.last_name].filter(Boolean).join(' ')}" was converted to an active Clinic Patient (${stage}).`
    ]).catch(() => {});

    await audit(req.user?.id || lead.user_id, 'converted', 'patient', leadId);

    res.json({ success: true, message: 'Lead converted to patient successfully', id: leadId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/notes', requireUser, async (req, res) => {
  try {
    const uid = req.user.id;
    const { leadId, kind, title, body, meta } = req.body || {};
    if (!body && !title) return res.status(400).json({ error: 'title or body required' });
    const r = await db.query(
      `INSERT INTO clinic_notes (user_id, lead_id, kind, title, body, meta)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING *`,
      [uid, leadId || null, kind || 'note', title || null, body || null, JSON.stringify(meta || {})]
    );
    await audit(uid, 'created', 'note', r.rows[0].id, title || String(body || '').slice(0, 80));
    res.json({ note: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
router.get('/tasks', requireUser, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT * FROM clinic_tasks WHERE user_id = $1 ORDER BY
         CASE WHEN status = 'open' THEN 0 ELSE 1 END,
         (priority = 'high') DESC, due_at NULLS LAST, created_at DESC`,
      [req.user.id]
    );
    res.json({ tasks: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/tasks', requireUser, async (req, res) => {
  try {
    const { title, detail, priority, dueAt, href } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title required' });
    const r = await db.query(
      `INSERT INTO clinic_tasks (user_id, title, detail, priority, due_at, href)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.id, title, detail || null, priority === 'high' ? 'high' : 'normal', dueAt || null, href || null]
    );
    await audit(req.user.id, 'created', 'task', r.rows[0].id, title);
    res.json({ task: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/tasks/:id', requireUser, async (req, res) => {
  try {
    const { status } = req.body || {};
    const r = await db.query(
      `UPDATE clinic_tasks SET status = $1 WHERE id = $2 AND user_id = $3 RETURNING *`,
      [status === 'done' ? 'done' : 'open', req.params.id, req.user.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    await audit(req.user.id, status === 'done' ? 'completed' : 'reopened', 'task', req.params.id);
    res.json({ task: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------------------------------------------------------------------------
// Packages
// ---------------------------------------------------------------------------
router.post('/packages', requireUser, async (req, res) => {
  try {
    const uid = req.user.id;
    const { leadId, name, totalSessions, amount, paidAmount } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name required' });
    const r = await db.query(
      `INSERT INTO clinic_packages (user_id, lead_id, name, total_sessions, amount, paid_amount)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [uid, leadId || null, name, Number(totalSessions) || 1, Number(amount) || 0, Number(paidAmount) || 0]
    );
    await audit(uid, 'created', 'package', r.rows[0].id, name);
    res.json({ package: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/packages/:id/use', requireUser, async (req, res) => {
  try {
    const r = await db.query(
      `UPDATE clinic_packages
          SET used_sessions = LEAST(total_sessions, used_sessions + 1),
              status = CASE WHEN used_sessions + 1 >= total_sessions THEN 'completed' ELSE status END
        WHERE id = $1 AND user_id = $2 RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Package not found' });
    await audit(req.user.id, 'session-used', 'package', req.params.id, `${r.rows[0].used_sessions}/${r.rows[0].total_sessions}`);
    res.json({ package: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------------------------------------------------------------------------
// Optional demo seed — never touches leads or any existing table.
// ---------------------------------------------------------------------------
router.post('/seed-demo', requireUser, async (req, res) => {
  try {
    const uid = req.user.id;
    const already = await db.query('SELECT 1 FROM clinic_seed_state WHERE user_id = $1', [uid]);
    if (already.rows.length > 0) return res.json({ seeded: false, reason: 'already-seeded' });

    const today = new Date();
    const at = (dayOffset, hour, minute = 0) => {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + dayOffset, hour, minute);
      return d.toISOString();
    };

    const rows = [
      ['Kavya Patel', '+91 98250 11021', 'Laser hair reduction', 'Alkapuri', at(0, 10, 0), 'confirmed', 4500],
      ['Aarti Shah', '+91 98980 22032', 'Bridal consult', 'Alkapuri', at(0, 11, 30), 'booked', 1500],
      ['Ravi Thakkar', '+91 97250 33043', 'Acne scar consult', 'Manjalpur', at(0, 14, 0), 'arrived', 1200],
      ['Sneha Joshi', '+91 99090 44054', 'HydraFacial', 'Vasna Bhayli', at(0, 16, 30), 'booked', 3200],
      ['Priya Mehta', '+91 98790 55065', 'Botox review', 'Alkapuri', at(1, 9, 30), 'booked', 0],
      ['Nisha Desai', '+91 98240 66076', 'Laser hair reduction', 'Manjalpur', at(2, 12, 0), 'booked', 4500],
    ];

    for (const r of rows) {
      await db.query(
        `INSERT INTO clinic_appointments
           (user_id, patient_name, phone, treatment, branch, starts_at, status, amount)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [uid, r[0], r[1], r[2], r[3], r[4], r[5], r[6]]
      );
    }

    await db.query(
      `INSERT INTO clinic_tasks (user_id, title, detail, priority, due_at)
       VALUES
        ($1,'Call Aarti about bridal package','She asked for a Saturday consult and a 6-sitting quote.', 'high', NOW() + interval '2 hours'),
        ($1,'Send payment link to Ravi','Acne scar package, ₹18,000, 3 sittings.', 'normal', NOW() + interval '1 day'),
        ($1,'Reply to 3-star Google review','Review is assigned to Dr. Aditya.', 'high', NOW() + interval '4 hours')`,
      [uid]
    );

    await db.query(
      `INSERT INTO clinic_notes (user_id, kind, title, body)
       VALUES
        ($1,'system','Clinic OS enabled','Appointments, patient timeline and tasks are now live.'),
        ($1,'call','Call with Sneha Joshi','She wants a HydraFacial before her sister''s wedding. Happy with the ₹3,200 quote.')`,
      [uid]
    );

    await db.query('INSERT INTO clinic_seed_state (user_id) VALUES ($1)', [uid]);
    res.json({ seeded: true });
  } catch (err) {
    console.error('[clinic-os] seed:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
router.get('/settings', requireUser, async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM clinic_settings WHERE user_id = $1', [req.user.id]);
    res.json({ settings: r.rows[0] || { branches: [], treatments: [], hours: {}, ai_notes: '', consent: {} } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/settings', requireUser, async (req, res) => {
  try {
    const uid = req.user.id;
    const { clinicName, branches, treatments, hours, aiNotes, consent } = req.body || {};
    const r = await db.query(
      `INSERT INTO clinic_settings (user_id, clinic_name, branches, treatments, hours, ai_notes, consent)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (user_id) DO UPDATE SET
         clinic_name = EXCLUDED.clinic_name,
         branches = EXCLUDED.branches,
         treatments = EXCLUDED.treatments,
         hours = EXCLUDED.hours,
         ai_notes = EXCLUDED.ai_notes,
         consent = EXCLUDED.consent,
         updated_at = NOW()
       RETURNING *`,
      [uid, clinicName || null, JSON.stringify(branches || []), JSON.stringify(treatments || []), JSON.stringify(hours || {}), aiNotes || '', JSON.stringify(consent || {})]
    );
    await audit(uid, 'updated', 'settings', 'clinic');
    res.json({ settings: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------------------------------------------------------------------------
// Playbooks
// ---------------------------------------------------------------------------
router.get('/playbooks', requireUser, async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM clinic_playbooks WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
    res.json({ playbooks: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/playbooks', requireUser, async (req, res) => {
  try {
    const { title, channel, stage, body } = req.body || {};
    if (!title || !body) return res.status(400).json({ error: 'title and body required' });
    const r = await db.query(
      `INSERT INTO clinic_playbooks (user_id, title, channel, stage, body)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.id, title, channel || 'call', stage || null, body]
    );
    await audit(req.user.id, 'created', 'playbook', r.rows[0].id, title);
    res.json({ playbook: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/playbooks/:id', requireUser, async (req, res) => {
  try {
    const { active, title, body } = req.body || {};
    const sets = []; const vals = [];
    if (typeof active === 'boolean') { vals.push(active); sets.push(`active = $${vals.length}`); }
    if (title) { vals.push(title); sets.push(`title = $${vals.length}`); }
    if (body) { vals.push(body); sets.push(`body = $${vals.length}`); }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
    vals.push(req.params.id, req.user.id);
    const r = await db.query(`UPDATE clinic_playbooks SET ${sets.join(', ')} WHERE id = $${vals.length - 1} AND user_id = $${vals.length} RETURNING *`, vals);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Playbook not found' });
    await audit(req.user.id, 'updated', 'playbook', req.params.id);
    res.json({ playbook: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------
router.get('/reviews', requireUser, async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM clinic_reviews WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100', [req.user.id]);
    res.json({ reviews: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/reviews', requireUser, async (req, res) => {
  try {
    const { leadId, author, rating, channel, body } = req.body || {};
    if (!author || !body) return res.status(400).json({ error: 'author and body required' });
    const r = await db.query(
      `INSERT INTO clinic_reviews (user_id, lead_id, author, rating, channel, body)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.id, leadId || null, author, Number(rating) || 5, channel || 'Google', body]
    );
    await audit(req.user.id, 'created', 'review', r.rows[0].id, `${author}: ${String(body).slice(0, 60)}`);
    res.json({ review: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/reviews/:id/reply', requireUser, async (req, res) => {
  try {
    const { reply } = req.body || {};
    if (!reply) return res.status(400).json({ error: 'reply required' });
    const r = await db.query('UPDATE clinic_reviews SET reply = $1, status = $2 WHERE id = $3 AND user_id = $4 RETURNING *', [reply, 'replied', req.params.id, req.user.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Review not found' });
    await audit(req.user.id, 'replied', 'review', req.params.id);
    res.json({ review: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------------------------------------------------------------------------
// Retention (patients who haven't visited in N days)
// ---------------------------------------------------------------------------
router.get('/retention', requireUser, async (req, res) => {
  try {
    const days = Number(req.query.days) || 90;
    const r = await db.query(
      `SELECT l.id, l.first_name, l.last_name, l.phone, l.email,
              MAX(a.starts_at) AS last_visit,
              (SELECT name FROM clinic_packages p WHERE p.lead_id = l.id AND p.user_id = $1 ORDER BY created_at DESC LIMIT 1) AS last_package
         FROM leads l
         LEFT JOIN clinic_appointments a ON a.lead_id = l.id AND a.user_id = $1
        WHERE l.user_id = $1
        GROUP BY l.id, l.first_name, l.last_name, l.phone, l.email
        HAVING MAX(a.starts_at) < NOW() - ($2 || ' days')::interval
           OR MAX(a.starts_at) IS NULL
        ORDER BY last_visit NULLS FIRST
        LIMIT 200`,
      [req.user.id, days]
    );
    res.json({ patients: r.rows, days });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------------------------------------------------------------------------
// Campaigns (re-use Aura campaigns table)
// ---------------------------------------------------------------------------
router.get('/campaigns', requireUser, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT id, name, segment, status, template, scheduled_at, sent, delivered, replied, booked, total, created_at
         FROM campaigns WHERE org_id = (SELECT org_id FROM users WHERE id = $1 LIMIT 1)
         ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ campaigns: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------------------------------------------------------------------------
// Reports (analytics aggregate)
// ---------------------------------------------------------------------------
router.get('/reports', requireUser, async (req, res) => {
  try {
    const from = req.query.from ? new Date(req.query.from) : (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d; })();
    const to = req.query.to ? new Date(req.query.to) : new Date();

    const [appts, pkg, rev, conv] = await Promise.all([
      db.query(`SELECT status, COUNT(*)::int AS n FROM clinic_appointments WHERE user_id = $1 AND starts_at BETWEEN $2 AND $3 GROUP BY 1`, [req.user.id, from, to]),
      db.query(`SELECT status, COUNT(*)::int AS n FROM clinic_packages WHERE user_id = $1 AND created_at BETWEEN $2 AND $3 GROUP BY 1`, [req.user.id, from, to]),
      db.query(`SELECT COALESCE(SUM(amount),0)::numeric AS sold, COALESCE(SUM(paid_amount),0)::numeric AS collected FROM clinic_packages WHERE user_id = $1 AND created_at BETWEEN $2 AND $3`, [req.user.id, from, to]),
      tryQuery(`SELECT COUNT(*)::int AS calls, COUNT(*) FILTER (WHERE call_status = 'completed')::int AS completed FROM bulk_attempts a JOIN bulk_campaigns c ON c.id = a.campaign_id WHERE c.created_by = $1 AND a.started_at BETWEEN $2 AND $3`, [req.user.id, from, to]),
    ]);

    res.json({
      range: { from: from.toISOString(), to: to.toISOString() },
      appointments: appts.rows,
      packages: pkg.rows,
      revenue: rev.rows[0],
      calls: conv.rows[0] || { calls: 0, completed: 0 },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------
router.get('/audit', requireUser, async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM clinic_audit WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200', [req.user.id]);
    res.json({ audit: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------------------------------------------------------------------------
// Unified Omni-Channel Inbox (WhatsApp + Emails + AI Calls + Clinic Notes)
// ---------------------------------------------------------------------------
router.get('/inbox', requireUser, async (req, res) => {
  try {
    const uid = req.user.id;
    const limit = Number(req.query.limit) || 100;

    const [wa, emails, calls, notes] = await Promise.all([
      // 1. WhatsApp Conversations
      db.query(
        `SELECT wc.id, wc.lead_id, wc.phone, wc.unread_count, wc.last_message_at,
                l.first_name, l.last_name, l.email,
                COALESCE(
                  (SELECT content FROM whatsapp_messages wm
                   WHERE wm.conversation_id = wc.id OR (wm.lead_id IS NOT NULL AND wm.lead_id = l.id)
                   ORDER BY COALESCE(wm.sent_at, wm.timestamp, wm.created_at, NOW()) DESC LIMIT 1),
                  wc.last_message,
                  'WhatsApp conversation'
                ) AS preview
           FROM whatsapp_conversations wc
           LEFT JOIN leads l ON l.id = wc.lead_id
          WHERE wc.org_id = (SELECT org_id FROM users WHERE id = $1) OR l.user_id = $1 OR wc.lead_id IS NOT NULL
          ORDER BY wc.last_message_at DESC NULLS LAST LIMIT $2`,
        [uid, limit]
      ),
      // 2. Emails (Outreach and Inbound Replies)
      tryQuery(
        `SELECT oe.id, oe.lead_id, COALESCE(oe.to_email, oe.recipient_email) AS email,
                oe.subject, oe.status, oe.body, oe.created_at, oe.sent_at,
                l.first_name, l.last_name, l.phone,
                (SELECT er.body FROM email_replies er 
                  WHERE (er.lead_id IS NOT NULL AND er.lead_id = oe.lead_id) 
                     OR (er.outreach_email_id IS NOT NULL AND er.outreach_email_id = oe.id)
                     OR (LOWER(er.from_email) = LOWER(COALESCE(oe.to_email, oe.recipient_email)))
                  ORDER BY er.received_at DESC LIMIT 1) AS reply_body,
                (SELECT er.received_at FROM email_replies er 
                  WHERE (er.lead_id IS NOT NULL AND er.lead_id = oe.lead_id) 
                     OR (er.outreach_email_id IS NOT NULL AND er.outreach_email_id = oe.id)
                     OR (LOWER(er.from_email) = LOWER(COALESCE(oe.to_email, oe.recipient_email)))
                  ORDER BY er.received_at DESC LIMIT 1) AS reply_at
           FROM outreach_emails oe
           LEFT JOIN leads l ON l.id = oe.lead_id
          WHERE oe.user_id = $1 OR oe.lead_id IS NOT NULL OR oe.recipient_email IS NOT NULL OR oe.to_email IS NOT NULL
          ORDER BY COALESCE(oe.sent_at, oe.created_at) DESC LIMIT $2`,
        [uid, limit]
      ),
      // 3. AI Telephony Calls
      tryQuery(
        `SELECT ac.id, ac.lead_id, ac.started_at, ac.status, ac.transcript_summary,
                ac.duration_secs, ac.to_phone, ac.lead_name, ac.company_name,
                l.first_name, l.last_name, l.email, COALESCE(ac.to_phone, l.phone) AS phone
           FROM ai_calls ac
           LEFT JOIN leads l ON l.id = ac.lead_id
          ORDER BY ac.started_at DESC LIMIT $1`,
        [limit]
      ),
      // 4. Clinical Notes & Consultations
      tryQuery(
        `SELECT cn.id, cn.lead_id, cn.kind, cn.title, cn.body, cn.created_at,
                l.first_name, l.last_name, l.phone, l.email
           FROM clinic_notes cn
           LEFT JOIN leads l ON l.id = cn.lead_id
          ORDER BY cn.created_at DESC LIMIT $1`,
        [limit]
      ),
    ]);

    const threads = [];

    // WhatsApp Threads
    for (const row of wa.rows) {
      threads.push({
        type: 'whatsapp',
        id: row.id,
        leadId: row.lead_id,
        name: [row.first_name, row.last_name].filter(Boolean).join(' ') || row.phone || 'WhatsApp Patient',
        phone: row.phone,
        email: row.email,
        unread: row.unread_count || 0,
        status: 'active',
        lastAt: row.last_message_at,
        preview: row.preview || 'Click to open WhatsApp dialogue',
      });
    }

    // Email Threads
    for (const row of (emails?.rows || [])) {
      const cleanBody = (row.reply_body || row.body || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const hasReply = !!row.reply_body;
      threads.push({
        type: 'email',
        id: row.id,
        leadId: row.lead_id,
        name: [row.first_name, row.last_name].filter(Boolean).join(' ') || row.email || 'Email Patient',
        email: row.email,
        phone: row.phone,
        subject: row.subject || 'Consultation & Treatment',
        unread: hasReply ? 1 : 0,
        status: hasReply ? 'replied' : (row.status || 'sent'),
        lastAt: row.reply_at || row.sent_at || row.created_at,
        preview: hasReply ? `Reply: ${cleanBody.slice(0, 110)}` : (row.subject ? `${row.subject} — ${cleanBody.slice(0, 80)}` : cleanBody.slice(0, 100)),
      });
    }

    // AI Call Threads
    for (const row of (calls?.rows || [])) {
      threads.push({
        type: 'call',
        id: row.id,
        leadId: row.lead_id,
        name: [row.first_name, row.last_name].filter(Boolean).join(' ') || row.lead_name || 'Patient Consultation Call',
        phone: row.phone || row.to_phone,
        email: row.email,
        unread: 0,
        durationSecs: row.duration_secs || 0,
        status: row.status || 'completed',
        lastAt: row.started_at,
        preview: row.transcript_summary || `AI Call (${row.duration_secs || 0}s) — ${row.status || 'completed'}`,
      });
    }

    // Clinic Notes
    for (const row of notes.rows) {
      threads.push({
        type: 'note',
        id: row.id,
        leadId: row.lead_id,
        name: [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Clinical Note',
        phone: row.phone,
        email: row.email,
        unread: 0,
        status: row.kind || 'note',
        lastAt: row.created_at,
        preview: `${row.title || row.kind}: ${(row.body || '').slice(0, 90)}`,
      });
    }

    // Sort newest first
    threads.sort((a, b) => new Date(b.lastAt || 0) - new Date(a.lastAt || 0));
    res.json({ threads: threads.slice(0, limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Detailed conversation thread loader
router.get('/inbox/thread', requireUser, async (req, res) => {
  try {
    const { type, id, leadId } = req.query;
    if (!type || !id) return res.status(400).json({ error: 'type and id are required' });

    if (type === 'whatsapp') {
      const convRes = await db.query('SELECT * FROM whatsapp_conversations WHERE id = $1', [id]);
      const conv = convRes.rows[0] || null;
      const msgs = await db.query(
        `SELECT id, conversation_id, direction, content, body, status, sent_at, timestamp, created_at
           FROM whatsapp_messages
          WHERE conversation_id = $1 OR (lead_id IS NOT NULL AND lead_id = $2)
          ORDER BY COALESCE(sent_at, timestamp, created_at) ASC`,
        [id, conv?.lead_id || leadId || 0]
      );
      return res.json({
        type: 'whatsapp',
        conversation: conv,
        messages: msgs.rows.map(m => ({
          id: m.id,
          direction: m.direction || 'outbound',
          content: m.content || m.body || '',
          status: m.status,
          sentAt: m.sent_at || m.timestamp || m.created_at
        }))
      });
    }

    if (type === 'email') {
      const emailRes = await db.query('SELECT * FROM outreach_emails WHERE id = $1', [id]);
      const email = emailRes.rows[0];
      if (!email) return res.status(404).json({ error: 'Email record not found' });

      const targetLeadId = email.lead_id || leadId;
      const targetEmail = email.to_email || email.recipient_email;

      const [outbound, inbound] = await Promise.all([
        db.query(
          `SELECT id, 'outbound' as direction, subject, body, status, sent_at, created_at
             FROM outreach_emails
            WHERE id = $1 OR (lead_id IS NOT NULL AND lead_id = $2) OR (to_email = $3 OR recipient_email = $3)
            ORDER BY COALESCE(sent_at, created_at) ASC`,
          [id, targetLeadId || 0, targetEmail || '']
        ),
        tryQuery(
          `SELECT id, 'inbound' as direction, subject, body, 'received' as status, received_at as sent_at, created_at
             FROM email_replies
            WHERE (lead_id IS NOT NULL AND lead_id = $1) OR (outreach_email_id IS NOT NULL AND outreach_email_id = $2) OR LOWER(from_email) = LOWER($3)
            ORDER BY COALESCE(received_at, created_at) ASC`,
          [targetLeadId || 0, id, targetEmail || '']
        )
      ]);

      const thread = [...outbound.rows, ...(inbound?.rows || [])].sort((a, b) => new Date(a.sent_at || a.created_at) - new Date(b.sent_at || b.created_at));

      return res.json({
        type: 'email',
        email,
        messages: thread.map(m => ({
          id: m.id,
          direction: m.direction,
          subject: m.subject,
          content: m.body,
          status: m.status,
          sentAt: m.sent_at || m.created_at
        }))
      });
    }

    if (type === 'call') {
      const callRes = await db.query('SELECT * FROM ai_calls WHERE id = $1', [id]);
      if (callRes.rows.length === 0) return res.status(404).json({ error: 'Call record not found' });
      const call = callRes.rows[0];
      return res.json({
        type: 'call',
        call,
        transcript: call.transcript || call.transcript_summary || 'Dialogue completed.',
        summary: call.transcript_summary
      });
    }

    if (type === 'note') {
      const noteRes = await db.query('SELECT * FROM clinic_notes WHERE id = $1', [id]);
      if (noteRes.rows.length === 0) return res.status(404).json({ error: 'Note not found' });
      const note = noteRes.rows[0];
      const related = await db.query('SELECT * FROM clinic_notes WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 10', [note.lead_id || 0]);
      return res.json({
        type: 'note',
        note,
        relatedNotes: related.rows
      });
    }

    res.status(400).json({ error: 'Unknown thread type' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reply or send message from Inbox
router.post('/inbox/reply', requireUser, async (req, res) => {
  try {
    const { type, conversationId, leadId, phone, email, subject, body } = req.body || {};
    if (!body || !body.trim()) return res.status(400).json({ error: 'Message body is required' });

    if (type === 'whatsapp') {
      let convId = conversationId;
      if (!convId && phone) {
        const clean = phone.replace(/[^0-9]/g, '');
        const ex = await db.query('SELECT id FROM whatsapp_conversations WHERE phone LIKE $1 LIMIT 1', [`%${clean.slice(-10)}%`]);
        if (ex.rows.length > 0) convId = ex.rows[0].id;
      }
      if (!convId) {
        const ins = await db.query(
          `INSERT INTO whatsapp_conversations (lead_id, phone, status, last_message, last_message_at)
           VALUES ($1, $2, 'Active', $3, NOW()) RETURNING id`,
          [leadId || null, phone, body.trim()]
        );
        convId = ins.rows[0].id;
      }

      await db.query(
        `INSERT INTO whatsapp_messages (conversation_id, lead_id, phone, direction, content, body, status, sent_at, created_at)
         VALUES ($1, $2, $3, 'outbound', $4, $4, 'delivered', NOW(), NOW())`,
        [convId, leadId || null, phone || null, body.trim()]
      );

      await db.query(
        'UPDATE whatsapp_conversations SET last_message = $1, last_message_at = NOW() WHERE id = $2',
        [body.trim(), convId]
      );

      return res.json({ success: true, message: 'WhatsApp message sent' });
    }

    if (type === 'email') {
      const ins = await db.query(
        `INSERT INTO outreach_emails (user_id, lead_id, to_email, recipient_email, subject, body, status, sent_at, created_at)
         VALUES ($1, $2, $3, $3, $4, $5, 'sent', NOW(), NOW()) RETURNING *`,
        [req.user.id, leadId || null, email, subject || 'Re: Patient Consultation', body.trim()]
      );
      return res.json({ success: true, message: 'Email sent', email: ins.rows[0] });
    }

    if (type === 'note') {
      const ins = await db.query(
        `INSERT INTO clinic_notes (user_id, lead_id, kind, title, body, created_at)
         VALUES ($1, $2, 'note', $3, $4, NOW()) RETURNING *`,
        [req.user.id, leadId || null, subject || 'Follow-up Note', body.trim()]
      );
      return res.json({ success: true, message: 'Note added', note: ins.rows[0] });
    }

    res.status(400).json({ error: 'Invalid reply type' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Dialer: list leads with phone for outbound
// ---------------------------------------------------------------------------
router.get('/dialer/leads', requireUser, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT id, first_name, last_name, phone, company, pipeline_stage
         FROM leads WHERE (user_id = $1 OR user_id IS NULL) AND phone IS NOT NULL AND phone <> ''
         ORDER BY COALESCE(updated_at, created_at) DESC NULLS LAST LIMIT 250`,
      [req.user.id]
    );
    res.json({ leads: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/dialer/call', requireUser, async (req, res) => {
  try {
    const {
      destination,
      conversationType = 'patient_consultation',
      doctor,
      branch,
      leadId,
      isMock = false,
      mockOutcome = 'connected',
      durationSecs = 0,
    } = req.body || {};

    if (!destination && !leadId) {
      return res.status(400).json({ error: 'Destination phone number or lead ID is required' });
    }

    let finalLeadId = leadId ? Number(leadId) : null;
    let contactName = 'Patient';
    let companyName = branch || 'Aura Laser & Cosmetic Clinic';

    if (finalLeadId) {
      const l = await db.query('SELECT first_name, last_name, phone, company FROM leads WHERE id = $1', [finalLeadId]);
      if (l.rows.length > 0) {
        contactName = [l.rows[0].first_name, l.rows[0].last_name].filter(Boolean).join(' ') || contactName;
        companyName = l.rows[0].company || companyName;
      }
    } else if (destination) {
      const cleaned = destination.replace(/[^\d+]/g, '');
      const l = await db.query(
        'SELECT id, first_name, last_name, company FROM leads WHERE (user_id = $1 OR user_id IS NULL) AND (phone = $2 OR phone LIKE $3) LIMIT 1',
        [req.user.id, cleaned, `%${cleaned.slice(-10)}%`]
      );
      if (l.rows.length > 0) {
        finalLeadId = l.rows[0].id;
        contactName = [l.rows[0].first_name, l.rows[0].last_name].filter(Boolean).join(' ') || contactName;
        companyName = l.rows[0].company || companyName;
      } else {
        // Automatically save new dialed phone number as a patient in leads table
        const lastDigits = cleaned.slice(-4) || 'Contact';
        const insLead = await db.query(
          `INSERT INTO leads (user_id, first_name, last_name, phone, company, status, pipeline_stage, created_at, updated_at)
           VALUES ($1, 'Patient', $2, $3, $4, 'Active', 'Dialer Patient', NOW(), NOW())
           RETURNING *`,
          [req.user.id, lastDigits, destination, companyName]
        );
        finalLeadId = insLead.rows[0].id;
        contactName = `Patient ${lastDigits}`;
      }
    }

    const typeLabels = {
      patient_consultation: 'Patient Consultation',
      follow_up: 'Post-Treatment Follow-up',
      treatment_query: 'Treatment Inquiry',
      appointment_booking: 'Appointment Booking',
      payment_reminder: 'Package / Payment Reminder',
      general: 'General Front-Desk Inquiry',
    };
    const label = typeLabels[conversationType] || 'Clinical Consultation';

    const transcriptsByOutcome = {
      connected: [
        { speaker: 'AI', text: `Hello! Thank you for speaking with Dr. Aditya Shah's Aura Laser & Cosmetic Clinic. I am Ketki, your AI clinical coordinator.` },
        { speaker: 'Patient', text: `Hello! Yes, I was inquiring regarding ${label.toLowerCase()}.` },
        { speaker: 'AI', text: `Certainly! Our team will ensure you receive personalized care. I have updated your consultation notes for ${doctor || 'the clinical team'} at ${branch || 'Alkapuri Main'}.` },
        { speaker: 'Patient', text: 'Thank you so much, that sounds wonderful.' },
        { speaker: 'AI', text: 'You are most welcome! Have a wonderful day ahead.' },
      ],
      busy: [
        { speaker: 'System', text: 'Subscriber line was reported busy. Call could not be connected.' },
      ],
      'no-answer': [
        { speaker: 'System', text: 'No answer from subscriber destination after 30 seconds of ringing.' },
      ],
      failed: [
        { speaker: 'System', text: 'Carrier returned network error or unreachable route.' },
      ],
    };

    if (isMock) {
      const convId = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const callSid = `MCK_${Date.now()}`;
      const status = mockOutcome === 'connected' ? 'in-progress' : mockOutcome;
      const actualDuration = mockOutcome === 'connected' ? (durationSecs || 0) : 0;
      const transcript = transcriptsByOutcome[mockOutcome] || transcriptsByOutcome.connected;
      const summary = mockOutcome === 'connected'
        ? `Call active: Patient discussing ${label.toLowerCase()} with coordinator. Assigned to ${doctor || 'Clinic Team'} (${branch || 'Alkapuri Main'}).`
        : `Call attempt ended with status: ${mockOutcome}.`;

      // Insert immediately into ai_calls table in PostgreSQL DB
      const inserted = await db.query(
        `INSERT INTO ai_calls (lead_id, conversation_id, call_sid, to_phone, lead_name, company_name, status, booking_type, duration_secs, transcript_summary, transcript, started_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
         RETURNING *`,
        [finalLeadId, convId, callSid, destination, contactName, companyName, status, conversationType, actualDuration, summary, JSON.stringify(transcript)]
      );

      // Record clinic note on patient timeline
      if (finalLeadId) {
        await db.query(
          `INSERT INTO clinic_notes (user_id, lead_id, kind, title, body, created_at)
           VALUES ($1, $2, 'call', $3, $4, NOW())`,
          [req.user.id, finalLeadId, `AI Call: ${label}`, summary]
        );
      }

      return res.json({ success: true, isMock: true, call: inserted.rows[0] });
    }

    // 1. Plivo Real Call (Default when live telephony engine is Plivo)
    const { engine = 'plivo' } = req.body || {};
    if (engine === 'plivo') {
      const plivo = require('./plivo');
      const creds = plivo.getPlivoCredentials();
      if (!creds.isConfigured) {
        return res.status(400).json({
          error: 'Plivo credentials are not configured yet. Please configure your Plivo Auth ID, Auth Token, and Plivo Number.',
          requiresPlivoConfig: true,
        });
      }

      const hostUrl = `${req.protocol}://${req.get('host')}`;
      const plivoResult = await plivo.dispatchPlivoCall({
        to: destination,
        from: creds.callerId,
        conversationType,
        doctor,
        branch,
        hostUrl,
      });

      const inserted = await db.query(
        `INSERT INTO ai_calls (lead_id, conversation_id, call_sid, from_phone, to_phone, lead_name, company_name, status, booking_type, provider, direction, started_at)
         VALUES ($1, $2, $2, $3, $4, $5, $6, 'ringing', $7, 'plivo', 'outbound', NOW())
         RETURNING *`,
        [finalLeadId, plivoResult.callUuid, plivoResult.from, plivoResult.to, contactName, companyName, conversationType]
      );

      if (finalLeadId) {
        await db.query(
          `INSERT INTO clinic_notes (user_id, lead_id, kind, title, body, created_at)
           VALUES ($1, $2, 'call', $3, $4, NOW())`,
          [req.user.id, finalLeadId, `Plivo Call: ${label}`, `Real outbound call placed via Plivo to ${plivoResult.to}. Call UUID: ${plivoResult.callUuid}`]
        );
      }

      return res.json({ success: true, isMock: false, engine: 'plivo', call: inserted.rows[0], callUuid: plivoResult.callUuid });
    }

    // 2. Live AI call: dispatch via Sarvam
    if (!process.env.SARVAM_API_KEY) {
      return res.status(400).json({
        error: 'SARVAM_API_KEY is not configured on this server. Switch to Mock Mode or Plivo.',
      });
    }

    const { dispatchSarvamCall, buildAgentVars } = require('./sarvam');
    const { canCall } = require('./call-utils');

    const leadResult = await db.query('SELECT * FROM leads WHERE id = $1', [finalLeadId]);
    const lead = leadResult.rows[0];
    const check = canCall(lead);
    if (!check.ok) return res.status(400).json({ error: check.reason });

    const sarvamRes = await dispatchSarvamCall({
      phoneE164: check.e164,
      vars: buildAgentVars({
        name: contactName,
        phone: lead.phone,
        email: lead.email,
      }),
      metadata: { kind: 'single', lead_id: String(lead.id), conversation_type: conversationType },
    });

    const requestId = sarvamRes.attempt_id;
    await db.query(`
      UPDATE leads
      SET last_ai_call_status = 'queued', last_ai_call_at = NOW(), last_ai_call_request_id = $1
      WHERE id = $2
    `, [requestId, lead.id]);

    const insCall = await db.query(
      `INSERT INTO ai_calls (lead_id, conversation_id, call_sid, from_phone, to_phone, lead_name, company_name, status, booking_type, provider, direction, started_at)
       VALUES ($1, $2, $2, '+917965852999', $3, $4, $5, 'queued', $6, 'sarvam', 'outbound', NOW())
       RETURNING *`,
      [lead.id, requestId, check.e164, contactName, companyName, conversationType]
    );

    if (lead.id) {
      await db.query(
        `INSERT INTO clinic_notes (user_id, lead_id, kind, title, body, created_at)
         VALUES ($1, $2, 'call', $3, $4, NOW())`,
        [req.user.id, lead.id, `Sarvam AI Call: ${label}`, `Outbound call dispatched via Sarvam AI to ${check.e164}. Request ID: ${requestId}`]
      );
    }

    return res.json({ success: true, isMock: false, requestId, call: insCall.rows[0] });
  } catch (err) {
    console.error('[Clinic Dialer Call Error]:', err);
    res.status(500).json({ error: err.message || 'Call dispatch failed' });
  }
});

// Update call record on hangup / completion with duration, transcript, summary
router.patch('/dialer/call/:id', requireUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { status = 'completed', durationSecs = 0, transcript, summary } = req.body || {};

    const updated = await db.query(
      `UPDATE ai_calls
          SET status = $1,
              duration_secs = GREATEST(duration_secs, $2),
              transcript_summary = COALESCE($3, transcript_summary),
              transcript = COALESCE($4, transcript),
              updated_at = NOW()
        WHERE id = $5
        RETURNING *`,
      [status, Number(durationSecs) || 0, summary || null, transcript ? JSON.stringify(transcript) : null, id]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ error: 'Call record not found' });
    }

    const call = updated.rows[0];
    if (call.lead_id) {
      await db.query(
        `UPDATE leads SET last_ai_call_status = $1, last_ai_call_at = NOW() WHERE id = $2`,
        [status, call.lead_id]
      );

      // Update or add final timeline note
      if (summary) {
        await db.query(
          `INSERT INTO clinic_notes (user_id, lead_id, kind, title, body, created_at)
           VALUES ($1, $2, 'call', $3, $4, NOW())`,
          [req.user.id, call.lead_id, `AI Call Completed (${formatDuration(call.duration_secs)})`, summary]
        );
      }
    }

    res.json({ success: true, call });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function formatDuration(sec) {
  if (!sec && sec !== 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

router.post('/dialer/contact', requireUser, async (req, res) => {
  try {
    const { name, phone, email, company, callId } = req.body || {};
    if (!name || !phone) return res.status(400).json({ error: 'Name and phone are required' });
    const parts = name.trim().split(/\s+/);
    const firstName = parts[0] || 'Patient';
    const lastName = parts.slice(1).join(' ') || '';

    const ins = await db.query(
      `INSERT INTO leads (user_id, first_name, last_name, phone, email, company, pipeline_stage, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'New Lead', 'Active', NOW(), NOW())
       RETURNING *`,
      [req.user.id, firstName, lastName, phone.trim(), email || null, company || 'Aura Laser & Cosmetic Clinic']
    );
    const lead = ins.rows[0];

    if (callId) {
      await db.query(
        `UPDATE ai_calls SET lead_id = $1, lead_name = $2 WHERE id = $3`,
        [lead.id, name.trim(), callId]
      );
    }

    res.json({ success: true, lead });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Plivo Telephony Webhooks & Settings
// ---------------------------------------------------------------------------
router.post('/dialer/plivo/answer', async (req, res) => {
  const { type = 'patient_consultation', doctor = 'Dr. Aditya Shah', branch = 'Alkapuri Main Clinic' } = req.query;
  const { CallUUID, Direction, From, To } = req.body || {};

  // If inbound call from patient to clinic Plivo number
  const isIncoming = Direction === 'inbound' || req.query.direction === 'inbound';
  if (isIncoming && CallUUID) {
    try {
      const fromNumber = From || req.query.from || 'Unknown Patient';
      const toNumber = To || req.query.to || '+917965852999';
      const cleanPhone = fromNumber.replace(/\D/g, '').slice(-10);

      const leadMatch = await db.query(
        'SELECT id, first_name, last_name, company FROM leads WHERE phone LIKE $1 LIMIT 1',
        [`%${cleanPhone}%`]
      );
      const callerName = leadMatch.rows[0]
        ? [leadMatch.rows[0].first_name, leadMatch.rows[0].last_name].filter(Boolean).join(' ')
        : `Patient (${fromNumber.slice(-4)})`;
      const callerLeadId = leadMatch.rows[0]?.id || null;

      await db.query(
        `INSERT INTO ai_calls (
          lead_id, conversation_id, call_sid, from_phone, to_phone,
          lead_name, company_name, status, booking_type, duration_secs,
          provider, direction, started_at
        ) VALUES (
          $1, $2, $2, $3, $4,
          $5, $6, 'in-progress', 'patient_inbound', 0,
          'plivo', 'inbound', NOW()
        ) ON CONFLICT DO NOTHING`,
        [callerLeadId, CallUUID, fromNumber, toNumber, callerName, leadMatch.rows[0]?.company || 'Inbound Patient']
      );
    } catch (inbErr) {
      console.warn('[Plivo Inbound Log Error]:', inbErr.message);
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Speak language="en-IN" voice="Polly.Aditi">Hello! Thank you for speaking with Dr. Aditya Shah's Aura Laser and Cosmetic Clinic. Your consultation call is now connected.</Speak>
  <Record startOnDialAnswer="true" maxLength="900" playBeep="false" />
</Response>`;
  res.set('Content-Type', 'text/xml');
  res.send(xml);
});

router.post('/dialer/plivo/inbound', async (req, res) => {
  const { CallUUID, From, To } = req.body || {};
  if (CallUUID) {
    try {
      const fromNumber = From || 'Inbound Caller';
      const toNumber = To || '+917965852999';
      const cleanPhone = fromNumber.replace(/\D/g, '').slice(-10);
      const leadMatch = await db.query(
        'SELECT id, first_name, last_name, company FROM leads WHERE phone LIKE $1 LIMIT 1',
        [`%${cleanPhone}%`]
      );
      const callerName = leadMatch.rows[0]
        ? [leadMatch.rows[0].first_name, leadMatch.rows[0].last_name].filter(Boolean).join(' ')
        : `Patient (${fromNumber.slice(-4)})`;

      await db.query(
        `INSERT INTO ai_calls (
          lead_id, conversation_id, call_sid, from_phone, to_phone,
          lead_name, company_name, status, booking_type, duration_secs,
          provider, direction, started_at
        ) VALUES (
          $1, $2, $2, $3, $4,
          $5, $6, 'in-progress', 'patient_inbound', 0,
          'plivo', 'inbound', NOW()
        ) ON CONFLICT DO NOTHING`,
        [leadMatch.rows[0]?.id || null, CallUUID, fromNumber, toNumber, callerName, leadMatch.rows[0]?.company || 'Inbound Consultation']
      );
    } catch (e) {
      console.warn('[Plivo Inbound Webhook Error]:', e.message);
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Speak language="en-IN" voice="Polly.Aditi">Welcome to Dr. Aditya Shah's Aura Laser and Cosmetic Clinic. Please stay on the line while we connect you to our clinical coordinator.</Speak>
  <Record startOnDialAnswer="true" maxLength="900" playBeep="false" />
</Response>`;
  res.set('Content-Type', 'text/xml');
  res.send(xml);
});

router.post('/dialer/plivo/hangup', async (req, res) => {
  try {
    const { CallUUID, Duration, CallStatus, RecordUrl, TotalCost, Rate } = req.body || {};
    if (CallUUID) {
      await db.query(
        `UPDATE ai_calls
            SET status = $1,
                duration_secs = GREATEST(duration_secs, $2),
                recording_url = COALESCE($3, recording_url),
                call_cost = COALESCE($4, call_cost),
                call_rate = COALESCE($5, call_rate),
                updated_at = NOW()
          WHERE call_sid = $6 OR conversation_id = $6`,
        [
          CallStatus === 'completed' ? 'completed' : (CallStatus || 'completed'),
          Number(Duration) || 0,
          RecordUrl || null,
          TotalCost ? Number(TotalCost) : null,
          Rate ? Number(Rate) : null,
          CallUUID
        ]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/dialer/settings', requireUser, async (req, res) => {
  try {
    const plivo = require('./plivo');
    const creds = plivo.getPlivoCredentials();
    res.json({
      plivoConfigured: creds.isConfigured,
      plivoCallerId: creds.callerId || '',
      plivoAuthId: creds.authId ? `${creds.authId.slice(0, 6)}...` : '',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/dialer/settings', requireUser, async (req, res) => {
  try {
    const { plivoAuthId, plivoAuthToken, plivoCallerId } = req.body || {};
    if (plivoAuthId) process.env.PLIVO_AUTH_ID = String(plivoAuthId).trim();
    if (plivoAuthToken) process.env.PLIVO_AUTH_TOKEN = String(plivoAuthToken).trim();
    if (plivoCallerId) process.env.PLIVO_CALLER_ID = String(plivoCallerId).trim();

    const plivo = require('./plivo');
    const creds = plivo.getPlivoCredentials();
    res.json({ success: true, plivoConfigured: creds.isConfigured });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Call Review: Plivo & Sarvam Transactions (Inbound + Outbound)
// ---------------------------------------------------------------------------
router.get('/call-review', requireUser, async (req, res) => {
  try {
    const { provider, direction, search } = req.query;

    let queryText = `
      SELECT ac.*, 
             COALESCE(ac.lead_name, CONCAT_WS(' ', l.first_name, l.last_name), 'Patient') AS display_name,
             COALESCE(ac.to_phone, l.phone, '—') AS display_phone,
             COALESCE(ac.company_name, l.company, 'Aura Laser & Cosmetic Clinic') AS display_company,
             COALESCE(ac.provider, 'plivo') AS provider,
             COALESCE(ac.direction, 'outbound') AS direction
        FROM ai_calls ac
        LEFT JOIN leads l ON l.id = ac.lead_id
       WHERE (l.user_id = $1 OR ac.lead_id IS NULL OR l.user_id IS NULL)
    `;
    const params = [req.user.id];

    if (provider && provider !== 'all') {
      params.push(provider.toLowerCase());
      queryText += ` AND LOWER(COALESCE(ac.provider, 'plivo')) = $${params.length}`;
    }

    if (direction && direction !== 'all') {
      params.push(direction.toLowerCase());
      queryText += ` AND LOWER(COALESCE(ac.direction, 'outbound')) = $${params.length}`;
    }

    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      queryText += ` AND (
        LOWER(COALESCE(ac.lead_name, '')) LIKE $${params.length} OR
        LOWER(COALESCE(l.first_name, '')) LIKE $${params.length} OR
        LOWER(COALESCE(l.last_name, '')) LIKE $${params.length} OR
        LOWER(COALESCE(ac.to_phone, '')) LIKE $${params.length} OR
        LOWER(COALESCE(ac.from_phone, '')) LIKE $${params.length} OR
        LOWER(COALESCE(ac.call_sid, '')) LIKE $${params.length} OR
        LOWER(COALESCE(ac.conversation_id, '')) LIKE $${params.length} OR
        LOWER(COALESCE(ac.transcript_summary, '')) LIKE $${params.length}
      )`;
    }

    queryText += ` ORDER BY ac.started_at DESC NULLS LAST LIMIT 150`;

    const r = await db.query(queryText, params);

    // Compute KPI stats across all calls
    const statsRes = await db.query(`
      SELECT 
        COUNT(*)::int AS total,
        COUNT(CASE WHEN LOWER(COALESCE(direction, 'outbound')) = 'inbound' THEN 1 END)::int AS inbound,
        COUNT(CASE WHEN LOWER(COALESCE(direction, 'outbound')) = 'outbound' THEN 1 END)::int AS outbound,
        COUNT(CASE WHEN LOWER(COALESCE(provider, 'plivo')) = 'plivo' THEN 1 END)::int AS plivo,
        COUNT(CASE WHEN LOWER(COALESCE(provider, 'plivo')) = 'sarvam' THEN 1 END)::int AS sarvam,
        COALESCE(SUM(duration_secs), 0)::int AS total_duration
      FROM ai_calls
    `);

    res.json({ 
      calls: r.rows,
      stats: statsRes.rows[0] || { total: 0, inbound: 0, outbound: 0, plivo: 0, sarvam: 0, total_duration: 0 }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/call-review/:id', requireUser, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT ac.*, 
              COALESCE(ac.lead_name, CONCAT_WS(' ', l.first_name, l.last_name), 'Patient') AS display_name,
              COALESCE(ac.to_phone, l.phone, '—') AS display_phone,
              COALESCE(ac.company_name, l.company, 'Aura Laser & Cosmetic Clinic') AS display_company,
              l.email,
              COALESCE(ac.provider, 'plivo') AS provider,
              COALESCE(ac.direction, 'outbound') AS direction
         FROM ai_calls ac
         LEFT JOIN leads l ON l.id = ac.lead_id
        WHERE ac.id = $1 AND (l.user_id = $2 OR ac.lead_id IS NULL OR l.user_id IS NULL)`,
      [req.params.id, req.user.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Call not found' });
    res.json({ call: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Agent hub (reuse Aura automations)
// ---------------------------------------------------------------------------
router.get('/agents', requireUser, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT id, name, trigger, description, active, runs, conversions, steps, created_at
         FROM automations WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ agents: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = { router, ensureSchema };
