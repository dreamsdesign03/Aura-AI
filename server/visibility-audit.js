const express = require('express');
const router = express.Router();
const db = require('./db');

// ─────────────────────────────────────────────────────────────────────────────
// Visibility Audit — REAL rank checking (no hardcoded / random ranks).
//   • Google Maps / Local Pack + Organic rank  → Serper.dev   (SERPER_API_KEY)
//   • AI answers: ChatGPT / Perplexity / Gemini / Google AI Overview
//       → OPENAI_API_KEY, PERPLEXITY_API_KEY, GEMINI_API_KEY (+ SERPER for AI Overview)
// A keyword that was never scanned has current_rank = NULL ("Not scanned yet").
// ─────────────────────────────────────────────────────────────────────────────

const TARGET_DOMAIN = (process.env.AUDIT_TARGET_DOMAIN || 'auralaserclinic.com').toLowerCase();
const SERP_DEPTH = Math.min(100, Math.max(10, parseInt(process.env.AUDIT_SERP_DEPTH || '30', 10)));

// Branch config. `ll` = Google Maps viewport the search is "checked from".
// Coordinates are approximate branch-area centres — adjust if a branch moves.
// `hints` = words that appear in that branch's Google address.
const BRANCHES = [
  { name: 'Alkapuri', city: 'Vadodara', location: 'Vadodara, Gujarat, India', ll: '@22.3103,73.1707,14z', hints: ['alkapuri'] },
  { name: 'Manjalpur', city: 'Vadodara', location: 'Vadodara, Gujarat, India', ll: '@22.2677,73.1890,14z', hints: ['manjalpur'] },
  { name: 'Waghodia Road', city: 'Vadodara', location: 'Vadodara, Gujarat, India', ll: '@22.3086,73.2282,14z', hints: ['waghodia'] },
  { name: 'Vasna Bhayli', city: 'Vadodara', location: 'Vadodara, Gujarat, India', ll: '@22.2760,73.1400,14z', hints: ['vasna', 'bhayli'] },
  { name: 'Surat', city: 'Surat', location: 'Surat, Gujarat, India', ll: '@21.1702,72.8311,13z', hints: ['surat'] },
  { name: 'Ranchi', city: 'Ranchi', location: 'Ranchi, Jharkhand, India', ll: '@23.3441,85.3096,13z', hints: ['ranchi'] },
];

function branchByName(n) {
  const b = BRANCHES.find((b) => b.name.toLowerCase() === String(n || '').toLowerCase());
  return b || null; // null = unknown branch
}

// Default patient questions asked to AI engines (editable in DB table).
const DEFAULT_AI_QUESTIONS = [
  { q: 'Best skin clinic in Vadodara?', branch: null },
  { q: 'Which is the best dermatologist in Vadodara?', branch: null },
  { q: 'Best clinic for laser hair removal in Vadodara?', branch: null },
  { q: 'Where can I get acne scar treatment in Vadodara?', branch: null },
  { q: 'Best hair transplant clinic in Vadodara?', branch: null },
  { q: 'Which clinic is good for hydrafacial in Vadodara?', branch: null },
  { q: 'Best PRP hair treatment in Vadodara?', branch: null },
  { q: 'Best clinic for pigmentation treatment in Vadodara?', branch: null },
  { q: 'Bridal skin treatment clinic in Vadodara?', branch: null },
  { q: 'Best vitiligo treatment in Vadodara?', branch: null },
  { q: 'Best cosmetic dermatologist in Vadodara?', branch: null },
  { q: 'Botox and fillers clinic in Vadodara?', branch: null },
  { q: 'Best skin clinic in Alkapuri, Vadodara?', branch: 'Alkapuri' },
  { q: 'Laser hair removal near Alkapuri Vadodara?', branch: 'Alkapuri' },
  { q: 'Best skin doctor in Manjalpur, Vadodara?', branch: 'Manjalpur' },
  { q: 'Skin clinic near Manjalpur Vadodara?', branch: 'Manjalpur' },
  { q: 'Best dermatologist near Waghodia Road, Vadodara?', branch: 'Waghodia Road' },
  { q: 'Skin clinic in Vasna Bhayli Road, Vadodara?', branch: 'Vasna Bhayli' },
  { q: 'Best skin clinic in Surat?', branch: 'Surat' },
  { q: 'Best skin clinic in Ranchi?', branch: 'Ranchi' },
];

// ── Default Keywords Dataset categorized as requested ────────────────────────
const SEED_KEYWORDS = [
  // Suggested / Top Priority Keywords
  { keyword: "dermatologist near me", category: "Suggested Keywords", branch: "Alkapuri" },
  { keyword: "skin specialist near me", category: "Suggested Keywords", branch: "Alkapuri" },
  { keyword: "Laser hair removal Vadodara", category: "Suggested Keywords", branch: "Alkapuri" },
  { keyword: "Hair transplant Vadodara", category: "Suggested Keywords", branch: "Waghodia Road" },
  { keyword: "Skin specialist in Vadodara near me", category: "Suggested Keywords", branch: "Alkapuri" },
  { keyword: "Skin clinic in Vadodara", category: "Suggested Keywords", branch: "Alkapuri" },
  { keyword: "Cosmetic dermatologist Vadodara", category: "Suggested Keywords", branch: "Alkapuri" },
  { keyword: "Acne & pimple treatment Vadodara", category: "Suggested Keywords", branch: "Manjalpur" },
  { keyword: "Laser skin clinic Vadodara", category: "Suggested Keywords", branch: "Alkapuri" },
  { keyword: "Best dermatologist in Vadodara", category: "Suggested Keywords", branch: "Alkapuri" },
  { keyword: "Best skin doctor Vadodara", category: "Suggested Keywords", branch: "Alkapuri" },
  { keyword: "Vadodara skin specialist", category: "Suggested Keywords", branch: "Alkapuri" },
  { keyword: "Vitiligo treatment Vadodara", category: "Suggested Keywords", branch: "Waghodia Road" },
  { keyword: "Pediatric dermatologist Vadodara", category: "Suggested Keywords", branch: "Alkapuri" },
  { keyword: "Best skin doctor in Vadodara", category: "Suggested Keywords", branch: "Alkapuri" },
  { keyword: "Best Skin specialist Vadodara", category: "Suggested Keywords", branch: "Alkapuri" },
  { keyword: "Best dermatologist in Vadodara for Skin", category: "Suggested Keywords", branch: "Alkapuri" },
  { keyword: "Best dermatologist in Vadodara for hair", category: "Suggested Keywords", branch: "Waghodia Road" },
  { keyword: "Dermatologist Vadodara", category: "Suggested Keywords", branch: "Alkapuri" },
  { keyword: "Skin Specialist Vadodara", category: "Suggested Keywords", branch: "Alkapuri" },
  { keyword: "Skin Doctor Vadodara", category: "Suggested Keywords", branch: "Alkapuri" },
  { keyword: "Best Skin Clinic Vadodara", category: "Suggested Keywords", branch: "Alkapuri" },
  { keyword: "Hair Fall Treatment Vadodara", category: "Suggested Keywords", branch: "Waghodia Road" },
  { keyword: "Pigmentation Treatment Vadodara", category: "Suggested Keywords", branch: "Manjalpur" },
  { keyword: "PRP Hair Treatment Vadodara", category: "Suggested Keywords", branch: "Waghodia Road" },
  { keyword: "Chemical Peel Vadodara", category: "Suggested Keywords", branch: "Alkapuri" },
  { keyword: "Hydrafacial Vadodara", category: "Suggested Keywords", branch: "Manjalpur" },
  { keyword: "Best Skin Clinic Near Me", category: "Suggested Keywords", branch: "Alkapuri" },

  // General Dermatology
  { keyword: "Skin Clinic Vadodara", category: "General Dermatology", branch: "Alkapuri" },
  { keyword: "Fungal Infection Treatment Vadodara", category: "General Dermatology", branch: "Alkapuri" },
  { keyword: "Psoriasis Treatment Vadodara", category: "General Dermatology", branch: "Alkapuri" },
  { keyword: "Eczema Treatment Vadodara", category: "General Dermatology", branch: "Alkapuri" },
  { keyword: "Alopecia Treatment Vadodara", category: "General Dermatology", branch: "Waghodia Road" },
  { keyword: "Skin Allergy Treatment Vadodara", category: "General Dermatology", branch: "Alkapuri" },
  { keyword: "Itching Treatment Vadodara", category: "General Dermatology", branch: "Alkapuri" },

  // Acne & Acne Scar
  { keyword: "Acne Treatment Vadodara", category: "Acne & Acne Scar", branch: "Manjalpur" },
  { keyword: "Acne Scar Treatment Vadodara", category: "Acne & Acne Scar", branch: "Manjalpur" },
  { keyword: "Pimple Treatment Vadodara", category: "Acne & Acne Scar", branch: "Manjalpur" },
  { keyword: "Acne Scar Removal Vadodara", category: "Acne & Acne Scar", branch: "Manjalpur" },
  { keyword: "Carbon Peel Vadodara", category: "Acne & Acne Scar", branch: "Alkapuri" },
  { keyword: "Fractional CO2 Laser Vadodara", category: "Acne & Acne Scar", branch: "Alkapuri" },
  { keyword: "Microneedling Vadodara", category: "Acne & Acne Scar", branch: "Alkapuri" },
  { keyword: "PRP for Acne Scars Vadodara", category: "Acne & Acne Scar", branch: "Manjalpur" },
  { keyword: "Laser Acne Treatment Vadodara", category: "Acne & Acne Scar", branch: "Alkapuri" },

  // Hair Treatment
  { keyword: "Hair PRP Vadodara", category: "Hair Treatment", branch: "Waghodia Road" },
  { keyword: "GFC Hair Treatment Vadodara", category: "Hair Treatment", branch: "Waghodia Road" },
  { keyword: "Beard Transplant Vadodara", category: "Hair Treatment", branch: "Waghodia Road" },
  { keyword: "Hair Regrowth Treatment Vadodara", category: "Hair Treatment", branch: "Waghodia Road" },
  { keyword: "Hair Loss Specialist Vadodara", category: "Hair Treatment", branch: "Waghodia Road" },
  { keyword: "Best Hair Clinic Vadodara", category: "Hair Treatment", branch: "Waghodia Road" },

  // Laser Hair Reduction
  { keyword: "Laser Hair Reduction Vadodara", category: "Laser Hair Reduction", branch: "Alkapuri" },
  { keyword: "Permanent Hair Removal Vadodara", category: "Laser Hair Reduction", branch: "Alkapuri" },
  { keyword: "Full Body Laser Hair Removal Vadodara", category: "Laser Hair Reduction", branch: "Alkapuri" },
  { keyword: "Laser Hair Removal Clinic Vadodara", category: "Laser Hair Reduction", branch: "Alkapuri" },
  { keyword: "Best Laser Hair Removal Vadodara", category: "Laser Hair Reduction", branch: "Alkapuri" },

  // Dermatosurgery
  { keyword: "Mole Removal Vadodara", category: "Dermatosurgery", branch: "Alkapuri" },
  { keyword: "Wart Removal Vadodara", category: "Dermatosurgery", branch: "Alkapuri" },
  { keyword: "Skin Tag Removal Vadodara", category: "Dermatosurgery", branch: "Alkapuri" },
  { keyword: "Cyst Removal Vadodara", category: "Dermatosurgery", branch: "Alkapuri" },
  { keyword: "Keloid Treatment Vadodara", category: "Dermatosurgery", branch: "Alkapuri" },
  { keyword: "Milia Removal Vadodara", category: "Dermatosurgery", branch: "Alkapuri" },

  // Laser Glow
  { keyword: "Q Switch Laser Vadodara", category: "Laser Glow", branch: "Alkapuri" },
  { keyword: "Laser Skin Rejuvenation Vadodara", category: "Laser Glow", branch: "Alkapuri" },
  { keyword: "Skin Glow Treatment Vadodara", category: "Laser Glow", branch: "Alkapuri" },
  { keyword: "Laser Facial Vadodara", category: "Laser Glow", branch: "Alkapuri" },
  { keyword: "Photofacial Vadodara", category: "Laser Glow", branch: "Alkapuri" },

  // Vitiligo
  { keyword: "White Patch Treatment Vadodara", category: "Vitiligo", branch: "Waghodia Road" },
  { keyword: "Vitiligo Specialist Vadodara", category: "Vitiligo", branch: "Waghodia Road" },
  { keyword: "Excimer Laser Vadodara", category: "Vitiligo", branch: "Waghodia Road" },
  { keyword: "NBUVB Treatment Vadodara", category: "Vitiligo", branch: "Waghodia Road" },
  { keyword: "Vitiligo Surgery Vadodara", category: "Vitiligo", branch: "Waghodia Road" },

  // Medifacials
  { keyword: "Korean Facial Vadodara", category: "Medifacials", branch: "Manjalpur" },
  { keyword: "Oxygen Facial Vadodara", category: "Medifacials", branch: "Manjalpur" },
  { keyword: "Vampire Facial Vadodara", category: "Medifacials", branch: "Alkapuri" },
  { keyword: "Medi Facial Vadodara", category: "Medifacials", branch: "Manjalpur" },
  { keyword: "Skin Glow Facial Vadodara", category: "Medifacials", branch: "Manjalpur" },

  // Pigmentation
  { keyword: "Underarm Pigmentation Treatment Vadodara", category: "Pigmentation", branch: "Manjalpur" },
  { keyword: "Dark Underarm Treatment Vadodara", category: "Pigmentation", branch: "Manjalpur" },
  { keyword: "Intimate Area Pigmentation Treatment Vadodara", category: "Pigmentation", branch: "Alkapuri" },
  { keyword: "Laser Pigmentation Treatment Vadodara", category: "Pigmentation", branch: "Alkapuri" },
  { keyword: "Melasma Treatment Vadodara", category: "Pigmentation", branch: "Manjalpur" },

  // Bridal
  { keyword: "Bridal Skin Treatment Vadodara", category: "Bridal", branch: "Alkapuri" },
  { keyword: "Bridal Glow Treatment Vadodara", category: "Bridal", branch: "Alkapuri" },
  { keyword: "Groom Skin Treatment Vadodara", category: "Bridal", branch: "Alkapuri" },
  { keyword: "Pre Wedding Skin Treatment Vadodara", category: "Bridal", branch: "Alkapuri" },
  { keyword: "Bridal Facial Vadodara", category: "Bridal", branch: "Alkapuri" },

  // Anti Aging
  { keyword: "Botox Vadodara", category: "Anti Aging", branch: "Alkapuri" },
  { keyword: "Dermal Fillers Vadodara", category: "Anti Aging", branch: "Alkapuri" },
  { keyword: "Anti Aging Treatment Vadodara", category: "Anti Aging", branch: "Alkapuri" },
  { keyword: "Thread Lift Vadodara", category: "Anti Aging", branch: "Alkapuri" },
  { keyword: "Skin Booster Treatment Vadodara", category: "Anti Aging", branch: "Alkapuri" },
  { keyword: "Wrinkle Treatment Vadodara", category: "Anti Aging", branch: "Alkapuri" },

  // Cosmetic Gynecology
  { keyword: "Vaginal Tightening Vadodara", category: "Cosmetic Gynecology", branch: "Alkapuri" },
  { keyword: "Non Surgical Vaginal Tightening Vadodara", category: "Cosmetic Gynecology", branch: "Alkapuri" },
  { keyword: "Cosmetic Gynecology Vadodara", category: "Cosmetic Gynecology", branch: "Alkapuri" },
  { keyword: "Laser Vaginal Tightening Vadodara", category: "Cosmetic Gynecology", branch: "Alkapuri" },

  // IV Glutathione
  { keyword: "IV Glutathione Vadodara", category: "IV Glutathione", branch: "Alkapuri" },
  { keyword: "Glutathione Drip Vadodara", category: "IV Glutathione", branch: "Alkapuri" },
  { keyword: "Glutathione Treatment Vadodara", category: "IV Glutathione", branch: "Alkapuri" },
  { keyword: "Skin Rejuvenation IV Vadodara", category: "IV Glutathione", branch: "Alkapuri" }
];

