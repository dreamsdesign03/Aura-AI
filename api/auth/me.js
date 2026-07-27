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

  if (!email) {
    return res.status(401).json({ error: 'Unauthenticated. Please log in first.' });
  }

  const namePart = email.split('@')[0];
  const formattedName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    return res.status(401).json({ error: 'not_registered' });
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    const userRes = await client.query('SELECT * FROM users WHERE email = $1', [email]);

    if (userRes.rows.length > 0) {
      const user = userRes.rows[0];
      await client.end();
      return res.status(200).json({
        id: user.id,
        firstName: user.first_name || formattedName,
        lastName: user.last_name || '',
        email: user.email,
        isActive: user.is_active ?? false,
        onboardingCompleted: user.onboarding_completed ?? true
      });
    }

    await client.end();
    return res.status(401).json({ error: 'not_registered' });
  } catch (err) {
    console.error('Neon DB authentication query error:', err);
    return res.status(401).json({ error: 'not_registered' });
  }
};
