const { Client } = require('pg');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (typeof req.body === 'string') {
    try { req.body = JSON.parse(req.body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return res.status(500).json({ error: 'No DATABASE_URL' });

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();

    // Ensure filters column exists
    const colCheck = await client.query(
      "SELECT 1 FROM information_schema.columns WHERE table_name = 'icps' AND column_name = 'filters'"
    );
    if (colCheck.rows.length === 0) {
      await client.query("ALTER TABLE icps ADD COLUMN filters JSONB DEFAULT '{}'::jsonb");
    }

    const data = req.body?.data || req.body || {};
    const { name, markets = [], industries = [], roles = [], companySize = '', filters = {}, active = true } = data;

    if (!name) { await client.end(); return res.status(400).json({ error: 'ICP name is required' }); }

    let email = req.body?.email;
    if (!email && req.headers.cookie) {
      const m = req.headers.cookie.match(/aura_user_email=([^;]+)/);
      if (m) email = decodeURIComponent(m[1]);
    }

    let userId = null;
    if (email) {
      const r = await client.query('SELECT id FROM users WHERE email = $1', [email]);
      if (r.rows.length > 0) userId = r.rows[0].id;
    }

    const result = await client.query(
      `INSERT INTO icps (user_id, name, company_size, roles, industries, markets, filters, active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING *`,
      [userId, name, companySize, roles, industries, markets, JSON.stringify(filters), active]
    );

    await client.end();
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('useCreateIcp error:', err.message, err.stack);
    try { await client.end(); } catch {}
    return res.status(500).json({ error: err.message });
  }
};