// ── Schema ───────────────────────────────────────────────────────────────────
let schemaReady = null;
function ensureAuditSchema() {
  if (!schemaReady) schemaReady = _ensureAuditSchema().catch((err) => {
    schemaReady = null;
    console.error('[Visibility Audit Init Error]:', err.message);
    throw err;
  });
  return schemaReady;
}

async function _ensureAuditSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS visibility_audit_keywords (
      id SERIAL PRIMARY KEY,
      keyword TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      target_city TEXT DEFAULT 'Vadodara',
      branch TEXT DEFAULT 'Alkapuri',
      current_rank INT,
      previous_rank INT,
      rank_change INT DEFAULT 0,
      ranked_url TEXT,
      serp_features JSONB DEFAULT '[]'::jsonb,
      last_checked_at TIMESTAMPTZ,
      history JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS visibility_audit_summary (
      id SERIAL PRIMARY KEY,
      open_fixes JSONB DEFAULT '[]'::jsonb,
      last_audit_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS visibility_audit_ai_questions (
      id SERIAL PRIMARY KEY,
      question TEXT NOT NULL UNIQUE,
      branch TEXT
    );
    CREATE TABLE IF NOT EXISTS visibility_audit_ai_results (
      id SERIAL PRIMARY KEY,
      question_id INT NOT NULL REFERENCES visibility_audit_ai_questions(id) ON DELETE CASCADE,
      engine TEXT NOT NULL,
      answered BOOLEAN DEFAULT TRUE,
      mentioned BOOLEAN DEFAULT FALSE,
      position INT,
      snippet TEXT,
      competitors JSONB DEFAULT '[]'::jsonb,
      citations JSONB DEFAULT '[]'::jsonb,
      checked_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (question_id, engine)
    );
  `);

  // New real-data columns. If `source` is missing, this DB still holds the old
  // randomly-seeded / hardcoded ranks → wipe them so nothing fake is shown.
  const hasSource = await db.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = 'visibility_audit_keywords' AND column_name = 'source'`
  );
  await db.query(`
    ALTER TABLE visibility_audit_keywords
      ADD COLUMN IF NOT EXISTS maps_rank INT,
      ADD COLUMN IF NOT EXISTS organic_rank INT,
      ADD COLUMN IF NOT EXISTS maps_rank_prev INT,
      ADD COLUMN IF NOT EXISTS organic_rank_prev INT,
      ADD COLUMN IF NOT EXISTS top_results JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS rating NUMERIC(2,1),
      ADD COLUMN IF NOT EXISTS reviews INT,
      ADD COLUMN IF NOT EXISTS matched_name TEXT,
      ADD COLUMN IF NOT EXISTS matched_address TEXT,
      ADD COLUMN IF NOT EXISTS branch_exact BOOLEAN,
      ADD COLUMN IF NOT EXISTS last_error TEXT,
      ADD COLUMN IF NOT EXISTS source TEXT,
      ADD COLUMN IF NOT EXISTS ai_overview_rank INT,
      ADD COLUMN IF NOT EXISTS ai_overview_mentioned BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS ai_overview_data JSONB;
    ALTER TABLE visibility_audit_keywords ALTER COLUMN last_checked_at DROP DEFAULT;
    ALTER TABLE visibility_audit_keywords ALTER COLUMN serp_features SET DEFAULT '[]'::jsonb;
  `);
  if (hasSource.rows.length === 0) {
    await db.query(`
      UPDATE visibility_audit_keywords
         SET current_rank = NULL, previous_rank = NULL, rank_change = 0,
             history = '[]'::jsonb, serp_features = '[]'::jsonb,
             ranked_url = NULL, last_checked_at = NULL`);
    console.log('[Visibility Audit] Cleared old seeded (fake) ranks.');
  }

  // Seed keyword list (text only — NO ranks).
  const kwCount = await db.query('SELECT COUNT(*)::int AS n FROM visibility_audit_keywords');
  if (kwCount.rows[0].n === 0) {
    for (const item of SEED_KEYWORDS) {
      const b = branchByName(item.branch);
      await db.query(
        `INSERT INTO visibility_audit_keywords (keyword, category, target_city, branch)
         VALUES ($1, $2, $3, $4) ON CONFLICT (keyword) DO NOTHING`,
        [item.keyword, item.category, b ? b.city : 'Vadodara', item.branch]
      );
    }
  }
  const qCount = await db.query('SELECT COUNT(*)::int AS n FROM visibility_audit_ai_questions');
  if (qCount.rows[0].n === 0) {
    for (const item of DEFAULT_AI_QUESTIONS) {
      await db.query(
        'INSERT INTO visibility_audit_ai_questions (question, branch) VALUES ($1, $2) ON CONFLICT (question) DO NOTHING',
        [item.q, item.branch]
      );
    }
  }
  const sCount = await db.query('SELECT COUNT(*)::int AS n FROM visibility_audit_summary');
  if (sCount.rows[0].n === 0) await db.query(`INSERT INTO visibility_audit_summary (open_fixes) VALUES ('[]'::jsonb)`);
}

