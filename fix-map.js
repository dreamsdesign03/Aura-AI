const db = require('./server/db');

async function fixMapping() {
  // 187s walo call Jeet Raval no che (chat ma Jeet Raval naam bole che)
  const jeetIid = '20261026/8466d83c-11:29:14-c02cadef';
  
  // 223s walo call Mansi Shah no che (Indus portal parthi copy karelo full ID)
  // Jo full ID na hoy to screenshot mujab no prefix
  const mansiIid = '20261026/2858328...'; // <-- Ahiya Mansi walo full ID paste karo

  try {
    // 1. Get Contacts
    const jeetRes = await db.query("SELECT id FROM bulk_contacts WHERE campaign_id = 18 AND (name ILIKE '%Jeet%' OR phone10 LIKE '%6352504304') LIMIT 1");
    const mansiRes = await db.query("SELECT id FROM bulk_contacts WHERE campaign_id = 18 AND (name ILIKE '%Mansi%' OR phone10 LIKE '%8866351852') LIMIT 1");

    if (!jeetRes.rows.length || !mansiRes.rows.length) {
      console.log('Contacts not found');
      process.exit(1);
    }

    const jeetId = jeetRes.rows[0].id;
    const mansiId = mansiRes.rows[0].id;

    console.log(`Mapping -> Jeet ID: ${jeetId}, Mansi ID: ${mansiId}`);

    // Clear old attempts for this campaign
    await db.query("DELETE FROM bulk_attempts WHERE campaign_id = 18");

    // 2. Insert for Jeet Raval
    const jeetRec = `/api/bulk-calling/calls/recording?iid=${encodeURIComponent(jeetIid)}`;
    await db.query(
      `INSERT INTO bulk_attempts (contact_id, campaign_id, attempt_no, call_status, outcome, summary, interaction_id, recording_url, started_at, ended_at)
       VALUES ($1, 18, 1, 'completed', 'CONNECTED', 'Live conversation with Jeet Raval (187.78s)', $2, $3, NOW(), NOW())`,
      [jeetId, jeetIid, jeetRec]
    );
    await db.query("UPDATE bulk_contacts SET status = 'completed', attempts = 1, last_summary = 'Live call finished with Jeet Raval' WHERE id = $1", [jeetId]);

    // 3. Insert for Mansi Shah
    const mansiRec = `/api/bulk-calling/calls/recording?iid=${encodeURIComponent(mansiIid)}`;
    await db.query(
      `INSERT INTO bulk_attempts (contact_id, campaign_id, attempt_no, call_status, outcome, summary, interaction_id, recording_url, started_at, ended_at)
       VALUES ($1, 18, 1, 'completed', 'CONNECTED', 'Live conversation with Mansi Shah (223.66s)', $2, $3, NOW(), NOW())`,
      [mansiId, mansiIid, mansiRec]
    );
    await db.query("UPDATE bulk_contacts SET status = 'completed', attempts = 1, last_summary = 'Live call finished with Mansi Shah' WHERE id = $1", [mansiId]);

    console.log('✅ Successfully mapped both contacts correctly!');
    process.exit(0);
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
}
fixMapping();
