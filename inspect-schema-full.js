const db = require('./server/db');

(async () => {
  const tables = await db.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name
  `);
  
  console.log('Total tables:', tables.rows.length);
  console.log('\n=== ALL TABLES WITH COLUMNS ===\n');
  
  for (const t of tables.rows) {
    const cols = await db.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = $1
      ORDER BY ordinal_position
    `, [t.table_name]);
    
    // Get row count
    const countRes = await db.query(`SELECT COUNT(*) FROM ${t.table_name}`);
    const count = countRes.rows[0].count;
    
    console.log(`\n=== ${t.table_name} (${cols.rows.length} cols, ${count} rows) ===`);
    for (const c of cols.rows) {
      const def = c.column_default ? ` DEFAULT ${c.column_default}` : '';
      console.log(`  ${c.column_name}: ${c.data_type}${c.is_nullable === 'NO' ? ' NOT NULL' : ''}${def}`);
    }
  }
  
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });