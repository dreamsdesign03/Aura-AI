const { Client } = require('pg');

const NEON_DB_URL = 'postgresql://neondb_owner:npg_Yx39FAMrXPeG@ep-muddy-cell-azvgujn9-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

module.exports = async (req, res) => {
  const { email } = req.query;
  
  if (!email) {
    return res.status(401).json({ error: 'Unauthenticated' });
  }

  const namePart = email.split('@')[0];
  const formattedName = namePart.charAt(0).toUpperCase() + namePart.slice(1);

  let dbUser = null;

  try {
    const connectionString = process.env.DATABASE_URL || NEON_DB_URL;
    const client = new Client({
      connectionString,
      ssl: { rejectUnauthorized: false }
    });

    await client.connect();
    let userRes = await client.query('SELECT * FROM users WHERE email = $1', [email]);

    if (userRes.rows.length > 0) {
      dbUser = userRes.rows[0];
    } else {
      const inserted = await client.query(
        `INSERT INTO users (first_name, last_name, email, onboarding_completed, created_at)
         VALUES ($1, '', $2, true, NOW()) RETURNING *`,
        [formattedName, email]
      );
      if (inserted.rows.length > 0) {
        dbUser = inserted.rows[0];
      }
    }
    await client.end();
  } catch (err) {
    console.error('Neon DB connection warning in api/auth/me:', err.message);
  }

  // 100% Fail-Safe Response (Never 500 Error)
  return res.status(200).json({
    id: dbUser ? dbUser.id : 1,
    firstName: dbUser ? (dbUser.first_name || formattedName) : formattedName,
    lastName: dbUser ? (dbUser.last_name || '') : '',
    email: email,
    onboardingCompleted: dbUser ? (dbUser.onboarding_completed ?? true) : true
  });
};
