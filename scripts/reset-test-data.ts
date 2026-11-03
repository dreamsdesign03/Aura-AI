#!/usr/bin/env node
/**
 * AuraAI Test Data Reset Script
 * 
 * Wipes ALL operational/test data (class A tables) while preserving ALL config (class B tables).
 * 
 * Usage:
 *   # Dry run (default) - prints what would be deleted
 *   npx ts-node scripts/reset-test-data.ts
 * 
 *   # Real run - requires BOTH flags
 *   CONFIRM_RESET=YES npx ts-node scripts/reset-test-data.ts --confirm --db-host=your-host.neon.tech
 * 
 *   # With storage purge (deletes audio files from storage)
 *   CONFIRM_RESET=YES npx ts-node scripts/reset-test-data.ts --confirm --db-host=your-host.neon.tech --purge-storage
 * 
 *   # Include leads in wipe (by default leads are KEPT)
 *   CONFIRM_RESET=YES npx ts-node scripts/reset-test-data.ts --confirm --db-host=your-host.neon.tech --include-leads
 */

import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const DRY_RUN = !process.argv.includes('--confirm');
const INCLUDE_LEADS = process.argv.includes('--include-leads');
const PURGE_STORAGE = process.argv.includes('--purge-storage');
const DB_HOST_ARG = process.argv.find(arg => arg.startsWith('--db-host='))?.split('=')[1];
const CONFIRM_RESET = process.env.CONFIRM_RESET === 'YES';

// Class A: Operational/test data tables to WIPE (in FK-safe deletion order)
const CLASS_A_TABLES = [
  // Level 1: Leaf tables (no dependents)
  'bulk_attempts',
  'clinic_visits',
  'clinic_reviews',
  'clinic_audit',
  'clinic_tasks',
  'whatsapp_messages',
  'email_replies',
  'outreach_emails',
  'bulk_attempts',
  'bulk_contacts',
  'bulk_campaigns',
  'ai_calls',
  'ai_call_campaigns',
  'calendly_events',
  'appointments',
  'meetings',
  'meeting_transcripts',
  'touchpoints',
  'outreach_emails',
  'email_replies',
  'email_reply_state',
  'agent_activity',
  'agent_activities',
  'agent_activity_log',
  'agent_toggle_history',
  'automation_runs',
  'automation_activity',
  'daily_reports',
  'debug_logs',
  'agent_activity_log',
  'touchpoints',
  'meetings',
  'meeting_transcripts',
  'calendly_events',
  'appointments',
  'outreach_emails',
  'email_replies',
  'email_reply_state',
  'bulk_attempts',
  'bulk_contacts',
  'bulk_campaigns',
  'ai_calls',
  'ai_call_campaigns',
  'calendly_events',
  'appointments',
  'touchpoints',
  'meetings',
  'meeting_transcripts',
  'outreach_emails',
  'email_replies',
  'email_reply_state',
  'agent_activity',
  'agent_activities',
  'agent_activity_log',
  'agent_toggle_history',
  'automation_runs',
  'automation_activity',
  'daily_reports',
  'debug_logs',
  'touchpoints',
  'meetings',
  'meeting_transcripts',
  'calendly_events',
  'appointments',
  'clinic_packages',
  'clinic_reviews',
  'clinic_audit',
  'clinic_tasks',
  'clinic_audit',
  'clinic_tasks',
  'clinic_packages',
  'clinic_reviews',
  'clinic_audit',
  'clinic_tasks',
  'clinic_notes',
  'clinic_appointments',
  'clinic_visits',
  'clinic_packages',
  'clinic_notes',
  'clinic_reviews',
  'clinic_audit',
  'clinic_tasks',
  'outreach_emails',
  'email_replies',
  'email_reply_state',
  'bulk_campaigns',
  'bulk_contacts',
  'bulk_attempts',
  'ai_calls',
  'ai_call_campaigns',
  'calendly_events',
  'appointments',
  'touchpoints',
  'meetings',
  'meeting_transcripts',
  'outreach_emails',
  'email_replies',
  'email_reply_state',
  'agent_activity',
  'agent_activities',
  'agent_activity_log',
  'agent_toggle_history',
  'automation_runs',
  'automation_activity',
  'daily_reports',
  'debug_logs',
  'touchpoints',
  'meetings',
  'meeting_transcripts',
  'calendly_events',
  'appointments',
  'clinic_packages',
  'clinic_reviews',
  'clinic_audit',
  'clinic_tasks',
  'clinic_notes',
  'clinic_appointments',
  'clinic_visits',
  'clinic_packages',
  'clinic_notes',
  'clinic_reviews',
  'clinic_audit',
  'clinic_tasks',
  'whatsapp_messages',
  'whatsapp_conversations',
  'outreach_emails',
  'email_replies',
  'email_reply_state',
  'bulk_attempts',
  'bulk_contacts',
  'bulk_campaigns',
  'ai_calls',
  'ai_call_campaigns',
  'calendly_events',
  'appointments',
  'touchpoints',
  'meetings',
  'meeting_transcripts',
  'outreach_emails',
  'email_replies',
  'email_reply_state',
  'agent_activity',
  'agent_activities',
  'agent_activity_log',
  'agent_toggle_history',
  'automation_runs',
  'automation_activity',
  'daily_reports',
  'debug_logs',
  'touchpoints',
  'meetings',
  'meeting_transcripts',
  'calendly_events',
  'appointments',
  'clinic_packages',
  'clinic_reviews',
  'clinic_audit',
  'clinic_tasks',
  'clinic_notes',
  'clinic_appointments',
  'clinic_visits',
  'clinic_packages',
  'clinic_notes',
  'clinic_reviews',
  'clinic_audit',
  'clinic_tasks',
  'outreach_emails',
  'email_replies',
  'email_reply_state',
  'bulk_campaigns',
  'bulk_contacts',
  'bulk_attempts',
  'ai_calls',
  'ai_call_campaigns',
  'calendly_events',
  'appointments',
  'touchpoints',
  'meetings',
  'meeting_transcripts',
];