// ── Aura matching ────────────────────────────────────────────────────────────
// Match Aura brand by name (works even if GBP links to booking page/Instagram)
const AURA_NAME_RE = /aura\s+laser|dr\.?\s*aditya\s*shah|skinnonest/i;

function isAuraPlace(p) {
  const site = String(p.website || p.link || '').toLowerCase();
  const title = String(p.title || '');
  // Match if website is our target domain OR title contains Aura brand name
  return (site && site.includes(TARGET_DOMAIN)) || AURA_NAME_RE.test(title);
}

function addressHasHint(address, branch) {
  const a = String(address || '').toLowerCase();
  return (branch.hints || []).some((h) => a.includes(h));
}

// Check if address belongs to a DIFFERENT branch in our BRANCHES list
function belongsToOtherBranch(address, targetBranch) {
  const a = String(address || '').toLowerCase();
  for (const b of BRANCHES) {
    if (b.name === targetBranch.name) continue;
    if ((b.hints || []).some((h) => a.includes(h))) return true;
  }
  return false;
}

// ── Pure parsers (unit-testable, no network) ─────────────────────────────────
function parseMapsResponse(json, branch) {
  const places = Array.isArray(json?.places) ? json.places : [];
  const top = places.slice(0, 5).map((p, i) => ({
    position: p.position || i + 1,
    title: p.title,
    rating: p.rating ?? null,
    reviews: p.ratingCount ?? p.reviews ?? null,
    address: p.address || null,
    aura: isAuraPlace(p) && !belongsToOtherBranch(p.address, branch),
  }));
  // 1) Exact match: Aura brand + target branch address hint
  let idx = places.findIndex((p) => isAuraPlace(p) && addressHasHint(p.address, branch));
  let exact = idx >= 0;
  // 2) Fallback: Aura brand but address doesn't match another known branch
  //    (e.g. Serper returns street name/PIN not in our hints)
  if (idx < 0) {
    idx = places.findIndex((p) => isAuraPlace(p) && !belongsToOtherBranch(p.address, branch));
    exact = false;
  }
  if (idx < 0) return { rank: null, top, checked: places.length, match: null, exact: false };
  const p = places[idx];
  return {
    rank: p.position || idx + 1, top, checked: places.length, exact,
    match: { title: p.title, address: p.address || null, rating: p.rating ?? null, reviews: p.ratingCount ?? p.reviews ?? null },
  };
}

function parseSearchResponse(json, branch) {
  const organic = Array.isArray(json?.organic) ? json.organic : [];
  const idx = organic.findIndex((o) => isAuraPlace(o));
  const hasLocalPack = Array.isArray(json?.places) && json.places.length > 0;
  // Local Pack match must also respect branch address hints
  const packIdx = hasLocalPack ? json.places.findIndex((p) => isAuraPlace(p) && addressHasHint(p.address, branch)) : -1;

  // ── AI Overview parsing (Serper returns aiOverview or ai_overview) ──
  const rawAi = json?.aiOverview || json?.ai_overview || null;
  let aiOverviewData = {
    present: false,
    mentioned: false,
    rank: null,
    snippet: '',
    items: [],
    references: [],
  };
  if (rawAi) {
    aiOverviewData.present = true;
    // Extract text content
    let text = '';
    let items = [];
    if (typeof rawAi === 'string') {
      text = rawAi;
    } else if (typeof rawAi === 'object') {
      // Serper AI Overview structure may have: text, textBlocks, list, table, items
      text = rawAi.text || rawAi.snippet || rawAi.answer || '';
      if (Array.isArray(rawAi.textBlocks)) {
        // textBlocks: [{title, text, list: [...]}]
        for (const block of rawAi.textBlocks) {
          if (block.text) text += '\n' + block.text;
          if (Array.isArray(block.list)) {
            for (const item of block.list) {
              items.push({ title: item.title || item.name || '', snippet: item.snippet || item.text || '', link: item.link || item.url || '' });
            }
          }
        }
      }
      if (Array.isArray(rawAi.list)) {
        for (const item of rawAi.list) {
          items.push({ title: item.title || item.name || '', snippet: item.snippet || item.text || '', link: item.link || item.url || '' });
        }
      }
      if (Array.isArray(rawAi.items)) {
        for (const item of rawAi.items) {
          items.push({ title: item.title || item.name || '', snippet: item.snippet || item.text || '', link: item.link || item.url || '' });
        }
      }
      if (rawAi.table && Array.isArray(rawAi.table.rows)) {
        for (const row of rawAi.table.rows) {
          items.push({ title: row[0] || '', snippet: row.slice(1).join(' | ') || '', link: '' });
        }
      }
    }
    // Extract references/sources
    const references = (rawAi.sources || rawAi.references || []).map((s) => s.link || s.url || s).filter(Boolean);

    // Determine if Aura is mentioned and its rank in the AI Overview
    const mentionRe = /aura\s+(laser|skin|cosmetic|clinic)|dr\.?\s*aditya\s*shah|auralaserclinic|skinnonest/i;
    const fullText = text + '\n' + items.map(i => i.title + ' ' + i.snippet).join('\n');
    const urlHit = references.some((r) => String(r).toLowerCase().includes(TARGET_DOMAIN));
    const mentioned = mentionRe.test(fullText) || urlHit;
    let rank = null;
    if (mentioned) {
      // Check items for ranked position
      for (let i = 0; i < items.length; i++) {
        const itemText = items[i].title + ' ' + items[i].snippet;
        if (mentionRe.test(itemText) || (items[i].link && String(items[i].link).toLowerCase().includes(TARGET_DOMAIN))) {
          rank = i + 1;
          break;
        }
      }
      // If not found in items, check if mentioned in opening paragraph
      if (!rank && mentionRe.test(text)) {
        // Try to find numbered list in text
        const lines = text.split('\n');
        for (const line of lines) {
          if (mentionRe.test(line)) {
            const n = /^\s*(?:[#*\-\s]*)(\d{1,2})[.)]\s/.exec(line);
            if (n) { rank = parseInt(n[1], 10); break; }
            // If no explicit number but it's the first clinic mentioned, assume #1
            rank = 1;
            break;
          }
        }
      }
    }
    aiOverviewData = {
      present: true,
      mentioned,
      rank,
      snippet: text.replace(/\s+/g, ' ').trim().slice(0, 500),
      items,
      references: references.slice(0, 10),
    };
  }

  return {
    rank: idx >= 0 ? organic[idx].position || idx + 1 : null,
    url: idx >= 0 ? organic[idx].link : null,
    localPack: hasLocalPack,
    localPackRank: packIdx >= 0 ? packIdx + 1 : null,
    aiOverview: !!rawAi,
    aiOverviewData,
    checked: organic.length,
  };
}

// ── Network helpers ──────────────────────────────────────────────────────────
async function postJson(url, headers, body, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctrl.signal });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch { }
    if (!r.ok) {
      const err = new Error(`${r.status} ${(json && (json.message || json.error?.message || json.error)) || text.slice(0, 160)}`);
      err.status = r.status;
      // Preserve upstream 429 for rate limiting / quota
      if (r.status === 429) err.code = 'RATE_LIMITED';
      throw err;
    }
    return json || {};
  } finally { clearTimeout(t); }
}

