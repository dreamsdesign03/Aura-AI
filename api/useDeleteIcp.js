const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  }

  const { id } = body || {};
  if (!id) return res.status(400).json({ error: 'ICP id is required' });

  try {
    await pool.query('DELETE FROM icps WHERE id = $1', [id]);
    return res.status(200).json({ success: true, id });
  } catch (err) {
    console.error('useDeleteIcp:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
