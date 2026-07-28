const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const APOLLO_BASE = 'https://api.apollo.io/api/v1';
const BLOCKED_DOMAINS = new Set([
  'google.com','amazon.com','apple.com','microsoft.com','meta.com','facebook.com',
  'twitter.com','x.com','tesla.com','netflix.com','uber.com','airbnb.com',
  'spotify.com','salesforce.com','oracle.com','sap.com','ibm.com','intel.com',
  'nvidia.com','adobe.com','example.com','test.com','dummy.com','placeholder.com',
  'mailinator.com','guerrillamail.com','tempmail.com',
]);

function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (rc) rc.split(';').forEach(c => { const p = c.split('='); list[p.shift().trim()] = decodeURIComponent(p.join('=')); });
  return list;
}

function isValidLead(lead) {
  if (!lead.email || !lead.firstName) return false;
  const domain = lead.email.split('@')[1]?.toLowerCase();
  if (!domain || BLOCKED_DOMAINS.has(domain)) return false;
  if (/^(test|dummy|placeholder|noreply|no-reply)/.test(lead.email)) return false;
  if (/^(test|sample|example|fake)/i.test(lead.firstName)) return false;
  return true;
}

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
}

// ── Google Maps via Apify ─────────────────────────────────────────────────
async function fetchGoogleMaps(icp, count, apiKey) {
  if (!apiKey) throw new Error('APIFY_TOKEN not configured. Add it to Vercel env vars.');

  const query = [...(icp.industries || []), ...(icp.roles || [])].join(' ');
  const location = (icp.markets || ['United States'])[0];
  const searchStr = `${query} in ${location}`;

  // Start Apify actor run
  const runRes = await fetch(`https://api.apify.com/v2/acts/compass~crawler-google-places/runs?token=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      searchStringsArray: [searchStr],
      maxCrawledPlacesPerSearch: Math.min(count * 2, 40),
      language: 'en',
      exportPlaceUrls: false,
    }),
  });

  if (!runRes.ok) {
    const err = await runRes.text();
    throw new Error(`Apify actor failed: ${err}`);
  }

  const runData = await runRes.json();
  const runId = runData.data?.id;
  const datasetId = runData.data?.defaultDatasetId;
  if (!runId) throw new Error('No Apify run ID');

  // Poll for completion (max 3 min)
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apiKey}`);
    const statusData = await statusRes.json();
    if (statusData.data?.status === 'SUCCEEDED') break;
    if (statusData.data?.status === 'FAILED') throw new Error('Apify run failed');
    if (statusData.data?.status === 'ABORTED') throw new Error('Apify run aborted');
  }

  // Fetch results
  const itemsRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${apiKey}&limit=${count * 2}&format=json`);
  const items = await itemsRes.json();
  if (!Array.isArray(items)) throw new Error('Invalid Apify response');

  return items.slice(0, count).map(item => {
    const name = String(item.title || item.name || '').trim();
    const website = item.website || '';
    const domain = getDomain(website);
    return {
      firstName: name.split(' ')[0] || 'Unknown',
      lastName: name.split(' ').slice(1).join(' ') || '',
      company: name,
      email: domain ? `info@${domain}` : '',
      phone: item.phone || '',
      website,
      industry: item.categoryName || (icp.industries || [])[0] || '',
      country: (icp.markets || ['United States'])[0],
      designation: '',
      source: 'google_maps',
    };
  }).filter(isValidLead);
}

// ── Apollo.io ─────────────────────────────────────────────────────────────
async function fetchApollo(icp, count, apiKey) {
  if (!apiKey) throw new Error('APOLLO_API_KEY not configured. Add it to Vercel env vars.');

  const keywords = [...(icp.industries || []), ...(icp.roles || [])].join(' ');
  const locations = (icp.markets || ['United States']);

  // Step 1: Search organizations
  const orgRes = await fetch(`${APOLLO_BASE}/organizations/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
    body: JSON.stringify({
      api_key: apiKey,
      q_organization_keyword_tags: keywords,
      organization_locations: locations,
      page: 1,
      per_page: Math.min(count, 25),
    }),
  });

  if (!orgRes.ok) {
    const err = await orgRes.text();
    throw new Error(`Apollo organizations/search failed: ${err}`);
  }

  const orgData = await orgRes.json();
  const accounts = orgData.accounts || [];
  if (accounts.length === 0) return [];

  const DECISION_MAKER_TITLES = [
    'CEO', 'Founder', 'Co-Founder', 'Owner', 'Managing Director',
    'Director', 'Head of Marketing', 'CMO', 'VP Marketing',
    'Head of Sales', 'CTO', 'COO',
  ];

  const leads = [];

  // Step 2: For each org, search for decision-maker contacts
  for (const account of accounts) {
    if (leads.length >= count) break;
    try {
      const peopleRes = await fetch(`${APOLLO_BASE}/mixed_people/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
        body: JSON.stringify({
          api_key: apiKey,
          q_organization_name: account.name,
          person_titles: DECISION_MAKER_TITLES,
          page: 1,
          per_page: 3,
        }),
      });

      if (!peopleRes.ok) continue;
      const peopleData = await peopleRes.json();
      const people = peopleData.people || [];

      for (const person of people) {
        if (leads.length >= count) break;
        const email = person.email;
        if (!email) continue;

        const domain = email.split('@')[1]?.toLowerCase();
        const website = account.website_url || '';
        const websiteDomain = getDomain(website);

        // Domain enforcement: email domain should match company domain
        if (websiteDomain && domain && websiteDomain !== domain) continue;

        const lead = {
          firstName: person.first_name || '',
          lastName: person.last_name || '',
          company: account.name || '',
          email,
          phone: person.phone_numbers?.[0]?.sanitized_number || '',
          website,
          industry: account.industry || (icp.industries || [])[0] || '',
          country: person.country || (icp.markets || ['United States'])[0],
          designation: person.title || '',
          source: 'apollo',
        };

        if (isValidLead(lead)) leads.push(lead);
      }
    } catch {
      // Skip failed org, continue to next
    }
  }

  return leads.slice(0, count);
}

// ── Main Handler ──────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); } }

  const { icpId, sources = ['google_maps'], count = 10 } = body || {};
  const email = body?.email || parseCookies(req).aura_user_email;

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('X-Accel-Buffering', 'no');

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    let userId = null;
    let icp = {};

    if (email) {
      const ur = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (ur.rows.length > 0) userId = ur.rows[0].id;
    }

    if (icpId) {
      const icpRes = await pool.query('SELECT * FROM icps WHERE id = $1', [icpId]);
      if (icpRes.rows.length > 0) icp = icpRes.rows[0];
    }

    send('status', { message: `Fetching from ${sources.join(' + ')}...` });

    const apifyKey = process.env.APIFY_TOKEN;
    const apolloKey = process.env.APOLLO_API_KEY;

    let totalImported = 0;
    let totalSkipped = 0;
    const countPerSource = Math.ceil(count / sources.length);

    for (const source of sources) {
      try {
        send('status', { message: `Scanning ${source === 'google_maps' ? 'Google Maps' : 'Apollo'}...` });
        let leads = [];

        if (source === 'google_maps') {
          leads = await fetchGoogleMaps(icp, countPerSource, apifyKey);
        } else if (source === 'apollo') {
          leads = await fetchApollo(icp, countPerSource, apolloKey);
        }

        for (const lead of leads) {
          // Dedup check
          if (lead.email) {
            const dup = await pool.query('SELECT id FROM leads WHERE email = $1 LIMIT 1', [lead.email]);
            if (dup.rows.length > 0) {
              totalSkipped++;
              send('skip', { email: lead.email, reason: 'duplicate' });
              continue;
            }
          }

          try {
            await pool.query(
              `INSERT INTO leads (user_id, first_name, last_name, email, phone, company, designation, website, industry, country, status, pipeline_stage, created_at, updated_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'New','Lead In',NOW(),NOW())`,
              [userId, lead.firstName, lead.lastName, lead.email, lead.phone, lead.company, lead.designation, lead.website, lead.industry, lead.country]
            );
            totalImported++;
            send('lead', { lead, total: totalImported });
          } catch (dbErr) {
            totalSkipped++;
            send('skip', { email: lead.email, reason: dbErr.message });
          }
        }

        send('status', { message: `${source === 'google_maps' ? 'Google Maps' : 'Apollo'}: ${leads.length} leads found` });
      } catch (srcErr) {
        send('error', { message: `${source} error: ${srcErr.message}` });
      }
    }

    send('done', { imported: totalImported, skipped: totalSkipped, requested: count });

    // Update last_run_at
    if (userId) {
      try { await pool.query('UPDATE fetch_configs SET last_run_at = NOW() WHERE user_id = $1', [userId]); } catch {}
    }

    res.end();
  } catch (err) {
    send('error', { message: err.message });
    res.end();
  }
};
