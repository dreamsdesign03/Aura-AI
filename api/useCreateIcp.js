const { Client } = require('pg');

function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      list[parts.shift().trim()] = decodeURIComponent(parts.join('='));
    });
  }
  return list;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const cookies = parseCookies(req);
  const email = req.body?.email || cookies.aura_user_email;
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) return res.status(500).json({ error: 'DB not configured' });

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();

    // Auto-migrate: ensure filters column exists
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'icps' AND column_name = 'filters'
        ) THEN
          ALTER TABLE icps ADD COLUMN filters JSONB DEFAULT '{}';
        END IF;
      END $$;
    `);

    const { name, markets = [], industries = [], roles = [], companySize = '', filters = {}, active = true } = req.body?.data || {};

    if (!name) {
      await client.end();
      return res.status(400).json({ error: 'ICP name is required' });
    }

    let userId = null;
    if (email) {
      const userRes = await client.query('SELECT id FROM users WHERE email = $1', [email]);
      if (userRes.rows.length > 0) userId = userRes.rows[0].id;
    }

    const result = await client.query(
      `INSERT INTO icps (user_id, name, company_size, roles, industries, markets, filters, active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING *`,
      [userId, name, companySize, roles, industries, markets, JSON.stringify(filters), active]
    );

    await client.end();
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('useCreateIcp error:', err.message);
    try { await client.end(); } catch {}
    return res.status(500).json({ error: err.message });
  }
};
