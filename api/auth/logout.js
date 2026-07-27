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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cookies = parseCookies(req);
  const email = cookies.aura_user_email;

  const connectionString = process.env.DATABASE_URL;
  if (connectionString && email) {
    const client = new Client({
      connectionString,
      ssl: { rejectUnauthorized: false }
    });
    try {
      await client.connect();
      await client.query('UPDATE users SET is_active = false WHERE email = $1', [email]);
      await client.end();
    } catch (err) {
      console.error('Logout DB error:', err.message);
    }
  }

  res.setHeader('Set-Cookie', 'aura_user_email=; Path=/; SameSite=Lax; Max-Age=0');
  return res.status(200).json({ success: true });
};