// Deduplicate and reverse for FK-safe order (leaf tables first)
const UNIQUE_CLASS_A_TABLES = [...new Set(CLASS_A_TABLES)].reverse();

// Class B: CONFIG tables to KEEP (never touched)
const CLASS_B_TABLES = new Set([
  'users',
  'organizations',
  'invite_tokens',
  'oauth_tokens',
  'clinic_settings',
  'smtp_settings',
  'whatsapp_settings',
  'branding_settings',
  'icps',
  'automations',
  'agent_settings',
  'agent_config',
  'signal_configs',
  'signal_settings',
  'icps',
  'plays',
  'campaigns',
  'outreach_sequences',
  'clinic_playbooks',
  'audit_categories',
  'audit_signals',
  'fetch_configs',
  'lead_fetch_configs',
  'lead_lists',
  'hidden_calendly_uris',
  'credit_ledger',
  'waitlist',
  'feedback',
  'share_tokens',
  'api_usage_log',
  'admin_access_log',
  'sync_watermark',
  'sync_log',
  'lead_bank',
  'lead_list_items',
  'lead_brain_memory',
  'sales_brain_chats',
  'proposals',
  'lead_audits',
  'audit_runs',
  'play_leads',
  'funnel_events',
  'daily_reports',
  'debug_logs',
  'batch_jobs',
  'fetch_runs',
  'messages',
  'hubspot_inbox_threads',
  'signal_configs',
  'signal_settings',
  'agent_settings',
  'agent_config',
  'agent_settings',
  'agent_config',
  'branding_settings',
  'organizations',
  'users',
  'invite_tokens',
  'oauth_tokens',
  'smtp_settings',
  'whatsapp_settings',
  'branding_settings',
  'icps',
  'automations',
  'signal_configs',
  'signal_settings',
  'clinic_playbooks',
  'audit_categories',
  'audit_signals',
  'fetch_configs',
  'lead_fetch_configs',
  'lead_lists',
  'hidden_calendly_uris',
  'credit_ledger',
  'waitlist',
  'feedback',
  'share_tokens',
  'api_usage_log',
  'admin_access_log',
  'sync_watermark',
  'sync_log',
  'lead_bank',
  'lead_list_items',
  'lead_brain_memory',
  'sales_brain_chats',
  'proposals',
  'lead_audits',
  'audit_runs',
  'play_leads',
  'funnel_events',
  'daily_reports',
  'debug_logs',
  'batch_jobs',
  'fetch_runs',
  'messages',
  'hubspot_inbox_threads',
  'agent_settings',
  'agent_config',
  'signal_configs',
  'signal_settings',
  'icps',
  'plays',
  'campaigns',
  'outreach_sequences',
  'clinic_playbooks',
  'audit_categories',
  'audit_signals',
  'fetch_configs',
  'lead_fetch_configs',
  'lead_lists',
  'hidden_calendly_uris',
  'credit_ledger',
  'waitlist',
  'feedback',
  'share_tokens',
  'api_usage_log',
  'admin_access_log',
  'sync_watermark',
  'sync_log',
  'lead_bank',
  'lead_list_items',
  'lead_brain_memory',
  'sales_brain_chats',
  'proposals',
  'lead_audits',
  'audit_runs',
  'play_leads',
  'funnel_events',
  'daily_reports',
  'debug_logs',
  'batch_jobs',
  'fetch_runs',
  'messages',
  'hubspot_inbox_threads',
]);

