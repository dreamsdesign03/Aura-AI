const { Client } = require('pg');

module.exports = async (req, res) => {
  try {
    const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_Yx39FAMrXPeG@ep-muddy-cell-azvgujn9-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
    const client = new Client({
      connectionString,
      ssl: { rejectUnauthorized: false }
    });
    await client.connect();
    const result = await client.query('SELECT NOW() as current_time, current_database() as db_name');
    await client.end();

    res.json({
      status: 'connected',
      timestamp: result.rows[0].current_time,
      database: result.rows[0].db_name,
      message: 'Successfully connected to Neon PostgreSQL Database'
    });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
};
