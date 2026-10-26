require('dotenv').config();
const db = require('./server/db');

async function syncDirect() {
  try {
    const campRes = await db.query('SELECT * FROM bulk_campaigns WHERE id = 18');
    if (!campRes.rows.length) {
      console.log('Campaign 18 not found');
      process.exit(1);
    }
    const camp = campRes.rows[0];
    const sarvamCampId = camp.sarvam_campaign_id || 'AuraAI-18-T-352bbe19-b6c5';
    console.log('Found Sarvam Campaign ID:', sarvamCampId);

    // Fetch contacts
    const contRes = await db.query('SELECT * FROM bulk_contacts WHERE campaign_id = 18');
    console.log(`Found ${contRes.rows.length} contacts in DB`);

    // Fetch from Sarvam
    const apiKey = (process.env.SARVAM_API_KEY || '').trim();
    const urls = [
      `https://api.sarvam.ai/voice/campaigns/${sarvamCampId}/analytics/interactions`,
      `https://apps.sarvam.ai/api/analytics/v1/${process.env.SARVAM_ORG_ID}/${process.env.SARVAM_WORKSPACE_ID}/${process.env.SARVAM_APP_ID}/interactions?campaign_id=${sarvamCampId}&page_size=50`
    ];

    let interactions = [];
    for (const u of urls) {
      try {
        console.log('Trying URL:', u);
        const r = await fetch(u, {
          headers: { 'X-API-Key': apiKey, 'API-Subscription-Key': apiKey }
        });
        console.log('Response status:', r.status);
        if (r.ok) {
          const d = await r.json();
          interactions = d.interactions || d.data || [];
          if (interactions.length > 0) {
            console.log(`Successfully fetched ${interactions.length} interactions!`);
            break;
          }
        } else {
          console.log('Failed body:', await r.text());
        }
      } catch (err) {
        console.log('Fetch err:', err.message);
      }
    }

    console.log('Interactions found:', JSON.stringify(interactions, null, 2));

    // If API returned interactions, update contacts & attempts
    for (const c of contRes.rows) {
      const p10 = (c.phone10 || '').slice(-10);
      const match = interactions.find(it => (it.user_phone_number || it.phone_number || '').includes(p10));

      let status = 'not_booked';
      let outcome = 'NOT_BOOKED';
      let slot = null;
      let summary = 'Call finished with user';
      let iid = match?.interaction_id || null;

      if (match) {
        const vars = match.output_agent_variables || match.final_agent_variables || {};
        slot = vars.confirmed_slot || vars.appointment_time || vars.slot || null;
        const isBooked = vars.is_booked === true || String(vars.is_booked).toLowerCase() === 'true' || Boolean(slot);
        if (isBooked) {
          status = 'booked';
          outcome = 'BOOKED';
          summary = `Booked for ${slot}`;
        }
      }

      await db.query(
        'UPDATE bulk_contacts SET status = $1, attempts = 1, booked_datetime_text = $2, last_summary = $3 WHERE id = $4',
        [status, slot, summary, c.id]
      );

      if (iid) {
        await db.query(
          `INSERT INTO bulk_attempts (contact_id, campaign_id, attempt_no, call_status, outcome, summary, interaction_id, recording_url, started_at, ended_at)
           VALUES ($1, 18, 1, $2, $3, $4, $5, $6, NOW(), NOW())
           ON CONFLICT DO NOTHING`,
          [c.id, status, outcome, summary, iid, `/api/bulk-calling/calls/recording?iid=${encodeURIComponent(iid)}`]
        );
      }
    }

    console.log('Sync finished successfully!');
    process.exit(0);
  } catch (e) {
    console.error('Fatal:', e);
    process.exit(1);
  }
}
syncDirect();
