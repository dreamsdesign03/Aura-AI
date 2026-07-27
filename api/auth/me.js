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

      let userRes = await client.query('SELECT * FROM users WHERE email = $1', [email]);
      let user;

      if (userRes.rows.length > 0) {
        user = userRes.rows[0];
      } else {
        const namePart = email.split('@')[0];
        const inserted = await client.query(
          `INSERT INTO users (first_name, last_name, email, onboarding_completed, created_at)
           VALUES ($1, '', $2, true, NOW()) RETURNING *`,
          [namePart, email]
        );
        user = inserted.rows[0];
      }
      await client.end();

      return res.json({
        id: user.id,
        firstName: user.first_name || 'User',
        lastName: user.last_name || '',
        email: user.email,
        onboardingCompleted: user.onboarding_completed ?? true
      });
    }

    return res.status(401).json({ error: 'Unauthenticated' });
  } catch (err) {
    console.error('api/auth/me error:', err);
    return res.status(500).json({ error: err.message });
  }
};
