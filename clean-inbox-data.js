const db = require('./server/db');

async function cleanInboxData() {
  console.log('=== Cleaning Inbox Data ===\n');
  
  try {
    // Tables related to inbox
    const tables = [
      'whatsapp_messages',
      'whatsapp_conversations',
      'outreach_emails',
      'email_replies',
      'clinic_notes',
      'touchpoints',
      'debug_logs'
    ];
    
    for (const table of tables) {
      try {
        const result = await db.query(`DELETE FROM ${table}`);
        console.log(`✅ Deleted ${result.rowCount} rows from ${table}`);
      } catch (e) {
        console.log(`⚠️  ${table}: ${e.message}`);
      }
    }
    
    // Also clean email drafts
    try {
      const result = await db.query(`DELETE FROM outreach_emails WHERE status = 'draft'`);
      console.log(`✅ Deleted ${result.rowCount} draft emails from outreach_emails`);
    } catch (e) {
      console.log(`⚠️  outreach_emails drafts: ${e.message}`);
    }
    
    // Verify
    console.log('\n=== Verification ===');
    const verifyTables = [
      'whatsapp_messages',
      'whatsapp_conversations',
      'outreach_emails',
      'email_replies',
      'clinic_notes',
      'touchpoints',
      'debug_logs'
    ];
    
    for (const table of verifyTables) {
      try {
        const r = await db.query(`SELECT COUNT(*) FROM ${table}`);
        console.log(`${table}: ${r.rows[0].count} rows`);
      } catch (e) {
        console.log(`${table}: N/A (${e.message})`);
      }
    }
    
    console.log('\n=== Inbox Data Cleaned ===');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit(0);
  }
}

cleanInboxData();