const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

module.exports = async (req, res) => {
  try {
    // Add user_id column if missing
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'icps' AND column_name = 'user_id'
        ) THEN
          ALTER TABLE icps ADD COLUMN user_id INT REFERENCES users(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    const cols = await pool.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'icps' ORDER BY ordinal_position"
    );

    return res.status(200).json({ columns: cols.rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
