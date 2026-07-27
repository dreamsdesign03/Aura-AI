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

  const { id, data } = body || {};
  if (!id) return res.status(400).json({ error: 'ICP id is required' });

  const { name, markets, industries, roles, companySize, filters, active } = data || {};

  try {
    const result = await pool.query(
      `UPDATE icps SET
        name = COALESCE($1, name),
        company_size = COALESCE($2, company_size),
        roles = COALESCE($3, roles),
        industries = COALESCE($4, industries),
        markets = COALESCE($5, markets),
        filters = COALESCE($6, filters),
        active = COALESCE($7, active)
       WHERE id = $8 RETURNING *`,
      [name, companySize, roles, industries, markets, filters ? JSON.stringify(filters) : null, active, id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'ICP not found' });
    return res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error('useUpdateIcp:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
