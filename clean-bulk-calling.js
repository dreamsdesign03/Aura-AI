const db = require('./server/db');

async function cleanBulkCalling() {
  console.log('=== Cleaning Bulk Calling Data ===\n');
  
  try {
    // Delete in order of foreign key dependencies
    const tables = [
      'bulk_attempts',
      'bulk_contacts', 
      'bulk_campaigns',
      'bulk_calling_settings',
      'agent_activity' // if it has bulk calling related entries
    ];
    
    for (const table of tables) {
      try {
        const result = await db.query(`DELETE FROM ${table}`);
        console.log(`✅ Deleted ${result.rowCount} rows from ${table}`);
      } catch (e) {
        console.log(`⚠️  ${table}: ${e.message}`);
      }
    }
    
    // Also clean related ai_calls that were from bulk campaigns
    try {
      const result = await db.query(`DELETE FROM ai_calls WHERE booking_type = 'bulk_campaign'`);
      console.log(`✅ Deleted ${result.rowCount} rows from ai_calls (bulk_campaign)`);
    } catch (e) {
        console.log(`⚠️  ai_calls: ${e.message}`);
    }
    
    // Clean clinic_audit entries related to bulk calling
    try {
      const result = await db.query(`DELETE FROM clinic_audit WHERE detail LIKE '%bulk%' OR detail LIKE '%campaign%'`);
      console.log(`✅ Deleted ${result.rowCount} rows from clinic_audit (bulk)`);
    } catch (e) {
        console.log(`⚠️  clinic_audit: ${e.message}`);
    }
    
    // Verify
    console.log('\n=== Verification ===');
    const verifyTables = ['bulk_campaigns', 'bulk_contacts', 'bulk_attempts', 'bulk_calling_settings'];
    for (const table of verifyTables) {
      try {
        const r = await db.query(`SELECT COUNT(*) FROM ${table}`);
        console.log(`${table}: ${r.rows[0].count} rows`);
      } catch (e) {
        console.log(`${table}: N/A (${e.message})`);
      }
    }
    
    console.log('\n=== Bulk Calling Data Cleaned ===');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit(0);
  }
}

cleanBulkCalling();