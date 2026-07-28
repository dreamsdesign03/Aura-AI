const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (rc) rc.split(';').forEach(c => { const p = c.split('='); list[p.shift().trim()] = decodeURIComponent(p.join('=')); });
  return list;
}

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fetch_configs (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      sources TEXT[] DEFAULT '{"google_maps"}',
      icp_id INT,
      daily_count INT DEFAULT 10,
      enabled BOOLEAN DEFAULT FALSE,
      last_run_at TIMESTAMPTZ,
      next_run_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

function getUserId(req) {
  const cookies = parseCookies(req);
  return req.query?.email || req.body?.email || cookies.aura_user_email || null;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  await ensureTable();
  const email = getUserId(req);

  let userId = null;
  if (email) {
    const r = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (r.rows.length > 0) userId = r.rows[0].id;
  }

  if (req.method === 'GET') {
    try {
      if (!userId) return res.status(200).json(null);
      const r = await pool.query('SELECT * FROM fetch_configs WHERE user_id = $1 ORDER BY id DESC LIMIT 1', [userId]);
      if (r.rows.length === 0) return res.status(200).json(null);
      const c = r.rows[0];
      return res.status(200).json({
        sources: c.sources || ['google_maps'],
        icpId: c.icp_id,
        dailyCount: c.daily_count,
        enabled: c.enabled,
        lastRunAt: c.last_run_at,
        nextRunAt: c.next_run_at,
      });
    } catch (err) {
      console.error('fetch-config GET:', err.message);
      return res.status(200).json(null);
    }
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); } }
    const { icpId, sources, dailyCount, enabled } = body || {};

    try {
      const existing = await pool.query('SELECT id FROM fetch_configs WHERE user_id = $1 ORDER BY id DESC LIMIT 1', [userId]);

      if (existing.rows.length > 0) {
        const r = await pool.query(
          `UPDATE fetch_configs SET sources=$1, icp_id=$2, daily_count=$3, enabled=$4 WHERE id=$5 RETURNING *`,
          [sources || ['google_maps'], icpId, dailyCount || 10, enabled || false, existing.rows[0].id]
        );
        const c = r.rows[0];
        return res.status(200).json({ sources: c.sources, icpId: c.icp_id, dailyCount: c.daily_count, enabled: c.enabled, lastRunAt: c.last_run_at, nextRunAt: c.next_run_at });
      } else {
        const r = await pool.query(
          `INSERT INTO fetch_configs (user_id, sources, icp_id, daily_count, enabled) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [userId, sources || ['google_maps'], icpId, dailyCount || 10, enabled || false]
        );
        const c = r.rows[0];
        return res.status(201).json({ sources: c.sources, icpId: c.icp_id, dailyCount: c.daily_count, enabled: c.enabled });
      }
    } catch (err) {
      console.error('fetch-config POST:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
