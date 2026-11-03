#!/usr/bin/env node
'use strict';

/**
 * Aura AI — operational test-data reset.
 *
 * Clears ONLY the operational tables the clinic team asked to reset. Every
 * configuration table (users, organizations, settings, leads, lead bank, plays,
 * reports, logs, ...) is preserved.
 *
 * Safety model
 * ------------
 *  - Dry run by default: prints row counts, the exact deletion order, FK checks
 *    and what a storage purge would remove. Nothing is written.
 *  - A real run needs ALL of:
 *      --confirm                       (explicit intent)
 *      CONFIRM_RESET=YES               (environment gate)
 *      --db-host=<host>                (must equal the DATABASE_URL host and be
 *                                       on the allow-list)
 *  - All deletes happen in ONE transaction. Any FK error rolls everything back.
 *  - Only the tables in WIPE_TABLES are touched. If a kept table would be
 *    affected by a cascade, the run is refused.
 *  - Leads are kept unless --include-leads is passed. Because every table that
 *    references leads uses ON DELETE CASCADE, wiping leads also requires
 *    --include-lead-cascade; that flag adds those tables to the explicit list
 *    so nothing is deleted implicitly.
 *  - Local media is only removed with --purge-storage (and never DB rows).
 *
 * Usage
 * -----
 *   node scripts/reset-test-data.js
 *   CONFIRM_RESET=YES node scripts/reset-test-data.js --confirm --db-host=<host>
 *   CONFIRM_RESET=YES node scripts/reset-test-data.js --confirm --db-host=<host> --purge-storage
 *   CONFIRM_RESET=YES node scripts/reset-test-data.js --confirm --db-host=<host> --include-leads --include-lead-cascade
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(`--${name}`);
const argValue = (name) => {
  const prefix = `--${name}=`;
  const found = argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
};

const CONFIRM = hasFlag('confirm');
const CONFIRM_RESET = process.env.CONFIRM_RESET === 'YES';
const INCLUDE_LEAD_CASCADE = hasFlag('include-lead-cascade');
const INCLUDE_LEADS = hasFlag('include-leads') || INCLUDE_LEAD_CASCADE;
const PURGE_STORAGE = hasFlag('purge-storage');
const DB_HOST_ARG = argValue('db-host');
const STORAGE_DIR_ARG = argValue('storage-dir');
const DRY_RUN = !CONFIRM;

// ---------------------------------------------------------------------------
// The explicit reset list (child tables first where it matters; the script
// also derives a guaranteed-safe order from the live FK graph).
// ---------------------------------------------------------------------------
const WIPE_TABLES = [
  // Clinic workflow
  'clinic_visits',
  'clinic_packages',
  'clinic_notes',
  'clinic_reviews',
  'clinic_tasks',
  'clinic_audit',
  'clinic_appointments',
  // Messaging + outreach
  'whatsapp_messages',
  'whatsapp_conversations',
  'email_reply_state',
  'email_replies',
  'outreach_emails',
  // Bulk calling
  'bulk_attempts',
  'bulk_contacts',
  'bulk_campaigns',
  'ai_calls',
  'ai_call_campaigns',
  // Scheduling
  'meeting_transcripts',
  'meetings',
  'touchpoints',
  'appointments',
  'calendly_events',
];

// Tables that reference `leads` with ON DELETE CASCADE. They are config/data the
// user wants to keep, so wiping leads is only possible with an extra explicit
// flag that adds them to the wipe list.
const LEAD_CASCADE_TABLES = [
  'proposals',
  'lead_audits',
  'audit_runs',
  'lead_brain_memory',
  'agent_activities',
  'lead_list_items',
];

// Kept tables worth reporting after the run (proof that config survived).
const KEEP_SPOT_CHECK = [
  'users',
  'organizations',
  'clinic_settings',
  'smtp_settings',
  'whatsapp_settings',
  'branding_settings',
  'automations',
  'leads',
  'lead_bank',
  'play_leads',
  'funnel_events',
  'daily_reports',
  'debug_logs',
  'batch_jobs',
  'fetch_runs',
  'messages',
  'hubspot_inbox_threads',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function quoteIdent(name) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error(`Unsafe identifier: ${name}`);
  return `"${name}"`;
}

function maskConnection(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}${u.search ? '?…' : ''}`;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

function isAllowListedHost(host) {
  if (!host) return false;
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
  if (/\.neon\.tech$/i.test(host)) return true;
  if (/\.supabase\.co$/i.test(host)) return true;
  const extra = (process.env.RESET_ALLOWED_DB_HOSTS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return extra.includes(host);
}

async function countIfExists(client, table) {
  try {
    const r = await client.query(`SELECT COUNT(*)::int AS n FROM ${quoteIdent(table)}`);
    return { exists: true, count: r.rows[0].n };
  } catch {
    return { exists: false, count: 0 };
  }
}

async function loadForeignKeyGraph(client, tables) {
  const r = await client.query(
    `SELECT tc.table_name AS child,
            ccu.table_name AS parent,
            kcu.column_name AS child_column,
            rc.delete_rule AS delete_rule
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
       JOIN information_schema.referential_constraints rc
         ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
        AND (tc.table_name = ANY($1) OR ccu.table_name = ANY($1))`,
    [tables]
  );
  return r.rows;
}

/**
 * Child-before-parent order for the wiped tables. Cycles (rare) fall back to
 * the original order for whatever is left.
 */
