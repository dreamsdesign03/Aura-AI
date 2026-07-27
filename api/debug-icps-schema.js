const { Client } = require('pg');

module.exports = async (req, res) => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return res.status(500).json({ error: 'No DATABASE_URL' });

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();

    // Check what columns icps actually has
    const cols = await client.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'icps' ORDER BY ordinal_position"
    );

    await client.end();
    return res.status(200).json({ columns: cols.rows });
  } catch (err) {
    try { await client.end(); } catch {}
    return res.status(500).json({ error: err.message });
  }
};
