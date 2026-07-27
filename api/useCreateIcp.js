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

  // Explicit body parsing
  if (typeof req.body === 'string') {
    try { req.body = JSON.parse(req.body); } catch (e) {
      console.error('useCreateIcp: body parse failed', e.message);
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
  }

  const cookies = parseCookies(req);
  const email = req.body?.email || cookies.aura_user_email;
  const connectionString = process.env.DATABASE_URL;

  console.log('useCreateIcp: email=', email, 'body=', JSON.stringify(req.body));

  if (!connectionString) {
    console.error('useCreateIcp: DATABASE_URL is missing');
    return res.status(500).json({ error: 'DB not configured - no DATABASE_URL' });
  }

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    console.log('useCreateIcp: connected to DB');

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

    const data = req.body?.data || req.body;
    const { name, markets = [], industries = [], roles = [], companySize = '', filters = {}, active = true } = data || {};

    console.log('useCreateIcp: name=', name, 'data=', JSON.stringify(data));

    if (!name) {
      await client.end();
      return res.status(400).json({ error: 'ICP name is required' });
    }

    let userId = null;
    if (email) {
      const userRes = await client.query('SELECT id FROM users WHERE email = $1', [email]);
      console.log('useCreateIcp: user found=', userRes.rows.length > 0);
      if (userRes.rows.length > 0) userId = userRes.rows[0].id;
    }

    const result = await client.query(
      `INSERT INTO icps (user_id, name, company_size, roles, industries, markets, filters, active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING *`,
      [userId, name, companySize, roles, industries, markets, JSON.stringify(filters), active]
    );

    console.log('useCreateIcp: created id=', result.rows[0].id);
    await client.end();
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('useCreateIcp FATAL:', err.message, err.stack);
    try { await client.end(); } catch {}
    return res.status(500).json({ error: err.message });
  }
};
