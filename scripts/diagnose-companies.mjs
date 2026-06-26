#!/usr/bin/env node
/**
 * Deep diagnostic: why do companies show 0 learners / 0 engagement?
 * Checks every layer: company record → learners → enrollments → lesson_progress → rollups
 */
import { createClient } from '@supabase/supabase-js';
global.WebSocket = class WebSocket {};

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function main() {
  console.log('=== CHATWALRUS COMPANY DEEP DIAGNOSTIC ===\n');

  // 1. All companies
  const { data: companies } = await db.from('companies').select('id, name, slug, is_active, start_date, created_at').order('name');

  // 2. Learner counts per company
  const { data: learnerCounts } = await db.from('learners').select('company_id, is_active').eq('is_active', true);
  const learnerMap = {};
  for (const l of learnerCounts || []) {
    learnerMap[l.company_id] = (learnerMap[l.company_id] || 0) + 1;
  }

  // 3. Enrollment counts per company
  const { data: enrollments } = await db.from('enrollments').select('company_id');
  const enrollMap = {};
  for (const e of enrollments || []) {
    enrollMap[e.company_id] = (enrollMap[e.company_id] || 0) + 1;
  }

  // 4. Lesson progress counts per company
  const { data: progress } = await db.from('lesson_progress').select('company_id, completed');
  const progressMap = {};
  const completedMap = {};
  for (const p of progress || []) {
    progressMap[p.company_id] = (progressMap[p.company_id] || 0) + 1;
    if (p.completed) completedMap[p.company_id] = (completedMap[p.company_id] || 0) + 1;
  }

  // 5. Zoom attendance per company
  const { data: zoom } = await db.from('zoom_attendance').select('company_id');
  const zoomMap = {};
  for (const z of zoom || []) {
    zoomMap[z.company_id] = (zoomMap[z.company_id] || 0) + 1;
  }

  // 6. Latest rollup per company
  const { data: rollups } = await db.from('learner_directory_rollups').select('company_id, avg_progress, updated_at').order('updated_at', { ascending: false });
  const rollupMap = {};
  for (const r of rollups || []) {
    if (!rollupMap[r.company_id]) rollupMap[r.company_id] = r;
  }

  // 7. Weekly rollups
  const { data: weeklyRollups } = await db.from('weekly_company_rollups').select('company_id, week_start').order('week_start', { ascending: false });
  const weeklyMap = {};
  for (const w of weeklyRollups || []) {
    if (!weeklyMap[w.company_id]) weeklyMap[w.company_id] = w.week_start;
  }

  // Classify each company
  const issues = {
    no_learners_at_all: [],
    has_learners_no_enrollments: [],
    has_enrollments_no_progress: [],
    has_progress_no_completions: [],
    has_completions_no_rollup: [],
    has_rollup_but_stale: [],
    healthy: [],
    inactive: [],
  };

  const staleDate = new Date();
  staleDate.setDate(staleDate.getDate() - 7);

  for (const co of companies || []) {
    if (!co.is_active) {
      issues.inactive.push({ name: co.name, slug: co.slug });
      continue;
    }

    const learners = learnerMap[co.id] || 0;
    const enrolCount = enrollMap[co.id] || 0;
    const progCount = progressMap[co.id] || 0;
    const completedCount = completedMap[co.id] || 0;
    const zoomCount = zoomMap[co.id] || 0;
    const rollup = rollupMap[co.id];
    const lastWeekly = weeklyMap[co.id];

    const row = { name: co.name, slug: co.slug, learners, enrolCount, progCount, completedCount, zoomCount, rollup, lastWeekly };

    if (learners === 0) {
      issues.no_learners_at_all.push(row);
    } else if (enrolCount === 0) {
      issues.has_learners_no_enrollments.push(row);
    } else if (progCount === 0) {
      issues.has_enrollments_no_progress.push(row);
    } else if (completedCount === 0) {
      issues.has_progress_no_completions.push(row);
    } else if (!rollup) {
      issues.has_completions_no_rollup.push(row);
    } else if (rollup && new Date(rollup.updated_at) < staleDate) {
      issues.has_rollup_but_stale.push(row);
    } else {
      issues.healthy.push(row);
    }
  }

  // ── REPORT ──────────────────────────────────────────────────────────────────

  console.log(`📊 TOTALS`);
  console.log(`   Companies (active): ${(companies||[]).filter(c=>c.is_active).length}`);
  console.log(`   Learners: ${Object.values(learnerMap).reduce((a,b)=>a+b,0)}`);
  console.log(`   Enrollments: ${Object.values(enrollMap).reduce((a,b)=>a+b,0)}`);
  console.log(`   Lesson progress rows: ${Object.values(progressMap).reduce((a,b)=>a+b,0)}`);
  console.log(`   Completed lessons: ${Object.values(completedMap).reduce((a,b)=>a+b,0)}`);
  console.log(`   Zoom attendance rows: ${Object.values(zoomMap).reduce((a,b)=>a+b,0)}`);
  console.log('');

  console.log(`\n🔴 PHASE 1 — ZERO LEARNERS (${issues.no_learners_at_all.length} companies)`);
  console.log(`   Root cause: syncUsers couldn't match any learner to this company.`);
  console.log(`   Either no one has this slug in their "Company" field, or the group name`);
  console.log(`   doesn't match what users typed. Run Sync Users to fix.\n`);
  for (const c of issues.no_learners_at_all) {
    console.log(`   ✗ ${c.name.padEnd(45)} slug: ${c.slug}`);
  }

  console.log(`\n🟠 PHASE 2 — HAS LEARNERS, ZERO ENROLLMENTS (${issues.has_learners_no_enrollments.length} companies)`);
  console.log(`   Root cause: learners exist but syncEnrollments hasn't linked them to courses.`);
  console.log(`   Run Sync Enrollments.\n`);
  for (const c of issues.has_learners_no_enrollments) {
    console.log(`   ⚠ ${c.name.padEnd(45)} learners: ${c.learners}`);
  }

  console.log(`\n🟡 PHASE 3 — HAS ENROLLMENTS, ZERO PROGRESS (${issues.has_enrollments_no_progress.length} companies)`);
  console.log(`   Root cause: enrolled but syncLessonProgress hasn't run, or learners`);
  console.log(`   truly haven't opened a single lesson yet.\n`);
  for (const c of issues.has_enrollments_no_progress) {
    console.log(`   ⚠ ${c.name.padEnd(45)} learners: ${c.learners}  enrollments: ${c.enrolCount}`);
  }

  console.log(`\n🟡 PHASE 4 — HAS PROGRESS, ZERO COMPLETIONS (${issues.has_progress_no_completions.length} companies)`);
  console.log(`   Root cause: learners opened lessons but haven't finished any. Normal for new companies.\n`);
  for (const c of issues.has_progress_no_completions) {
    console.log(`   ~ ${c.name.padEnd(45)} learners: ${c.learners}  progress rows: ${c.progCount}`);
  }

  console.log(`\n🔵 PHASE 5 — HAS COMPLETIONS, NO ROLLUP (${issues.has_completions_no_rollup.length} companies)`);
  console.log(`   Root cause: progress exists but rollup job hasn't run. Run Backfill Learner Rollups.\n`);
  for (const c of issues.has_completions_no_rollup) {
    console.log(`   ⚠ ${c.name.padEnd(45)} completed lessons: ${c.completedCount}`);
  }

  console.log(`\n🟤 STALE ROLLUP >7 days (${issues.has_rollup_but_stale.length} companies)`);
  for (const c of issues.has_rollup_but_stale) {
    console.log(`   ~ ${c.name.padEnd(45)} last rollup: ${c.rollup?.updated_at?.slice(0,10)}`);
  }

  console.log(`\n✅ HEALTHY (${issues.healthy.length} companies)`);
  console.log(`   (showing sample)`);
  for (const c of issues.healthy.slice(0, 10)) {
    console.log(`   ✓ ${c.name.padEnd(45)} learners: ${c.learners}  completed: ${c.completedCount}`);
  }
  if (issues.healthy.length > 10) console.log(`   ... and ${issues.healthy.length - 10} more`);

  // ── MINT SHOWROOM SPECIFIC ──────────────────────────────────────────────────
  console.log('\n\n══════════════════════════════════════════════');
  console.log('MINT SHOWROOM DEEP DIVE');
  console.log('══════════════════════════════════════════════');

  // Find any company with "mint" in the slug
  const mintCos = (companies||[]).filter(c => c.slug.includes('mint'));
  for (const co of mintCos) {
    const learners = learnerMap[co.id] || 0;
    const enrol = enrollMap[co.id] || 0;
    const prog = progressMap[co.id] || 0;
    const comp = completedMap[co.id] || 0;
    const zoom = zoomMap[co.id] || 0;
    console.log(`\n  Company: "${co.name}" (slug: ${co.slug}, id: ${co.id})`);
    console.log(`  Active: ${co.is_active}`);
    console.log(`  Learners:       ${learners}`);
    console.log(`  Enrollments:    ${enrol}`);
    console.log(`  Progress rows:  ${prog}`);
    console.log(`  Completions:    ${comp}`);
    console.log(`  Zoom rows:      ${zoom}`);
  }

  // Check learners whose company field might be "Mint Show Room" variant
  const { data: mintLearners } = await db
    .from('learners')
    .select('id, full_name, email, company_id, is_active')
    .in('company_id', mintCos.map(c=>c.id));

  console.log(`\n  Total learners across all mint companies: ${mintLearners?.length || 0}`);
  if (mintLearners?.length) {
    for (const l of mintLearners.slice(0, 5)) {
      const co = mintCos.find(c => c.id === l.company_id);
      console.log(`    - ${l.full_name} (${l.email}) → company: ${co?.slug} active: ${l.is_active}`);
    }
    if (mintLearners.length > 5) console.log(`    ... and ${mintLearners.length - 5} more`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
