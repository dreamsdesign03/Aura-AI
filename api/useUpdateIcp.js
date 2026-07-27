const { Client } = require('pg');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return res.status(500).json({ error: 'DB not configured' });

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();

    // Auto-migrate: ensure filters column exists
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'icps' AND column_name = 'filters'
        ) THEN
          ALTER TABLE icps ADD COLUMN filters JSONB DEFAULT '{}';
        END IF;
      END $$;
    `);

    const { id, data } = req.body || {};
    if (!id) {
      await client.end();
      return res.status(400).json({ error: 'ICP id is required' });
    }

    const { name, markets, industries, roles, companySize, filters, active } = data || {};

    const result = await client.query(
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

    await client.end();

    if (result.rows.length === 0) return res.status(404).json({ error: 'ICP not found' });
    return res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error('useUpdateIcp error:', err.message);
    try { await client.end(); } catch {}
    return res.status(500).json({ error: err.message });
  }
};
