const { Client } = require('pg');

const NEON_DB_URL = 'postgresql://neondb_owner:npg_Yx39FAMrXPeG@ep-muddy-cell-azvgujn9-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

module.exports = async (req, res) => {
  try {
    const { email } = req.query;
    
    if (email) {
      const connectionString = process.env.DATABASE_URL || NEON_DB_URL;
      const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false }
      });
      await client.connect();
      const userRes = await client.query('SELECT * FROM users WHERE email = $1', [email]);
      await client.end();

      if (userRes.rows.length > 0) {
        const u = userRes.rows[0];
        return res.json({
          id: u.id,
          firstName: u.first_name || 'User',
          lastName: u.last_name || '',
          email: u.email,
          onboardingCompleted: u.onboarding_completed ?? true
        });
      }

      // If user signed in via OAuth but not yet in DB, return profile fallback
      return res.json({
        id: 1,
        firstName: email.split('@')[0],
        lastName: '',
        email: email,
        onboardingCompleted: true
      });
    }

    return res.status(401).json({ error: 'Unauthenticated' });
  } catch (err) {
    return res.status(401).json({ error: 'Unauthenticated' });
  }
};