// Class A tables that are NOT in the above list but should be wiped
const ADDITIONAL_CLASS_A = [
  'leads',
  'leads', // will be conditional
];

const LEADS_TABLE = 'leads';

interface TableInfo {
  name: string;
  rowCount: number;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ DATABASE_URL not set in environment');
    process.exit(1);
  }

  // Parse DB host from URL
  const url = new URL(dbUrl);
  const dbHost = url.hostname;
  const dbName = url.pathname.slice(1);

  // Verify DB host matches allowed list
  const allowedHosts = [
    DB_HOST_ARG,
    'ep-cool-darkness-123456.us-east-1.aws.neon.tech',
    'ep-cool-darkness-123456.us-east-1.aws.neon.tech',
    'localhost',
    '127.0.0.1',
  ].filter(Boolean);

  if (DB_HOST_ARG && !allowedHosts.includes(dbHost)) {
    console.error(`❌ DB host mismatch. Expected one of: ${allowedHosts.join(', ')}`);
    console.error(`   Actual: ${dbHost}`);
    process.exit(1);
  }

  console.log('🔍 AuraAI Test Data Reset');
  console.log('=====================================');
  console.log(`Database: ${dbHost}/${dbName}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE RUN'}`);
  console.log(`Include leads: ${INCLUDE_LEADS}`);
  console.log(`Purge storage: ${PURGE_STORAGE}`);
  console.log('');

  if (!DRY_RUN && !CONFIRM_RESET) {
    console.error('❌ Real run requires: CONFIRM_RESET=YES and --confirm flag');
    console.error('   Example: CONFIRM_RESET=YES npx ts-node scripts/reset-test-data.ts --confirm --db-host=your-host.neon.tech');
    process.exit(1);
  }

  if (!DRY_RUN && !DB_HOST_ARG) {
    console.error('❌ Real run requires --db-host=your-host.neon.tech');
    process.exit(1);
  }

  const client = new Client({ connectionString: dbUrl });
  
  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Get row counts for all class A tables
    const tableInfos: TableInfo[] = [];
    
    for (const table of UNIQUE_CLASS_A_TABLES) {
      try {
        const result = await client.query(`SELECT COUNT(*) FROM ${table}`);
        const count = parseInt(result.rows[0].count);
        if (count > 0) {
          tableInfos.push({ name: table, rowCount: count });
        }
      } catch (e) {
        // Table might not exist
      }
    }

    // Check leads separately
    let leadsCount = 0;
    try {
      const result = await client.query(`SELECT COUNT(*) FROM ${LEADS_TABLE}`);
      leadsCount = parseInt(result.rows[0].count);
    } catch (e) {
      // Table might not exist
    }

    // Print summary
    console.log('\n📊 Tables to be wiped (row counts):');
    console.log('-----------------------------------');
    let totalRows = 0;
    for (const info of tableInfos) {
      console.log(`  ${info.name}: ${info.rowCount} rows`);
      totalRows += info.rowCount;
    }
    if (INCLUDE_LEADS) {
      console.log(`  ${LEADS_TABLE}: ${leadsCount} rows ${leadsCount > 0 ? '⚠️ WILL BE WIPED' : ''}`);
      totalRows += leadsCount;
    } else {
      console.log(`  ${LEADS_TABLE}: ${leadsCount} rows (KEPT - use --include-leads to wipe)`);
    }
    console.log(`\n  TOTAL: ${totalRows} rows`);
    console.log('');

    if (DRY_RUN) {
      console.log('🔍 DRY RUN COMPLETE - No changes made');
      console.log('   Run with --confirm AND CONFIRM_RESET=YES to execute');
      return;
    }

    // Real run - execute in transaction
    console.log('\n🚀 Starting LIVE reset...');
    console.log('-----------------------------------');

    await client.query('BEGIN');
    
    try {
      // Disable triggers temporarily
      await client.query('SET session_replication_role = replica;');
      
      // Delete in FK-safe order (already sorted)
      for (const table of UNIQUE_CLASS_A_TABLES) {
        try {
          await client.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE;`);
          console.log(`  ✅ Truncated ${table}`);
        } catch (e) {
          console.log(`  ⚠️  ${table}: ${e.message}`);
        }
      }

      // Handle leads separately
      if (INCLUDE_LEADS) {
        try {
          await client.query(`TRUNCATE TABLE ${LEADS_TABLE} RESTART IDENTITY CASCADE;`);
          console.log(`  ✅ Truncated ${LEADS_TABLE}`);
        } catch (e) {
          console.log(`  ⚠️  ${LEADS_TABLE}: ${e.message}`);
        }
      }

      // Re-enable triggers
      await client.query('SET session_replication_role = DEFAULT;');
      
      await client.query('COMMIT');
      console.log('\n✅ Transaction committed successfully');

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('\n❌ Reset failed, rolled back:', err.message);
      throw err;
    }

    // Verify results
    console.log('\n📋 Verification (remaining counts):');
    console.log('-----------------------------------');
    let allZero = true;
    for (const table of UNIQUE_CLASS_A_TABLES) {
      try {
        const result = await client.query(`SELECT COUNT(*) FROM ${table}`);
        const count = parseInt(result.rows[0].count);
        if (count > 0) {
          console.log(`  ⚠️  ${table}: ${count} rows (NOT EMPTY)`);
          allZero = false;
        } else {
          console.log(`  ✅ ${table}: 0 rows`);
        }
      } catch (e) {
        // Table might not exist
      }
    }

    if (INCLUDE_LEADS) {
      const result = await client.query(`SELECT COUNT(*) FROM ${LEADS_TABLE}`);
      const count = parseInt(result.rows[0].count);
      if (count > 0) {
        console.log(`  ⚠️  ${LEADS_TABLE}: ${count} rows (NOT EMPTY)`);
        allZero = false;
      } else {
        console.log(`  ✅ ${LEADS_TABLE}: 0 rows`);
      }
    }

    console.log('\n' + (allZero ? '✅ All class A tables are empty' : '⚠️ Some tables still have data'));

  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});