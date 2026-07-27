const { Client } = require('pg');

module.exports = async (req, res) => {
  try {
    const { email } = req.query;
    const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_Yx39FAMrXPeG@ep-muddy-cell-azvgujn9-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
    
    if (email) {
      const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false }
      });
      await client.connect();
      const userRes = await client.query('SELECT * FROM users WHERE email = $1', [email]);
      await client.end();

      if (userRes.rows.length > 0) {
        return res.json(userRes.rows[0]);
      }
    }

    res.json({
      id: 1,
      firstName: 'Aura',
      lastName: 'Admin',
      email: 'admin@aura-ai.com',
      onboardingCompleted: true
    });
  } catch (err) {
    res.json({
      id: 1,
      firstName: 'Aura',
      lastName: 'Admin',
      email: 'admin@aura-ai.com',
      onboardingCompleted: true
    });
  }
};
