#!/usr/bin/env node
/**
 * Cleanup duplicate and orphaned passcodes.
 *
 * 1. Deactivate passcodes for source (now-inactive) companies from the merges:
 *    omnilux, robin-hood, topo, soapbox, smart-sweets
 *
 * 2. For companies with duplicate active passcodes, keep the oldest, deactivate newer.
 */
import { createClient } from '@supabase/supabase-js';
global.WebSocket = class WebSocket {};

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function main() {
  console.log('=== PASSCODE CLEANUP ===\n');

  // ── 1. Deactivate passcodes for merged (now-inactive) companies ──────────
  const inactiveSlugs = ['omnilux', 'robin-hood', 'topo', 'soapbox', 'smart-sweets'];

  const { data: inactiveCompanies } = await db
    .from('companies')
    .select('id, name, slug, is_active')
    .in('slug', inactiveSlugs);

  console.log('Inactive companies from merges:');
  for (const co of inactiveCompanies || []) {
    console.log(`  ${co.is_active ? '⚠ STILL ACTIVE' : '✓ inactive'}: ${co.name} (${co.slug})`);
  }

  const inactiveIds = (inactiveCompanies || []).map(c => c.id);

  if (inactiveIds.length > 0) {
    const { data: orphanPasscodes } = await db
      .from('passcodes')
      .select('id, code, company_id, status')
      .in('company_id', inactiveIds)
      .eq('status', 'active');

    console.log(`\nOrphaned active passcodes for inactive companies: ${orphanPasscodes?.length || 0}`);
    for (const p of orphanPasscodes || []) {
      const co = inactiveCompanies?.find(c => c.id === p.company_id);
      console.log(`  ${p.code} → ${co?.name} (${co?.slug})`);
    }

    if (orphanPasscodes?.length) {
      const { error } = await db
        .from('passcodes')
        .update({ status: 'inactive' })
        .in('id', orphanPasscodes.map(p => p.id));
      if (error) {
        console.error('  ERROR deactivating orphaned passcodes:', error.message);
      } else {
        console.log(`  ✓ Deactivated ${orphanPasscodes.length} orphaned passcode(s)`);
      }
    }
  }

  // ── 2. Find duplicate active passcodes (same company_id, status=active) ─
  console.log('\n── Checking for duplicate passcodes ──');

  const { data: allActive } = await db
    .from('passcodes')
    .select('id, code, company_id, description, status, created_at')
    .eq('status', 'active')
    .order('created_at', { ascending: true });

  // Group by company_id
  const byCompany = {};
  for (const p of allActive || []) {
    if (!byCompany[p.company_id]) byCompany[p.company_id] = [];
    byCompany[p.company_id].push(p);
  }

  const toDeactivate = [];
  for (const [companyId, passcodes] of Object.entries(byCompany)) {
    if (passcodes.length > 1) {
      // Keep oldest (first in sorted list), deactivate the rest
      const [keep, ...dupes] = passcodes;
      toDeactivate.push(...dupes);
    }
  }

  // Look up company names for reporting
  const dupeCompanyIds = [...new Set(toDeactivate.map(p => p.company_id))];
  const { data: dupeCompanies } = dupeCompanyIds.length
    ? await db.from('companies').select('id, name, slug').in('id', dupeCompanyIds)
    : { data: [] };
  const coMap = {};
  for (const c of dupeCompanies || []) coMap[c.id] = c;

  console.log(`\nDuplicate passcodes to deactivate (keeping oldest per company): ${toDeactivate.length}`);
  for (const p of toDeactivate) {
    const co = coMap[p.company_id];
    console.log(`  DEACTIVATE ${p.code} → ${co?.name} (${co?.slug}) created: ${p.created_at?.slice(0, 19)}`);
  }

  if (toDeactivate.length > 0) {
    const { error } = await db
      .from('passcodes')
      .update({ status: 'inactive' })
      .in('id', toDeactivate.map(p => p.id));
    if (error) {
      console.error('  ERROR deactivating duplicates:', error.message);
    } else {
      console.log(`  ✓ Deactivated ${toDeactivate.length} duplicate passcode(s)`);
    }
  }

  // ── Final summary ────────────────────────────────────────────────────────
  const { data: finalCount } = await db
    .from('passcodes')
    .select('id, status')
    .eq('status', 'active');
  console.log(`\n✅ Done. Active passcodes remaining: ${finalCount?.length || 0}`);
}

main().catch(e => { console.error(e); process.exit(1); });
