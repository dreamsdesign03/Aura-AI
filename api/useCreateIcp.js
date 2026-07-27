const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  }

  try {
    // Auto-migrate: add user_id column if missing
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'icps' AND column_name = 'user_id'
        ) THEN
          ALTER TABLE icps ADD COLUMN user_id INT REFERENCES users(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);
  } catch (migrateErr) {
    console.error('useCreateIcp migrate:', migrateErr.message);
  }

  const data = body?.data || body || {};
  const { name, markets = [], industries = [], roles = [], companySize = '', filters = {}, active = true } = data;

  if (!name) return res.status(400).json({ error: 'ICP name is required' });

  let email = body?.email;
  if (!email && req.headers.cookie) {
    const m = req.headers.cookie.match(/aura_user_email=([^;]+)/);
    if (m) email = decodeURIComponent(m[1]);
  }

  try {
    let userId = null;
    if (email) {
      const ur = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (ur.rows.length > 0) userId = ur.rows[0].id;
    }

    const result = await pool.query(
      `INSERT INTO icps (user_id, name, company_size, roles, industries, markets, filters, active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING *`,
      [userId, name, companySize, roles, industries, markets, JSON.stringify(filters), active]
    );

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('useCreateIcp:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