function deletionOrder(tables, edges) {
  const inSet = new Set(tables);
  const deps = new Map(tables.map((t) => [t, new Set()])); // table -> parents it points at
  for (const e of edges) {
    if (inSet.has(e.child) && inSet.has(e.parent) && e.child !== e.parent) {
      deps.get(e.child).add(e.parent);
    }
  }
  const ordered = [];
  const done = new Set();
  let guard = tables.length * tables.length + 1;
  while (ordered.length < tables.length && guard-- > 0) {
    for (const t of tables) {
      if (done.has(t)) continue;
      const parents = [...deps.get(t)].filter((p) => !done.has(p));
      if (parents.length === 0) {
        ordered.push(t);
        done.add(t);
      }
    }
  }
  for (const t of tables) if (!done.has(t)) ordered.push(t);
  return ordered;
}

function findKeptCascadeRisks(edges, wipeSet) {
  return edges.filter(
    (e) => wipeSet.has(e.parent) && !wipeSet.has(e.child) && e.delete_rule === 'CASCADE'
  );
}

// ---------------------------------------------------------------------------
// Storage purge (local media only; never touches the database)
// ---------------------------------------------------------------------------
function resolveStorageDir() {
  const raw = STORAGE_DIR_ARG || process.env.RESET_STORAGE_DIR;
  if (!raw) return null;
  return path.resolve(process.cwd(), raw);
}

function walkFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, acc);
    else acc.push(full);
  }
  return acc;
}