const serperHeaders = () => ({ 'X-API-KEY': process.env.SERPER_API_KEY });
function serperConfigured() { return !!process.env.SERPER_API_KEY; }

// Real Google check for one keyword: Maps (from branch area) + organic (city-level).
async function checkGoogleRank(keyword, branchName) {
  if (!serperConfigured()) {
    const e = new Error('SERPER_API_KEY not configured — add it in Vercel env to enable live Google rank checks.');
    e.code = 'NOT_CONFIGURED';
    throw e;
  }
  const branch = branchByName(branchName);
  if (!branch) {
    const e = new Error(`Unknown branch: ${branchName}`);
    e.code = 'INVALID_BRANCH';
    throw e;
  }
  const [maps, search] = await Promise.all([
    postJson('https://google.serper.dev/maps', serperHeaders(), { q: keyword, ll: branch.ll, gl: 'in', hl: 'en' }),
    postJson('https://google.serper.dev/search', serperHeaders(), { q: keyword, gl: 'in', hl: 'en', location: branch.location, num: SERP_DEPTH }),
  ]);
  const m = parseMapsResponse(maps, branch);
  const s = parseSearchResponse(search, branch);
  return { maps: m, organic: s, depth: SERP_DEPTH };
}

// Writes a real result into the DB; returns the row.
async function saveKeywordResult(row, res) {
  const mapsRank = res.maps.rank;
  const orgRank = res.organic.rank;
  const localPackRank = res.organic.localPackRank;
  // Best rank = minimum positive rank across all sources
  const ranks = [mapsRank, orgRank, localPackRank].filter((r) => r && r > 0);
  const best = ranks.length ? Math.min(...ranks) : null;
  const prevBest = row.current_rank ?? null;
  const change = prevBest && best ? prevBest - best : 0;
  const features = [];
  if (mapsRank) features.push('maps');
  if (res.organic.localPack) features.push('local_pack');
  if (orgRank) features.push('organic');
  if (res.organic.aiOverview) features.push('ai_overview');
  // AI Overview data
  const aiOverviewData = res.organic.aiOverviewData || { present: false, mentioned: false, rank: null };
  let hist = Array.isArray(row.history) ? row.history : [];
  hist.push({ date: new Date().toISOString().split('T')[0], rank: best, maps: mapsRank, organic: orgRank, localPack: localPackRank, aiOverview: aiOverviewData.rank });
  hist = hist.slice(-12);
  const r = await db.query(
    `UPDATE visibility_audit_keywords SET
       current_rank = $1, previous_rank = $2, rank_change = $3,
       maps_rank = $4, maps_rank_prev = $5, organic_rank = $6, organic_rank_prev = $7,
       top_results = $8, rating = $9, reviews = $10, matched_name = $11, matched_address = $12,
       branch_exact = $13, ranked_url = $14, serp_features = $15, history = $16,
       ai_overview_rank = $17, ai_overview_mentioned = $18, ai_overview_data = $19,
       last_checked_at = NOW(), last_error = NULL, source = 'serper'
     WHERE id = $20 RETURNING *`,
    [best, prevBest, change, mapsRank, row.maps_rank ?? null, orgRank, row.organic_rank ?? null,
      JSON.stringify(res.maps.top), res.maps.match?.rating ?? null, res.maps.match?.reviews ?? null,
      res.maps.match?.title ?? null, res.maps.match?.address ?? null, res.maps.exact ?? null,
      res.organic.url, JSON.stringify(features), JSON.stringify(hist),
      aiOverviewData.rank, aiOverviewData.mentioned, JSON.stringify(aiOverviewData), row.id]
  );
  await db.query('UPDATE visibility_audit_summary SET last_audit_at = NOW(), updated_at = NOW() WHERE id = (SELECT MAX(id) FROM visibility_audit_summary)');
  return r.rows[0];
}

// ── AI engines ───────────────────────────────────────────────────────────────
const AI_ENGINES = {
  chatgpt: { label: 'ChatGPT Search', env: 'OPENAI_API_KEY' },
  perplexity: { label: 'Perplexity AI', env: 'PERPLEXITY_API_KEY' },
  gemini: { label: 'Google Gemini', env: 'GEMINI_API_KEY' },
  google_ai: { label: 'Google AI Overviews', env: 'SERPER_API_KEY' },
};

const AURA_MENTION_RE = /aura\s+(laser|skin|cosmetic|clinic)|dr\.?\s*aditya\s*shah|auralaserclinic|skinnonest/i;

