const db = require('./server/db');

(async () => {
  const tables = await db.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name
  `);
  for (const t of tables.rows) {
    const cols = await db.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = $1
      ORDER BY ordinal_position
    `, [t.table_name]);
    console.log('\n=== ' + t.table_name + ' (' + cols.rows.length + ' cols) ===');
    for (const c of cols.rows) {
      console.log('  ' + c.column_name + ': ' + c.data_type + ' ' + (c.is_nullable === 'NO' ? 'NOT NULL' : ''));
    }
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });