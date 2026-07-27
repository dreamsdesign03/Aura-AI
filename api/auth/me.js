const { Client } = require('pg');

const NEON_DB_URL = 'postgresql://neondb_owner:npg_Yx39FAMrXPeG@ep-muddy-cell-azvgujn9-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

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
  const connectionString = process.env.DATABASE_URL || NEON_DB_URL;
  
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    let userRes = await client.query('SELECT * FROM users WHERE email = $1', [email]);
    let user;

    if (userRes.rows.length > 0) {
      user = userRes.rows[0];
    } else {
      const inserted = await client.query(
        `INSERT INTO users (first_name, last_name, email, password_hash, onboarding_completed, created_at)
         VALUES ($1, '', $2, 'oauth_authenticated', true, NOW()) RETURNING *`,
        [formattedName, email]
      );
      user = inserted.rows[0];
    }
    await client.end();

    return res.status(200).json({
      id: user.id,
      firstName: user.first_name || formattedName,
      lastName: user.last_name || '',
      email: user.email,
      onboardingCompleted: user.onboarding_completed ?? true
    });
  } catch (err) {
    console.error('Neon DB authentication query error:', err);
    return res.status(200).json({
      id: 1,
      firstName: formattedName,
      lastName: '',
      email: email,
      onboardingCompleted: true
    });
  }
};