function analyseAnswer(text, citations = []) {
  const body = String(text || '');
  const m = AURA_MENTION_RE.exec(body);
  const urlHit = (citations || []).some((c) => String(c).toLowerCase().includes(TARGET_DOMAIN));
  const mentioned = !!m || urlHit;
  // Position = number of the list item that mentions Aura (1., 2. …) when the answer is a ranked list.
  let position = null;
  if (m) {
    const lines = body.split('\n');
    for (const line of lines) {
      if (AURA_MENTION_RE.test(line)) {
        const n = /^\s*(?:[#*\-\s]*)(\d{1,2})[.)]\s/.exec(line);
        if (n) position = parseInt(n[1], 10);
        break;
      }
    }
  }
  const competitors = [];
  const boldRe = /\*\*([^*]{3,60})\*\*/g;
  let b;
  while ((b = boldRe.exec(body)) && competitors.length < 6) {
    const name = b[1].replace(/[:.]$/, '').trim();
    if (!AURA_MENTION_RE.test(name) && !competitors.includes(name)) competitors.push(name);
  }
  const snippet = body.replace(/\s+/g, ' ').trim().slice(0, 320);
  return { mentioned, position, competitors, snippet };
}

async function askEngine(engine, question) {
  const key = process.env[AI_ENGINES[engine].env];
  if (!key) { const e = new Error(`${AI_ENGINES[engine].env} not configured`); e.code = 'NOT_CONFIGURED'; throw e; }
  if (engine === 'chatgpt') {
    const model = process.env.OPENAI_MODEL || 'gpt-4.1';
    let text = '', cites = [];
    try {
      const j = await postJson('https://api.openai.com/v1/chat/completions', { Authorization: `Bearer ${key}` }, {
        model,
        messages: [{ role: 'user', content: question }]
      }, 28000);
      text = j.choices?.[0]?.message?.content || '';
    } catch (err) {
      if (err.message && (err.message.includes('insufficient_quota') || err.message.includes('credit_balance_exhausted'))) {
        const e = new Error('OpenAI credit limit reached. Please add billing credits at platform.openai.com.');
        e.code = 'INSUFFICIENT_CREDITS';
        throw e;
      }
      if (err.code === 'RATE_LIMITED') throw err;
      // Also attempt responses API if available
      try {
        const j = await postJson('https://api.openai.com/v1/responses', { Authorization: `Bearer ${key}` }, {
          model,
          input: question,
        }, 28000);
        text = j.output_text || (j.output || []).flatMap((o) => o.content || []).filter((c) => c.type === 'output_text').map((c) => c.text).join('\n');
      } catch {
        throw err;
      }
    }
    return { text, citations: cites, answered: !!text };
  }
  if (engine === 'perplexity') {
    const j = await postJson('https://api.perplexity.ai/chat/completions', { Authorization: `Bearer ${key}` }, {
      model: process.env.PERPLEXITY_MODEL || 'sonar', messages: [{ role: 'user', content: question }],
    }, 28000);
    const text = j.choices?.[0]?.message?.content || '';
    const cites = j.citations || (j.search_results || []).map((r) => r.url) || [];
    return { text, citations: cites, answered: !!text };
  }
  if (engine === 'gemini') {
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    let text = '', cites = [];
    try {
      const j = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, { 'Content-Type': 'application/json' }, {
        contents: [{ parts: [{ text: question }] }],
        tools: [{ google_search: {} }]
      }, 28000);
      text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('\n');
      cites = (j.candidates?.[0]?.groundingMetadata?.groundingChunks || []).map((g) => g.web?.uri).filter(Boolean);
    } catch (err) {
      if (err.code === 'RATE_LIMITED') throw err;
      if (err.status === 429 || (err.message && err.message.includes('quota'))) {
        const e = new Error('Gemini daily quota exceeded or rate limited.');
        e.code = 'INSUFFICIENT_CREDITS';
        throw e;
      }
      // Fallback without search grounding if temporary spike
      try {
        const j = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, { 'Content-Type': 'application/json' }, {
          contents: [{ parts: [{ text: question }] }]
        }, 28000);
        text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('\n');
      } catch {
        throw err;
      }
    }
    return { text, citations: cites, answered: !!text };
  }
  // google_ai: AI Overview as returned inside Google's own results.
  const j = await postJson('https://google.serper.dev/search', serperHeaders(), { q: question, gl: 'in', hl: 'en', location: 'Vadodara, Gujarat, India' }, 20000);
  const ov = j.aiOverview || j.ai_overview;
  if (!ov) return { text: '', citations: [], answered: false };
  const text = typeof ov === 'string' ? ov : (ov.text || ov.snippet || JSON.stringify(ov));
  const cites = (ov.sources || ov.references || []).map((s) => s.link || s.url).filter(Boolean);
  return { text, citations: cites, answered: true };
}

// ── Auth (cookie user must exist — same cookie the rest of the app uses) ─────
async function requireUser(req, res, next) {
  try {
    const match = /(?:^|;\s*)aura_user_email=([^;]+)/.exec(req.headers.cookie || '');
    let email = match ? decodeURIComponent(match[1]) : null;
    // Do NOT trust req.query.email or req.body.email — require real cookie session
    if (!email) {
      return res.status(401).json({ success: false, error: 'Unauthenticated', code: 'UNAUTHENTICATED' });
    }
    const u = await db.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND is_active = true', [email.trim()]);
    if (!u.rows.length) {
      return res.status(401).json({ success: false, error: 'User not found or inactive', code: 'USER_NOT_FOUND' });
    }
    req.userId = u.rows[0].id;
    next();
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Auth error', code: 'AUTH_ERROR' });
  }
}
router.use(requireUser);
router.use(async (_req, res, next) => {
  try { await ensureAuditSchema(); next(); } catch (e) { res.status(500).json({ success: false, error: `Audit DB not ready: ${e.message}` }); }
});

// ── Summary (computed from real rows only) ───────────────────────────────────
const rankPoints = (r) => (r ? Math.max(0, (11 - r) / 10) : 0); // #1 → 1.0, #10 → 0.1, none → 0
const round1 = (n) => Math.round(n * 10) / 10;

