const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  let email = req.query?.email;
  if (!email && req.headers.cookie) {
    const m = req.headers.cookie.match(/aura_user_email=([^;]+)/);
    if (m) email = decodeURIComponent(m[1]);
  }

  try {
    let query = 'SELECT * FROM icps';
    let params = [];

    if (email) {
      const ur = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (ur.rows.length > 0) {
        query += ' WHERE user_id = $1';
        params = [ur.rows[0].id];
      }
    }

    query += ' ORDER BY id DESC';
    const result = await pool.query(query, params);
    return res.status(200).json(result.rows);
  } catch (err) {
    console.error('useListIcps:', err.message);
    return res.status(200).json([]);
  }
};