async function purgeStorage() {
  if (!PURGE_STORAGE) {
    console.log('Storage : skipped (pass --purge-storage to remove local media)');
    return { purged: false, files: 0 };
  }
  const dir = resolveStorageDir();
  if (!dir) {
    console.log('Storage : skipped (set --storage-dir=<path> or RESET_STORAGE_DIR)');
    return { purged: false, files: 0 };
  }
  if (!fs.existsSync(dir)) {
    console.log(`Storage : skipped (${dir} does not exist)`);
    return { purged: false, files: 0 };
  }
  const root = path.resolve(process.cwd());
  if (dir === root || path.dirname(dir) === dir) {
    throw new Error(`Refusing to purge unsafe storage directory: ${dir}`);
  }

  const files = walkFiles(dir);
  const bytes = files.reduce((sum, f) => {
    try { return sum + fs.statSync(f).size; } catch { return sum; }
  }, 0);
  const mb = (bytes / (1024 * 1024)).toFixed(2);

  if (DRY_RUN) {
    console.log(`Storage : would delete ${files.length} file(s), ${mb} MB from ${dir}`);
    return { purged: false, files: files.length, dryRun: true };
  }

  for (const file of files) fs.unlinkSync(file);
  console.log(`Storage : deleted ${files.length} file(s), ${mb} MB from ${dir}`);
  return { purged: true, files: files.length };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('ERROR: DATABASE_URL is not set.');
    process.exit(1);
  }

  let dbHost;
  try {
    dbHost = new URL(dbUrl).hostname;
  } catch {
    console.error('ERROR: DATABASE_URL is not a valid connection string.');
    process.exit(1);
  }

  // ---- gate: real runs require confirm + env + matching allow-listed host ----
  if (!DRY_RUN) {
    if (!CONFIRM_RESET) {
      console.error('REFUSED: real run requires CONFIRM_RESET=YES in the environment.');
      process.exit(1);
    }
    if (!DB_HOST_ARG) {
      console.error(`REFUSED: real run requires --db-host=${dbHost}`);
      process.exit(1);
    }
    if (DB_HOST_ARG !== dbHost) {
      console.error(`REFUSED: --db-host=${DB_HOST_ARG} does not match DATABASE_URL host ${dbHost}`);
      process.exit(1);
    }
    if (!isAllowListedHost(dbHost)) {
      console.error(`REFUSED: ${dbHost} is not on the allow-list (RESET_ALLOWED_DB_HOSTS).`);
      process.exit(1);
    }
  }

  const wipe = [...WIPE_TABLES];
  const leadCascade = [...LEAD_CASCADE_TABLES];

  if (INCLUDE_LEADS) {
    wipe.push('leads');
  }
  if (INCLUDE_LEAD_CASCADE) {
    for (const t of leadCascade) if (!wipe.includes(t)) wipe.push(t);
  }

  console.log('Aura AI — operational test-data reset');
  console.log('=====================================');
  console.log(`Database : ${maskConnection(dbUrl)}`);
  console.log(`Mode     : ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE RUN'}`);
  console.log(`Leads    : ${INCLUDE_LEADS ? (INCLUDE_LEAD_CASCADE ? 'WIPE (incl. lead-owned tables)' : 'WIPE requested but blocked') : 'KEEP (default)'}`);
  console.log('');

  const client = new Client({
    connectionString: dbUrl,
    ssl: /localhost|127\.0\.0\.1/.test(dbHost) ? false : { rejectUnauthorized: false },
  });

  await client.connect();
  console.log(`Connected: ${dbHost}`);

  try {
    const edges = await loadForeignKeyGraph(client, wipe);
    const wipeSet = new Set(wipe);

    // ---- leads gate -------------------------------------------------------
    if (INCLUDE_LEADS && !INCLUDE_LEAD_CASCADE) {
      const leadDeps = (
        await loadForeignKeyGraph(client, ['leads'])
      ).filter((e) => e.parent === 'leads' && e.child !== 'leads');

      const cascade = leadDeps.filter((e) => e.delete_rule === 'CASCADE' && !wipeSet.has(e.child));
      if (cascade.length > 0) {
        console.error('\nBLOCKED: deleting leads would cascade into tables you asked to keep:');
        for (const e of cascade) console.error(`  - ${e.child} (${e.child}.${e.child_column} -> leads, ON DELETE CASCADE)`);
        console.error('\nRe-run with --include-lead-cascade to also wipe those tables explicitly,');
        console.error('or drop --include-leads to keep leads (default).');
        if (!DRY_RUN) {
          process.exitCode = 1;
          return;
        }
      }
    }

    // ---- kept -> wipe cascade check -------------------------------------
    const risks = findKeptCascadeRisks(edges, wipeSet);
    if (risks.length > 0) {
      console.error('\nBLOCKED: these KEPT tables would be emptied by ON DELETE CASCADE:');
      for (const e of risks) console.error(`  - ${e.child} (${e.child}.${e.child_column} -> ${e.parent})`);
      console.error('\nAdd them to WIPE_TABLES only if you really want them cleared.');
      if (!DRY_RUN) {
        process.exitCode = 1;
        return;
      }
    }

    // ---- counts + order --------------------------------------------------
    const counts = new Map();
    for (const t of wipe) counts.set(t, await countIfExists(client, t));

    const order = deletionOrder(wipe, edges);
    const totalRows = [...counts.values()].reduce((sum, c) => sum + (c.exists ? c.count : 0), 0);

    console.log('\nTables to wipe (child tables first):');
    console.log('------------------------------------');
    order.forEach((t, i) => {
      const c = counts.get(t);
      const label = c.exists ? `${c.count} row(s)` : 'table missing — skipped';
      console.log(`  ${String(i + 1).padStart(2, ' ')}. ${t.padEnd(26, '.')} ${label}`);
    });
    console.log(`\n  TOTAL: ${totalRows} row(s) across ${wipe.length} table(s)`);

    const keptLeads = await countIfExists(client, 'leads');
    if (!INCLUDE_LEADS) {
      console.log(`  leads is KEPT: ${keptLeads.exists ? `${keptLeads.count} row(s)` : 'table missing'}`);
    }

    console.log('\nKept configuration (spot check):');
    console.log('--------------------------------');
    for (const t of KEEP_SPOT_CHECK) {
      if (INCLUDE_LEADS && t === 'leads') continue;
      const c = await countIfExists(client, t);
      if (c.exists) console.log(`  ${t.padEnd(26, '.')} ${c.count} row(s)`);
    }

    if (risks.length === 0) {
      console.log('\nFK safety: no KEPT table references a table in the wipe list.');
    }

    // ---- storage preview / purge ---------------------------------------
    const storagePreview = await purgeStorage();

    if (DRY_RUN) {
      console.log('\nDRY RUN COMPLETE — nothing was deleted.');
      console.log(`To execute: CONFIRM_RESET=YES node scripts/reset-test-data.js --confirm --db-host=${dbHost}`);
      if (PURGE_STORAGE && storagePreview.files > 0) {
        console.log('            (add --purge-storage to also delete local media)');
      }
      return;
    }

    // ---- live run --------------------------------------------------------
    console.log('\nStarting LIVE reset (single transaction)...');
    await client.query('BEGIN');
    try {
      await client.query('SET LOCAL statement_timeout = 0');
      for (const t of order) {
        const c = counts.get(t);
        if (!c.exists) {
          console.log(`  skip ${t} (missing)`);
          continue;
        }
        const r = await client.query(`DELETE FROM ${quoteIdent(t)}`);
        console.log(`  deleted ${r.rowCount} row(s) from ${t}`);
      }
      await client.query('COMMIT');
      console.log('Transaction committed.');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`Reset failed and was rolled back: ${err.message}`);
      throw err;
    }

    // ---- post-run verification -----------------------------------------
    console.log('\nVerification (remaining row counts):');
    console.log('------------------------------------');
    let failures = 0;
    for (const t of wipe) {
      const c = await countIfExists(client, t);
      if (c.exists && c.count !== 0) {
        failures++;
        console.log(`  FAIL ${t.padEnd(26, '.')} ${c.count} row(s) still present`);
      } else {
        console.log(`  ok   ${t.padEnd(26, '.')} 0 row(s)`);
      }
    }

    console.log('\nPreserved configuration:');
    console.log('------------------------');
    for (const t of KEEP_SPOT_CHECK) {
      if (INCLUDE_LEADS && t === 'leads') continue;
      const c = await countIfExists(client, t);
      if (c.exists) console.log(`  ${t.padEnd(26, '.')} ${c.count} row(s)`);
    }

    if (failures > 0) {
      console.error(`\nReset finished with ${failures} table(s) not empty.`);
      process.exitCode = 1;
    } else {
      console.log('\nReset complete. All requested operational tables are empty.');
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
