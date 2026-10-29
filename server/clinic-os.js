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
    if (!email) return res.status(401).json({ error: 'Unauthenticated' });

    const u = await db.query('SELECT id, first_name, last_name, email FROM users WHERE email = $1', [email]);
    if (u.rows.length === 0) return res.status(401).json({ error: 'Unauthenticated' });
    req.user = u.rows[0];
    next();
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

    ALTER TABLE clinic_appointments ADD COLUMN IF NOT EXISTS amount NUMERIC DEFAULT 0;
    ALTER TABLE clinic_notes ADD COLUMN IF NOT EXISTS meta JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE clinic_packages ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0;
    ALTER TABLE clinic_reviews ADD COLUMN IF NOT EXISTS reply TEXT;
  `);
  return schemaReady;
}

router.use(async (_req, res, next) => {
  try { await ensureSchema(); next(); }
  catch (err) { console.error('[clinic-os] schema error:', err.message); res.status(500).json({ error: 'Clinic database not ready' }); }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const STAGES = ['Lead In', 'Qualified', 'Contacted', 'Discovery', 'Proposal', 'Won'];

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

async function tryQuery(sql, params) {
  try { return await db.query(sql, params); }
  catch (err) { console.warn('[clinic-os] optional query skipped:', err.message); return { rows: [] }; }
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
      db.query('SELECT COUNT(*)::int AS n FROM leads WHERE user_id = $1', [userId]),
      db.query(
        `SELECT COALESCE(pipeline_stage, 'Lead In') AS stage, COUNT(*)::int AS n
           FROM leads WHERE user_id = $1 GROUP BY 1`,
        [userId]
      ),
      db.query(
        `SELECT * FROM clinic_appointments
          WHERE user_id = $1 AND starts_at >= $2 AND starts_at < $3
          ORDER BY starts_at ASC`,
        [userId, start, end]
      ),
      db.query(
        `SELECT * FROM clinic_appointments
          WHERE user_id = $1 AND starts_at >= $2 AND starts_at < $3
            AND status IN ('booked','confirmed')
          ORDER BY starts_at ASC LIMIT 12`,
        [userId, end, horizon]
      ),
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
    const funnel = STAGES.map(stage => ({ stage, count: byStage[stage] || 0 }));

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
// Appointments
// ---------------------------------------------------------------------------
router.get('/appointments', requireUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const from = safeDate(req.query.from) || (() => { const d = new Date(); d.setDate(d.getDate() - 7); return d; })();
    const to = safeDate(req.query.to) || (() => { const d = new Date(); d.setDate(d.getDate() + 21); return d; })();

    const r = await db.query(
      `SELECT a.*, l.first_name, l.last_name, l.email AS lead_email
         FROM clinic_appointments a
         LEFT JOIN leads l ON l.id = a.lead_id
        WHERE a.user_id = $1 AND a.starts_at >= $2 AND a.starts_at < $3
        ORDER BY a.starts_at ASC`,
      [userId, from, to]
    );
    res.json({ appointments: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
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
    res.json({ appointment: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/appointments/:id', requireUser, async (req, res) => {
  try {
    const uid = req.user.id;
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
    vals.push(req.params.id, uid);
    const r = await db.query(
      `UPDATE clinic_appointments SET ${sets.join(', ')}, updated_at = NOW()
        WHERE id = $${vals.length - 1} AND user_id = $${vals.length} RETURNING *`,
      vals
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Appointment not found' });
    res.json({ appointment: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/appointments/:id', requireUser, async (req, res) => {
  try {
    await db.query('DELETE FROM clinic_appointments WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------------------------------------------------------------------------
// Patients (existing Aura leads + clinic records)
// ---------------------------------------------------------------------------
router.get('/patients', requireUser, async (req, res) => {
  try {
    const uid = req.user.id;
    const search = req.query.search ? `%${req.query.search}%` : null;

    const r = await db.query(
      `SELECT l.id, l.first_name, l.last_name, l.email, l.phone, l.company, l.status,
              l.pipeline_stage, l.deal_value, l.created_at,
              (SELECT COUNT(*)::int FROM clinic_appointments a WHERE a.lead_id = l.id AND a.user_id = $1) AS appointments,
              (SELECT MAX(a.starts_at) FROM clinic_appointments a WHERE a.lead_id = l.id AND a.user_id = $1) AS last_visit,
              (SELECT COUNT(*)::int FROM clinic_packages p WHERE p.lead_id = l.id AND p.user_id = $1) AS packages,
              (SELECT COALESCE(SUM(p.amount),0)::numeric FROM clinic_packages p WHERE p.lead_id = l.id AND p.user_id = $1) AS package_value
         FROM leads l
        WHERE l.user_id = $1
          ${search ? 'AND (l.first_name ILIKE $2 OR l.last_name ILIKE $2 OR l.phone ILIKE $2 OR l.email ILIKE $2)' : ''}
        ORDER BY COALESCE(l.updated_at, l.created_at) DESC
        LIMIT 200`,
      search ? [uid, search] : [uid]
    );
    res.json({ patients: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/patients/:id', requireUser, async (req, res) => {
  try {
    const uid = req.user.id;
    const leadId = req.params.id;

    const lead = await db.query('SELECT * FROM leads WHERE id = $1 AND user_id = $2', [leadId, uid]);
    if (lead.rows.length === 0) return res.status(404).json({ error: 'Patient not found' });

    const [notes, appointments, packages, calls] = await Promise.all([
      db.query('SELECT * FROM clinic_notes WHERE user_id = $1 AND lead_id = $2 ORDER BY created_at DESC LIMIT 50', [uid, leadId]),
      db.query('SELECT * FROM clinic_appointments WHERE user_id = $1 AND lead_id = $2 ORDER BY starts_at DESC LIMIT 30', [uid, leadId]),
      db.query('SELECT * FROM clinic_packages WHERE user_id = $1 AND lead_id = $2 ORDER BY created_at DESC', [uid, leadId]),
      tryQuery(
        `SELECT id, status, started_at, duration_secs, transcript_summary, call_sid
           FROM ai_calls WHERE lead_id = $1 ORDER BY started_at DESC LIMIT 20`,
        [leadId]
      ),
    ]);

    res.json({
      patient: lead.rows[0],
      notes: notes.rows,
      appointments: appointments.rows,
      packages: packages.rows,
      calls: calls.rows,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
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

module.exports = { router, ensureSchema };
