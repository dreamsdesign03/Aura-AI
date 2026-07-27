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
  const cookies = parseCookies(req);
  const email = req.query.email || cookies.aura_user_email;
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) return res.status(200).json([]);

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();

    let query = 'SELECT * FROM icps';
    let params = [];

    if (email) {
      const userRes = await client.query('SELECT id FROM users WHERE email = $1', [email]);
      if (userRes.rows.length > 0) {
        query += ' WHERE user_id = $1';
        params = [userRes.rows[0].id];
      }
    }

    query += ' ORDER BY id DESC';
    const result = await client.query(query, params);
    await client.end();
    return res.status(200).json(result.rows);
  } catch (err) {
    console.error('useListIcps error:', err.message);
    try { await client.end(); } catch {}
    return res.status(200).json([]);
  }
};
