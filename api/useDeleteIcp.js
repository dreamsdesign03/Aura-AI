const { Client } = require('pg');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return res.status(500).json({ error: 'DB not configured' });

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();

    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'ICP id is required' });

    await client.query('DELETE FROM icps WHERE id = $1', [id]);
    await client.end();

    return res.status(200).json({ success: true, id });
  } catch (err) {
    console.error('useDeleteIcp error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