function buildSummary(keywords, aiQuestions, aiResults, doneFixes) {
  const scanned = keywords.filter((k) => k.source);
  const withRank = scanned.filter((k) => k.current_rank);

  const engines = Object.entries(AI_ENGINES).map(([id, meta]) => {
    const rows = aiResults.filter((r) => r.engine === id);
    const answered = rows.filter((r) => r.answered);
    const mentions = answered.filter((r) => r.mentioned).length;
    return {
      id, engine: meta.label, configured: !!process.env[meta.env],
      asked: rows.length, answered: answered.length, mentions,
      pct: answered.length ? Math.round((mentions / answered.length) * 100) : 0,
      score: answered.length ? `${mentions}/${answered.length}` : null,
    };
  });
  const aiAnswered = engines.reduce((s, e) => s + e.answered, 0);
  const aiMentions = engines.reduce((s, e) => s + e.mentions, 0);

  const branches = BRANCHES.map((b) => {
    const ks = keywords.filter((k) => k.branch === b.name);
    const sc = ks.filter((k) => k.source);
    const ranked = sc.filter((k) => k.current_rank);
    const qIds = aiQuestions.filter((q) => q.branch === b.name).map((q) => q.id);
    const aiRows = aiResults.filter((r) => qIds.includes(r.question_id) && r.answered);
    const aiHits = aiRows.filter((r) => r.mentioned).length;
    const rated = sc.filter((k) => k.rating);
    const rating = rated.length ? round1(rated.reduce((s, k) => s + Number(k.rating), 0) / rated.length) : null;
    const reviews = rated.length ? Math.max(...rated.map((k) => k.reviews || 0)) : null;
    const rankScore = sc.length ? sc.reduce((s, k) => s + rankPoints(k.current_rank), 0) / sc.length : null;
    const aiScore = aiRows.length ? aiHits / aiRows.length : null;
    const ratingScore = rating ? Math.min(1, Math.max(0, (rating - 3) / 2)) : null;
    // Score = 60% local rank, 25% AI mentions, 15% rating — only parts that were actually measured count.
    const parts = [[rankScore, 0.6], [aiScore, 0.25], [ratingScore, 0.15]].filter(([v]) => v !== null);
    const wsum = parts.reduce((s, [, w]) => s + w, 0);
    const score = wsum ? Math.round((parts.reduce((s, [v, w]) => s + v * w, 0) / wsum) * 100) : null;
    return {
      branch: b.name, city: b.city, keywords: ks.length, scanned: sc.length,
      top3: ranked.filter((k) => k.current_rank <= 3).length,
      avgRank: ranked.length ? round1(ranked.reduce((s, k) => s + k.current_rank, 0) / ranked.length) : null,
      notRanked: sc.length - ranked.length,
      rating, reviews, score,
      aiAnswers: aiRows.length ? `${aiHits}/${aiRows.length}` : null,
    };
  });
  const scoredBranches = branches.filter((b) => b.score !== null);
  const networkScore = scoredBranches.length
    ? Math.round(scoredBranches.reduce((s, b) => s + b.score * b.scanned, 0) / Math.max(1, scoredBranches.reduce((s, b) => s + b.scanned, 0)))
    : null;

  // Fix list is generated from real findings (never hardcoded).
  const fixes = [];
  for (const b of branches) {
    if (b.scanned && b.avgRank && b.avgRank > 5) fixes.push({ id: `rank-${b.branch}`, branch: b.branch, impact: 'High', title: `${b.branch}: average Maps rank is #${b.avgRank} — strengthen Google profile (services, photos, posts)` });
    if (b.rating && b.rating < 4.5) fixes.push({ id: `rating-${b.branch}`, branch: b.branch, impact: 'High', title: `${b.branch}: rating ${b.rating}★ — reply to reviews and ask happy patients for reviews` });
    if (b.scanned && b.notRanked > 0) fixes.push({ id: `unranked-${b.branch}`, branch: b.branch, impact: 'Medium', title: `${b.branch}: ${b.notRanked} keyword(s) not in Google Maps top results — add service pages / GBP services` });
  }
  const missed = scanned.filter((k) => !k.current_rank || k.current_rank > 3).slice(0, 3);
  missed.forEach((k) => fixes.push({ id: `kw-${k.id}`, branch: k.branch, impact: 'Medium', title: `"${k.keyword}" is ${k.current_rank ? `#${k.current_rank}` : 'not ranking'} — optimise page + GBP for this search` }));
  engines.filter((e) => e.configured && e.answered && e.pct < 50).forEach((e) => fixes.push({ id: `ai-${e.id}`, branch: 'All', impact: 'Medium', title: `${e.engine} mentions Aura in only ${e.score} answers — add FAQ schema + treatment pages AI can quote` }));

  return {
    networkVisibilityScore: networkScore,
    avgRank: withRank.length ? round1(withRank.reduce((s, k) => s + k.current_rank, 0) / withRank.length) : null,
    top3Count: withRank.filter((k) => k.current_rank <= 3).length,
    top10Count: withRank.filter((k) => k.current_rank <= 10).length,
    scannedKeywords: scanned.length,
    totalKeywords: keywords.length,
    notRankedCount: scanned.length - withRank.length,
    aiMentions: aiAnswered ? `${aiMentions} of ${aiAnswered}` : null,
    aiAnswered, aiMentionsCount: aiMentions,
    lastAuditAt: scanned.reduce((m, k) => (k.last_checked_at && (!m || k.last_checked_at > m) ? k.last_checked_at : m), null),
    branchScores: branches,
    aiVisibility: engines,
    openFixes: fixes.map((f) => ({ ...f, done: doneFixes.includes(f.id) })),
  };
}

// ── GET /api/visibility-audit ────────────────────────────────────────────────
router.get(['/', ''], async (req, res) => {
  try {
    console.log('[Visibility Audit Server] 📡 GET /api/visibility-audit received from IP:', req.ip);
    const keywords = (await db.query(`SELECT * FROM visibility_audit_keywords
      ORDER BY (current_rank IS NULL), current_rank ASC, keyword ASC`)).rows;
    const aiQuestions = (await db.query('SELECT * FROM visibility_audit_ai_questions ORDER BY id')).rows;
    const aiResults = (await db.query('SELECT * FROM visibility_audit_ai_results')).rows;
    const sRow = (await db.query('SELECT open_fixes FROM visibility_audit_summary ORDER BY id DESC LIMIT 1')).rows[0];
    const done = Array.isArray(sRow?.open_fixes) ? sRow.open_fixes : [];

    const categories = {};
    keywords.forEach((k) => { categories[k.category] = (categories[k.category] || 0) + 1; });

    res.json({
      success: true,
      config: {
        google: serperConfigured(),
        serpDepth: SERP_DEPTH,
        engines: Object.fromEntries(Object.entries(AI_ENGINES).map(([id, m]) => [id, { label: m.label, configured: !!process.env[m.env], env: m.env }])),
      },
      branches: BRANCHES.map((b) => ({ name: b.name, city: b.city })),
      summary: buildSummary(keywords, aiQuestions, aiResults, done),
      categories,
      keywords,
      aiQuestions: aiQuestions.map((q) => ({
        ...q,
        results: Object.fromEntries(aiResults.filter((r) => r.question_id === q.id).map((r) => [r.engine, {
          answered: r.answered, mentioned: r.mentioned, position: r.position, snippet: r.snippet,
          competitors: r.competitors, checkedAt: r.checked_at,
        }])),
      })),
    });
  } catch (err) {
    console.error('[API /api/visibility-audit] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /check-keyword — LIVE check of one keyword; returns the real result ─
router.post('/check-keyword', async (req, res) => {
  try {
    const { id } = req.body || {};
    console.log('[Visibility Audit Server] 🔍 check-keyword requested for id:', id);
    if (!id) return res.status(400).json({ success: false, error: 'Keyword id is required' });
    const r = await db.query('SELECT * FROM visibility_audit_keywords WHERE id = $1', [id]);
    if (!r.rows.length) return res.status(404).json({ success: false, error: 'Keyword not found' });
    const row = r.rows[0];
    try {
      const result = await checkGoogleRank(row.keyword, row.branch);
      const saved = await saveKeywordResult(row, result);
      res.json({ success: true, live: true, keyword: saved, checkedDepth: { maps: result.maps.checked, organic: result.organic.checked } });
    } catch (e) {
      await db.query('UPDATE visibility_audit_keywords SET last_error = $1 WHERE id = $2', [e.message.slice(0, 300), id]);
      const status = e.code === 'NOT_CONFIGURED' ? 503 : e.code === 'INVALID_BRANCH' ? 400 : e.code === 'RATE_LIMITED' ? 429 : 502;
      res.status(status).json({ success: false, code: e.code || 'CHECK_FAILED', error: e.message });
    }
  } catch (err) {
    console.error('[API /check-keyword] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /ai/check — LIVE check of one question on one engine ────────────────
router.post('/ai/check', async (req, res) => {
  try {
    const { engine, questionId } = req.body || {};
    console.log('[Visibility Audit Server] 🤖 AI check requested:', { engine, questionId });
    if (!AI_ENGINES[engine]) return res.status(400).json({ success: false, error: 'Unknown engine' });
    const q = (await db.query('SELECT * FROM visibility_audit_ai_questions WHERE id = $1', [questionId])).rows[0];
    if (!q) return res.status(404).json({ success: false, error: 'Question not found' });
    try {
      const ans = await askEngine(engine, q.question);
      const a = ans.answered ? analyseAnswer(ans.text, ans.citations) : { mentioned: false, position: null, competitors: [], snippet: 'No AI Overview shown for this search.' };
      await db.query(
        `INSERT INTO visibility_audit_ai_results (question_id, engine, answered, mentioned, position, snippet, competitors, citations, checked_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
         ON CONFLICT (question_id, engine) DO UPDATE SET answered=$3, mentioned=$4, position=$5, snippet=$6, competitors=$7, citations=$8, checked_at=NOW()`,
        [q.id, engine, ans.answered, a.mentioned, a.position, a.snippet, JSON.stringify(a.competitors), JSON.stringify((ans.citations || []).slice(0, 8))]
      );
      res.json({ success: true, live: true, questionId: q.id, engine, answered: ans.answered, mentioned: a.mentioned, position: a.position, snippet: a.snippet, competitors: a.competitors });
    } catch (e) {
      const status = e.code === 'NOT_CONFIGURED' ? 503 : e.code === 'RATE_LIMITED' ? 429 : e.code === 'INSUFFICIENT_CREDITS' ? 429 : 502;
      res.status(status).json({ success: false, code: e.code || 'CHECK_FAILED', error: e.message });
    }
  } catch (err) {
    console.error('[API /ai/check] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /update-rank — manual override (stored with source = 'manual') ──────
router.post('/update-rank', async (req, res) => {
  try {
    const { id, currentRank } = req.body || {};
    const rankNum = parseInt(currentRank, 10);
    if (!id || !rankNum || rankNum < 1 || rankNum > 100) return res.status(400).json({ success: false, error: 'id and rank (1-100) required' });
    const prev = (await db.query('SELECT * FROM visibility_audit_keywords WHERE id = $1', [id])).rows[0];
    if (!prev) return res.status(404).json({ success: false, error: 'Keyword not found' });
    let hist = Array.isArray(prev.history) ? prev.history : [];
    hist.push({ date: new Date().toISOString().split('T')[0], rank: rankNum, manual: true });
    const r = await db.query(
      `UPDATE visibility_audit_keywords SET current_rank=$1, previous_rank=$2, rank_change=$3, maps_rank=$1,
         history=$4, last_checked_at=NOW(), source='manual' WHERE id=$5 RETURNING *`,
      [rankNum, prev.current_rank, prev.current_rank ? prev.current_rank - rankNum : 0, JSON.stringify(hist.slice(-12)), id]);
    res.json({ success: true, keyword: r.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /add-keyword ────────────────────────────────────────────────────────
router.post('/add-keyword', async (req, res) => {
  try {
    const { keyword, category, branch } = req.body || {};
    if (!keyword || !keyword.trim()) return res.status(400).json({ success: false, error: 'Keyword is required' });
    const br = branchByName(branch);
    if (!br) return res.status(400).json({ success: false, error: `Unknown branch: ${branch}` });
    const ins = await db.query(
      `INSERT INTO visibility_audit_keywords (keyword, category, target_city, branch)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (keyword) DO UPDATE SET category = EXCLUDED.category, branch = EXCLUDED.branch
       RETURNING *`, [keyword.trim(), category || 'General Dermatology', br.city, br.name]);
    let item = ins.rows[0];
    let live = false, checkError = null;
    try { item = await saveKeywordResult(item, await checkGoogleRank(item.keyword, item.branch)); live = true; }
    catch (e) { checkError = e.message; }
    res.json({ success: true, item, live, checkError });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/keyword/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM visibility_audit_keywords WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── POST /toggle-fix — generated fixes; only the "done" ids are stored ───────
router.post('/toggle-fix', async (req, res) => {
  try {
    const { fixId } = req.body || {};
    if (!fixId) return res.status(400).json({ success: false, error: 'fixId required' });
    const s = (await db.query('SELECT id, open_fixes FROM visibility_audit_summary ORDER BY id DESC LIMIT 1')).rows[0];
    // Guard against missing/empty row
    const done = Array.isArray(s?.open_fixes) ? s.open_fixes.filter((x) => typeof x === 'string') : [];
    const updated = done.includes(fixId) ? done.filter((x) => x !== fixId) : [...done, fixId];
    const rowId = s?.id;
    if (!rowId) return res.status(500).json({ success: false, error: 'Summary row missing' });
    await db.query('UPDATE visibility_audit_summary SET open_fixes = $1 WHERE id = $2', [JSON.stringify(updated), rowId]);
    res.json({ success: true, done: updated });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Backward compatibility: server/app.js uses require('./visibility-audit').router
router.router = router;

module.exports = router;