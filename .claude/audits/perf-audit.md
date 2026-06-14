# Performance Audit — ChatWalrus CSM Dashboard
**Date:** 2026-06-15

---

## CRITICAL

### PERF-01 — Daily cron paginates 66k enrollments TWICE (~240s)
File: `src/app/api/jobs/daily-thinkific-sync/route.ts:19–24`

`syncEnrollments()` + `syncProgress()` both call `thinkificPaginateFast('/enrollments')`. Two full 668-page paginations. `syncEnrollmentData()` was written to fix exactly this but cron was never updated.
**Fix:** Replace both calls with `syncEnrollmentData()`.

### PERF-02 — Charts route queries `learner_status_snapshots` TWICE, first result voided
File: `src/app/api/companies/[slug]/charts/route.ts:42–74`

Two queries, first result (`statusData`) immediately voided. Neither has LIMIT or date filter. 100 learners × 90 days = 18,000 rows per request, all discarded.
**Fix:** Delete query 1. Add `.eq('snapshot_date', todayISO())` or `DISTINCT ON (learner_id)` to query 2.

### PERF-03 — JSON export: `SELECT *` all enrollments, no column/filter scoping
File: `src/app/api/companies/[slug]/export/json/route.ts:19–22`

No `is_active` filter, `SELECT *` on enrollments. `JSON.stringify(data, null, 2)` creates second full copy in heap.
**Fix:** Select only needed columns. Add `.eq('is_active', true)`.

### PERF-04 — Learners page: ALL learners, no pagination; 18k snapshot rows discarded client-side
Files: `src/app/api/companies/[slug]/learners/route.ts:21–48`, `src/app/company/[slug]/learners/page.tsx:26–44`

Complete learner list loaded into `useState`. No `.limit()`. Snapshots sub-query fetches all historical rows to deduplicate in JS. Search/filter done entirely client-side.
**Fix:** Add server-side pagination. Filter snapshots: `.eq('snapshot_date', todayISO())`. Push search to SQL.

### PERF-05 — Dashboard fetches ALL enrollments to compute one average (use SQL aggregates)
File: `src/app/company/[slug]/page.tsx:47,51`

Thousands of rows transferred to Node heap just to compute `avgProgress` and `courseCompletions`. `latestMilestone` already has `average_completion_percent` and status counts.
**Fix:** Drop raw enrollment/assignment queries. Read aggregates from `latestMilestone`. Use `.rpc()` for SQL aggregates if fresh numbers needed.

### PERF-06 — `runAllMilestoneChecks` processes companies serially
File: `src/lib/milestones/runMilestoneCheck.ts:257–262`

`for ... await runMilestoneCheck(company)` — 10 companies = 30–50 sequential DB round-trips.
**Fix:** `await Promise.all(companies.map(c => runMilestoneCheck(c)))` or use `p-limit(4)`.

---

## HIGH

### PERF-H1 — `assignments.thinkific_assignment_id` missing UNIQUE constraint — upserts silently INSERT duplicates
File: `supabase/schema.sql:335–351`

PostgreSQL `ON CONFLICT (column)` requires UNIQUE or PK constraint. Without it, every sync inserts fresh duplicate rows.
**Fix:** `ALTER TABLE assignments ADD CONSTRAINT assignments_thinkific_assignment_id_unique UNIQUE (thinkific_assignment_id);`

### PERF-H2 — Missing composite indexes on `learner_status_snapshots`
File: `supabase/schema.sql:242–243`

Single-column indexes can't eliminate sort for `company_id + snapshot_date DESC` queries.
**Fix:**
```sql
CREATE INDEX idx_learner_status_snapshots_company_date ON learner_status_snapshots(company_id, snapshot_date DESC);
```

### PERF-H3 — `surveys/export` unbounded, no required `company_id`
File: `src/app/api/surveys/export/route.ts:21–26`

When `company_id` absent, queries entire surveys table. No LIMIT.

### PERF-H4 — `createServerClient()` creates new Supabase client on every call
File: `src/lib/supabase/server.ts:8–19`

No singleton pattern unlike `createAdminClient()`.

---

## MEDIUM

- **PERF-M1** — No Next.js `revalidate` on any GET route — all hit Supabase on every load
- **PERF-M2** — `daily_snapshots` missing composite index: `CREATE INDEX ON daily_snapshots(company_id, snapshot_date ASC)`
- **PERF-M3** — `zoom_attendance` no `company_id` index — milestone check does full scans

---

## Memory Estimate
66,728 enrollment objects × ~850 bytes V8 heap = ~57MB peak. Combined with maps during full sync: ~80–100MB. Safe under Vercel 1GB limit today; monitor if dataset exceeds 200k enrollments.

## Concurrency Math
668 pages ÷ 8 workers = 84 rounds × 350ms = ~29s pagination + ~33s DB upserts = **~62s per pass**. Raising to 12 workers: 56 rounds × 350ms = ~20s pagination — still safely under Thinkific's ~40 req/s burst limit.
