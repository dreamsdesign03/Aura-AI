/**
 * Backfill Contact Names Script
 * Run this script to backfill contact names from existing call data
 */

const db = require('./db');
const { updateContactName, backfillContactNames } = require('./contact-name');

async function runBackfill() {
  console.log('=== Starting Contact Name Backfill ===\n');
  
  // 1. Run the bulk backfill from call data
  console.log('1. Backfilling from bulk_contacts and bulk_attempts...');
  const bulkResult = await backfillContactNames();
  console.log(`   Processed: ${bulkResult.processed}, Updated: ${bulkResult.updated}`);
  if (bulkResult.errors.length > 0) {
    console.log(`   Errors: ${bulkResult.errors.length}`);
    bulkResult.errors.forEach(e => console.log(`   - ${e.phone}: ${e.error}`));
  }

  // 2. Also check ai_calls for missing names
  console.log('\n2. Backfilling from ai_calls...');
  try {
    const calls = await db.query(`
      SELECT DISTINCT ac.id, ac.to_phone, ac.lead_name, ac.lead_name_original, ac.lead_name_source
      FROM ai_calls ac
      WHERE ac.lead_name IS NOT NULL
        AND ac.lead_name NOT ILIKE 'name not available'
        AND ac.lead_name NOT ILIKE 'unknown'
        AND ac.lead_name NOT ILIKE 'patient'
    `);

    let updated = 0;
    for (const call of calls.rows) {
      const rawName = call.lead_name_original || call.lead_name;
      const nameSource = call.lead_name_source || 'call';
      
      if (rawName && call.to_phone) {
        try {
          const result = await updateContactName({
            phone: call.to_phone,
            rawName,
            nameSource
          });
          if (result.success) updated++;
        } catch (e) {
          console.warn(`   Failed for ${call.to_phone}:`, e.message);
        }
      }
    }
    console.log(`   Updated: ${updated} contacts from ai_calls`);
  } catch (e) {
    console.warn('   Error:', e.message);
  }

  // 3. Also check whatsapp_conversations for missing names
  console.log('\n3. Backfilling from whatsapp_conversations...');
  try {
    const convs = await db.query(`
      SELECT wc.id, wc.phone, wc.wa_phone_number, wc.name_original, wc.name_english, wc.name_source
      FROM whatsapp_conversations wc
      WHERE (wc.name_original IS NOT NULL OR wc.name_english IS NOT NULL)
        AND wc.phone IS NOT NULL
    `);

    let updated = 0;
    for (const conv of convs.rows) {
      const rawName = conv.name_original || conv.name_english;
      const nameSource = conv.name_source || 'whatsapp';
      
      if (rawName && conv.phone) {
        try {
          const result = await updateContactName({
            phone: conv.phone,
            rawName: rawName,
            nameSource: nameSource
          });
          if (result.success) updated++;
        } catch (e) {
          console.warn(`   Failed for ${conv.phone}:`, e.message);
        }
      }
    }
    console.log(`   Updated: ${updated} contacts from whatsapp_conversations`);
  } catch (e) {
    console.warn('   Error:', e.message);
  }

  console.log('\n=== Backfill Complete ===');
  process.exit(0);
}

runBackfill().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});