#!/usr/bin/env node
'use strict';

/**
 * Backfill appointment -> AI call links.
 *
 * Dry run (default) prints:
 *   appointment id | type | patient/phone | old call -> new call
 *
 * Real run writes the matched call_id:
 *   node scripts/backfill-appointment-calls.js --apply
 *
 * Matching rules live in server/appointment-call-match.js:
 *   1. exact metadata interaction_id
 *   2. same phone + outcome='booked' inside booking.createdAt -60m .. +5m
 *   3. same phone whose summary/transcript mentions the slot date + time
 *   4. no call (never "latest call by phone")
 *
 * Existing non-null call_id values are treated as manual links and are kept.
 */

require('dotenv').config();
const db = require('../server/db');
const { pickCallForAppointment, phoneLast10 } = require('../server/appointment-call-match');

const APPLY = process.argv.includes('--apply');

function toAppointment(row, type) {
  const questions = row.questions || {};
  const phone = questions['Phone / WhatsApp'] || questions.phone || row.phone || '';
  return {
    ...row,
    _table: type,
    phone,
    starts_at: row.starts_at || row.start_time,
    booking_metadata: row.booking_metadata || row.metadata || null,
    booking_created_at: row.booking_created_at || null,
  };
}

function label(row) {
  return row.patient_name || row.invitee_name || questionsPhone(row) || `#${row.id}`;
}

function questionsPhone(row) {
  const q = row.questions || {};
  return q['Phone / WhatsApp'] || q.phone || row.phone || '';
}

async function main() {
  const callsRes = await db.query(
    `SELECT id, conversation_id, to_phone, lead_name, status, outcome, duration_secs,
            recording_url, transcript, transcript_summary, started_at
       FROM ai_calls
      ORDER BY started_at DESC NULLS LAST, id DESC`
  );
  const byPhone = new Map();
  for (const c of callsRes.rows) {
    const last10 = phoneLast10(c.to_phone);
    if (!last10) continue;
    if (!byPhone.has(last10)) byPhone.set(last10, []);
    byPhone.get(last10).push(c);
  }

  const [clinicRes, calRes] = await Promise.all([
    db.query('SELECT * FROM clinic_appointments ORDER BY starts_at DESC'),
    db.query('SELECT * FROM calendly_events WHERE COALESCE(is_deleted, false) = false ORDER BY start_time DESC'),
  ]);

  const rows = [
    ...clinicRes.rows.map(r => ({ type: 'clinic', appt: toAppointment(r, 'clinic_appointments') })),
    ...calRes.rows.map(r => ({ type: 'cal', appt: toAppointment(r, 'calendly_events') })),
  ];

  console.log(`Mode: ${APPLY ? 'APPLY (writes call_id)' : 'DRY RUN (no writes)'}`);
  console.log(`Appointments: ${rows.length} · calls: ${callsRes.rows.length}`);
  console.log('-----------------------------------------------------------------------');

  let matched = 0;
  let skipped = 0;
  let written = 0;

  for (const { type, appt } of rows) {
    const oldId = appt.call_id == null ? null : Number(appt.call_id);
    if (oldId) {
      skipped++;
      console.log(`#${appt.id} ${type} ${align(label(appt))} | call ${oldId} (existing link kept)`);
      continue;
    }
    const candidates = byPhone.get(phoneLast10(appt.phone)) || [];
    const call = pickCallForAppointment(appt, candidates);
    const newId = call ? Number(call.id) : null;
    const status = newId ? 'match' : 'no match';
    console.log(`#${appt.id} ${type} ${align(label(appt))} | ${oldId ?? 'null'} -> ${newId ?? 'null'} (${status})`);
    if (newId) {
      matched++;
      if (APPLY) {
        const table = type === 'cal' ? 'calendly_events' : 'clinic_appointments';
        await db.query(`UPDATE ${table} SET call_id = $1 WHERE id = $2 AND call_id IS NULL`, [newId, appt.id]);
        written++;
      }
    }
  }

  console.log('-----------------------------------------------------------------------');
  console.log(`Matched: ${matched} · no match: ${rows.length - matched - skipped} · existing links kept: ${skipped}`);
  if (APPLY) console.log(`Wrote call_id on ${written} appointments.`);
  else console.log('Dry run only. Re-run with --apply to write.');
}

function align(value, width = 28) {
  const s = String(value || '');
  return (s.length >= width ? s.slice(0, width - 1) + '…' : s.padEnd(width)).slice(0, width);
}

main()
  .then(() => db.pool.end())
  .catch(async (err) => {
    console.error('Backfill failed:', err);
    try { await db.pool.end(); } catch { /* ignore */ }
    process.exit(1);
  });
