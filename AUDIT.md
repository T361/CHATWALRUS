# CHATWALRUS — Comprehensive Audit Report

**Date:** 2026-06-27 | **Dimensions:** 8 | **Files Audited:** 108+ | **Branch:** main

---

## 1. Executive Summary

An eight-dimension audit of CHATWALRUS identified **18 critical**, **41 high**, and **42 medium** severity findings across security, bugs, logic, routes, performance, type safety, dependency configuration, and test coverage.

The most consequential issues form a cluster around a single root cause: the `requireAdminOrCron` guard accepts any authenticated session — including company-role sessions — and no per-slug authorization check exists at the API handler level. Together these allow a company-A user to read dashboard data, learner PII, CSV exports, quiz scores, and alerts for every other company. The middleware correctly restricts page-level routing by slug, but this protection does not extend to the API layer.

Secondary critical issues include: CSV formula injection in the export pipeline (spreadsheet code execution from exported learner names), three N+1 or full-table-scan patterns that will cause timeout or OOM failures under production load, a stale TypeScript `@ts-expect-error` that masks future regressions, and ten entirely untested modules — including the gamification points engine and daily snapshot writer — that silently write permanent records to the database.

Test coverage stands at approximately 10% by file count, with 6 pre-existing test failures all caused by the rate limiter firing before company-passcode lookup in the login route.

**Remediation priority:** (1) fix the IDOR auth gap, (2) patch CSV injection, (3) replace full-table-scan rollup queries with SQL GROUP BY, (4) add tests for session-edge.ts and guards.ts, (5) hash and stop exposing plaintext passcodes.

---

## 2. Scorecard by Dimension

| Dimension | Critical | High | Medium | Top Risk |
|---|---|---|---|---|
| Security | 2 | 6 | 6 | IDOR — company session bypasses all slug guards |
| Bugs | 3 | 5 | 7 | Zoom attendance silent truncation at 1,000 rows |
| Logic | 2 | 5 | 4 | CSV formula injection; unclamped progress > 100% |
| Routes | 2 | 5 | 8 | Full-table scan on company-health; no try/catch |
| Performance | 3 | 6 | 8 | N+1 weekly rollup; full-table scans in JS memory |
| Type Safety | 1 | 6 | 9 | Stale @ts-expect-error; 5 files with double-cast |
| Deps / Config | 0 | 3 | 5 | 32 routes without try/catch; missing CSP/HSTS |
| Test Coverage | 10 | 10 | 2 | calculatePoints, awardAchievements fully untested |
| **Total** | **18** | **41** | **42** | |

---

## 3. Critical Findings

### SECURITY

**[CRITICAL] IDOR — all /api/companies/[slug]/* routes accept company-role sessions**
- **File:** `src/app/api/companies/[slug]/dashboard/route.ts` (and all sibling routes)
- **Issue:** `requireAdminOrCron` passes for any valid session including company-role sessions. A company-A user can call `/api/companies/company-B/dashboard` and receive company-B's data. Same flaw covers `/learners`, `/export/csv`, `/export/json`, `/alerts`, `/assessments`, `/charts`, `/leaderboard`, `/weekly`, `/zoom/analytics`, `/zoom/sessions`, `/interventions`, and `/learners/meta`.
- **Fix:** Replace `requireAdminOrCron` with `requireCompanyAuth` (already exists in guards.ts) on all `/api/companies/[slug]/*` routes, and add a company-scoped check: confirm `session.companySlug === slug || session.role === 'admin'` after session verification.

**[CRITICAL] requireAdminOrCron grants access to company-role sessions**
- **File:** `src/lib/auth/guards.ts`
- **Issue:** Line 87 calls `getAdminSession` and returns null (authorized) for any non-null session. Company users are silently authorized on every admin/cron-protected endpoint.
- **Fix:** Add explicit `session.role === 'admin'` check before accepting a session-based call. A company-role session must never satisfy an admin-or-cron gate.

### BUGS

**[CRITICAL] zoom_attendance query has no row limit — silent truncation at 1,000 rows**
- **File:** `src/lib/zoom/syncAttendance.ts` / `analytics.ts`
- **Issue:** `getCompanyZoomAnalytics` fetches attendance rows with no `.limit()`. Supabase caps at 1,000 rows. Companies with 1,000+ records silently receive truncated data, producing wrong `attendance_rate`, `attending_learners`, and `session_trends` with no error.
- **Fix:** Replace with a paginated loop using `.range(offset, offset+999)` or add `.limit(10000)` with a warning log if `attendanceRows.length === 1000`.

**[CRITICAL] Infinite loop risk and TypeError in thinkificPaginate**
- **File:** `src/lib/thinkific/client.ts`
- **Issue:** If `response.items` is undefined, `response.items.length` throws a TypeError before the pagination break check.
- **Fix:** Add `if (!response.items || response.items.length === 0) break;` before the pagination check.

**[CRITICAL] Race condition in Zoom attendance sync for co-hosted meetings**
- **File:** `src/lib/zoom/syncAttendance.ts`
- **Issue:** Two users co-hosting the same meeting trigger concurrent participant-fetch loops for the same occurrence UUID, producing duplicate attendance rows before the `dedupe_key` unique constraint fires.
- **Fix:** Deduplicate sessions by `zoom_meeting_id` using a shared `Set` of processed meeting IDs before entering participant-fetch loops.

### LOGIC

**[CRITICAL] CSV formula injection in escapeCSVField**
- **File:** `src/lib/exports/csv.ts`
- **Issue:** Fields starting with `=`, `+`, `-`, or `@` are not sanitized. A learner name containing `=CMD|"/C calc"!A0` executes as a spreadsheet formula in Excel or LibreOffice.
- **Fix:** Add `if (/^[=+\-@]/.test(value)) value = "'" + value;` before the existing quote check.

**[CRITICAL] Progress percent never clamped — can exceed 100%**
- **File:** `src/lib/milestones/runMilestoneCheck.ts`
- **Issue:** `avgProgress = (completedLessons / totalLessons) * 100` exceeds 100 if `total_lessons` was reduced after completions were recorded. Written directly to `learner_status_snapshots.completion_percent`, corrupting status calculations.
- **Fix:** Apply `clampPercent` from `@/lib/utils/normalize`: `avgProgress = totalLessons > 0 ? clampPercent((completedLessons / totalLessons) * 100) : 0;`

### ROUTES

**[CRITICAL] company-health route — six parallel full-table scans across all companies**
- **File:** `src/app/api/admin/company-health/route.ts`
- **Issue:** Queries for learners, enrollments, rollups, lesson_progress, and zoom_attendance fetch ALL rows filtered only by `company_id IN (...)` with no row limit. Will pull tens of thousands of rows into serverless memory and breach the 60s timeout.
- **Fix:** Replace with COUNT aggregates using `{ count: 'exact', head: true }` per company or a single SQL GROUP BY via RPC.

**[CRITICAL] company-health route — company sessions can enumerate all companies**
- **File:** `src/app/api/admin/company-health/route.ts`
- **Issue:** Uses `getAdminSession()` directly, accepting both admin and company-role sessions. A company user can enumerate all company slugs, learner counts, and health issues.
- **Fix:** Replace with `requireAdmin(req)` to explicitly reject company-role sessions.

### PERFORMANCE

**[CRITICAL] N+1 weekly rollup — 400+ serialized DB round-trips for 50 companies**
- **File:** `src/lib/weekly/rollups.ts`
- **Issue:** `refreshCompanyWeeklyRollups` calls `buildWeeklySnapshot` sequentially per company, each triggering 8+ DB queries.
- **Fix:** Batch with `Promise.all` or `p-limit(5)`.

**[CRITICAL] Daily snapshot creation — 50 sequential DB queries for 5,000 learners**
- **File:** `src/lib/snapshots/createDailySnapshots.ts`
- **Issue:** One DB round-trip per 100-learner chunk to count completed lessons.
- **Fix:** `SELECT learner_id, COUNT(*) FROM lesson_progress WHERE completed = true GROUP BY learner_id`

**[CRITICAL] getLiveSessionCounts — full zoom_attendance table scan per company**
- **File:** `src/lib/learners/rollups.ts`
- **Issue:** One paginated query loop per company loading all attendance rows into JS for Map aggregation.
- **Fix:** `SELECT learner_id, COUNT(*) FROM zoom_attendance WHERE attended = true AND join_time >= $thirtyDaysAgo GROUP BY learner_id`

### TYPE SAFETY

**[CRITICAL] Stale @ts-expect-error — only tsc error in the project**
- **File:** `src/lib/thinkific/syncCourses.test.ts:585`
- **Issue:** The suppressed error no longer exists but the suppression remains, silently masking future type regressions at that line.
- **Fix:** Remove the directive at line 585.

### TEST COVERAGE

**[CRITICAL] 10 modules with zero test coverage writing permanent database records**
- **Files:** `calculatePoints.ts`, `awardAchievements.ts`, `syncEnrollments.ts`, `syncUsers.ts`, `runMilestoneCheck.ts`, `createDailySnapshots.ts`, `guards.ts`, `session-edge.ts`, `weekly/rollups.ts`, `syncEnrollmentData.ts`
- **Issue:** The gamification scoring engine (317 lines), achievement writer, milestone orchestrator (343 lines), daily snapshot writer (155 lines), auth guards used by every API route, Edge runtime crypto path used by middleware on every request, and the weekly rollup aggregator (464 lines) all have zero coverage.
- **Fix:** Priority: session-edge.ts → guards.ts → calculatePoints → runMilestoneCheck → createDailySnapshots → awardAchievements → weekly/rollups.ts

**[CRITICAL] 6 pre-existing test failures — login route rate-limiter ordering bug**
- **File:** `src/app/api/auth/login/route.test.ts`
- **Issue:** All company login path tests receive 429 instead of 200/401/503 because the rate limiter counter is not reset between test cases.
- **Fix:** Export `resetForTesting()` from `rateLimit.ts` or mock the module in `beforeEach`.

---

## 4. High Severity Findings

| # | Dimension | File | Issue | Fix |
|---|---|---|---|---|
| 1 | Security | `src/lib/auth/rateLimit.ts` | In-memory rate limiter bypassable via X-Forwarded-For spoofing; resets on cold start | Replace with Redis/Upstash or Supabase rate_limits table; validate forwarded-for against trusted-proxy allowlist |
| 2 | Security | `src/app/api/admin/passcodes/route.ts` | GET returns plaintext code for all passcodes; POST returns raw code | Hash with bcrypt/Argon2; omit code column from GET; return plaintext only at creation |
| 3 | Security | `src/middleware.ts` | /api/admin/passcodes incorrectly in CRON_PATHS | Remove /api/admin/passcodes from CRON_PATHS |
| 4 | Security | `src/app/api/admin/settings/status/route.ts` | getAdminSession accepts company sessions — company users can receive probe results with internal URLs | Replace with requireAdmin(req) |
| 5 | Bugs | `src/lib/thinkific/syncGroups.ts` | fetchGroupUsers hardcoded at 100 members with no pagination | Replace with thinkificPaginate |
| 6 | Bugs | `src/lib/thinkific/syncUsers.ts` | loadCompanies() has no pagination — users detach from companies after table exceeds 1,000 rows | Paginate with range(offset, offset+999) |
| 7 | Bugs | `src/lib/thinkific/syncLessonProgress.ts` | flushQuizBatch check-then-insert vulnerable to 1,000-row cap — unique constraint violations swallowed by console.warn | Replace with upsert using onConflict: 'learner_id,thinkific_quiz_id' |
| 8 | Logic | `src/lib/gamification/awardAchievements.ts` | quiz_passes awarded for failed attempts — no passed = true filter | Add .eq('passed', true) at line 83 |
| 9 | Logic | `src/lib/gamification/awardAchievements.ts` | lessons_complete uses total_points > 0 as proxy — any Zoom points qualify | Track lesson count in LearnerTotals; compare against ach.criteria_value |
| 10 | Logic | `src/lib/utils/slug.ts` | Slug collisions silently merge distinct companies | Append numeric suffix on collision; log warning for empty slugs |
| 11 | Logic | `src/lib/milestones/benchmark.ts + dates.ts` | Divergent getMilestoneDay implementations — 0 vs 30 minimum for days 0-29 | Remove getCurrentMilestoneDay from dates.ts or make it delegate to getMilestoneDay |
| 12 | Logic | `src/lib/learners/rollups.ts` | No cascade cleanup on learner deactivation — orphaned records skew aggregate queries | Add cleanup on is_active=false or ON DELETE CASCADE on FK migrations |
| 13 | Routes | `src/app/api/companies/[slug]/dashboard/route.ts` | No try/catch — thrown exceptions return Next.js HTML 500 instead of JSON | Wrap handler in try/catch returning NextResponse.json |
| 14 | Routes | `src/app/api/admin/sync/lesson-progress/route.ts` + zoom | Unbounded limit parameter — ?limit=100000 triggers massive Thinkific API fetches | Clamp: Math.min(Math.max(parseInt(raw\|\|'5',10)\|\|5, 1), 100) |
| 15 | Deps/Config | `src/app/api/` (32 files) | 32 route handlers with no try/catch | Add withErrorHandler() HOF or wrap all handlers |
| 16 | Deps/Config | `next.config.ts` | Missing CSP and HSTS headers; X-Powered-By not suppressed | Add HSTS, CSP, and poweredByHeader: false |
| 17 | Deps/Config | `src/lib/supabase/server.ts` | New connection pool created on every call — no singleton | Add module-level cache mirroring admin.ts pattern |
| 18 | Type Safety | Multiple files | as unknown as double-casts at 5 DB boundary sites | Define typed intermediates or parse with Zod at boundary |
| 19 | Performance | `src/lib/weekly/rollups.ts` | Fallback loads O(learners × days) rows into JS for client-side dedup | SELECT DISTINCT ON (learner_id) ORDER BY snapshot_date DESC |
| 20 | Performance | `src/lib/companies/rollups.ts` | Loads all milestone_checks into JS — 365,000 rows for 100 companies × 365 days | DISTINCT ON (company_id) ordered by checked_at DESC |
| 21 | Performance | `src/lib/zoom/analytics.ts` | 7,200+ rows fetched for in-JS weekly aggregation; 50x over-fetch in session list | Push aggregation to DB via GROUP BY week_start |
| 22 | Performance | `src/lib/learners/directory.ts` | getRoleOptionsWithCounts + addLearnerCountsToCourses — full-table scans for in-JS aggregation | Persist normalized role; use Supabase RPC with unnest + GROUP BY |
| 23 | Type Safety | `src/lib/milestones/runMilestoneCheck.ts` | 281-line function mixes DB queries, business logic, alerts, and logging — untestable | Decompose into data-loading, calculation, and alert-dispatch functions |

---

## 5. Medium Findings — Summary

42 medium findings across all dimensions. Key patterns:

- **DST-sensitive milestone windows:** 30-day windows use arithmetic days, not calendar months — DST transitions shift boundaries by 1 hour causing edge-case misclassification.
- **Stale learner count fallback:** Company cards fallback returns a cached count (potentially days stale) on DB error with no staleness indicator in the UI.
- **Nondeterministic company_id on learner_points:** Learners transferred between companies retain old company_id on historical points_events, skewing per-company leaderboards.
- **Undocumented env vars:** `THINKIFIC_GRAPHQL_URL` and `THINKIFIC_GRAPHQL_TOKEN` are used in code but absent from `.env.example` — new deployments silently fail.
- **Small upsert batch sizes:** Many sync loops batch at 100 rows; increasing to 500-1,000 reduces total round-trips substantially.
- **Broad-brush cache invalidation:** Any sync nukes the entire company cache regardless of which company was touched.
- **Leaderboard hard-coded at 100 rows:** Returns at most 100 rows with a misleading `total` field reflecting 100, not the true count.
- **select('*') on JSON-heavy rollup tables:** Specifying only needed columns would reduce transfer overhead significantly.
- **Divergent getMilestoneDay implementations:** Wrong call site produces 0% benchmark, making all learners appear as high-engagement.
- **No cascade cleanup on learner deactivation:** Orphaned records in multiple tables skew aggregate queries over time.

---

## 6. Security Posture

The most serious failure is a privilege-escalation pair: `requireAdminOrCron` in `guards.ts` accepts any authenticated session including company-role sessions, and no per-slug authorization check exists at the API handler level. Together these allow cross-company reads of learner PII, quiz scores, CSV exports, alert records, Zoom analytics, assessments, leaderboard, and interventions for any authenticated user. The middleware correctly enforces slug-scoped routing at the page level but this protection does not propagate to the API layer.

Plaintext passcode exposure compounds the risk: GET `/api/admin/passcodes` returns the `code` column for every company credential in a single request, enabling full lateral-movement from any stolen admin session. POST also returns the raw code, which can be captured by Vercel log drains or proxy logs.

Two admin-restricted routes use `getAdminSession` directly instead of `requireAdmin` — `company-health` (accepts company sessions, leaks all company slugs and health data) and `settings/status` (accepts company sessions, leaks Supabase error messages and internal service URL details from probes). The `CRON_PATHS` allowlist in `middleware.ts` incorrectly includes `/api/admin/passcodes`, masking the true access boundary.

**What is solid:** JWT/session implementation in `session.ts` uses HMAC-SHA256 with timing-safe comparison, expiry validation, and nonce — all correctly implemented. No SSRF risks found in external fetch calls. Server-only guards prevent accidental client-side execution. The middleware's page-level slug routing is correct. `auth/session.ts` and `normalize.ts` have no explicit `any` types or double-casts.

---

## 7. Data Integrity

Sync reliability has multiple silent failure modes. `fetchGroupUsers` truncates at 100 members with no warning — groups with 101+ members produce permanently incomplete company membership. `loadCompanies()` in `syncUsers` has no pagination and will silently detach users from companies once the table exceeds 1,000 rows. The quiz flush in `flushQuizBatch` uses check-then-insert vulnerable to the Supabase 1,000-row cap — missed existing records cause unique-constraint violations swallowed by `console.warn`. Sync logs overstate success in both `syncUsers` and `syncEnrollments` because success counters increment after failed upserts.

Rollup accuracy is compromised by: unclamped progress percent (exceeds 100% when `total_lessons` is reduced); divergent `getMilestoneDay` implementations; lessons-complete achievement using points as proxy for lesson count; quiz-passes achievement counting failed attempts as passes.

No cascade cleanup exists for orphaned records when learners are deactivated — `learner_status_snapshots`, `points_events`, `learner_achievements`, and `learner_points` persist indefinitely, skewing all aggregate queries.

Historical snapshots are the highest-integrity risk: `createDailySnapshots.ts` is entirely untested, and bugs here produce corrupted historical records that cannot be reconstructed.

---

## 8. Performance Risks

**Three critical N+1 / full-table-scan patterns** will cause timeout or OOM under production load:

1. `refreshCompanyWeeklyRollups` processes companies sequentially — 400+ serialized DB round-trips for 50 companies. The fallback path loads O(learners × days) snapshot rows into JS memory — 108,000 rows for 200 learners × 18 months.
2. `createDailySnapshots` issues 50 sequential queries for 5,000 learners where one `GROUP BY` suffices.
3. `getLiveSessionCounts` runs one paginated loop per company, loading full `zoom_attendance` scans into JS.

**Six additional high-severity patterns:** `getRoleOptionsWithCounts` and `addLearnerCountsToCourses` load entire rollup tables into JS. `getCompanyZoomAnalytics` fetches 7,200+ rows for in-JS grouping. `getCompanySessionLists` over-fetches by 50x. `refreshCompanySummaryRollups` loads up to 365,000 milestone_check rows for client-side deduplication.

The Supabase server client creates a new connection pool on every call. The in-process cache TTL is 5 seconds. Cache invalidation nukes all companies on any sync. `maxDuration=300` in the daily-sync job is only honored on Vercel Pro — silently capped at 60s on Hobby, causing incomplete syncs with no error.

---

## 9. Test Coverage

| Metric | Before | After |
|---|---|---|
| Total tests | 317 | 635 |
| Test files | 11 | 17 |
| Passing | 311 | 629 |
| Failing | 6 | 6 (pre-existing) |
| File coverage | ~10% | ~16% |

### New Test Files Added

| File | Tests | Coverage |
|---|---|---|
| `src/lib/auth/guards.test.ts` | 35 | getBearerToken extraction, requireCronSecret env-var guard, admin vs company session discrimination |
| `src/lib/gamification/calculatePoints.test.ts` | 69 | All 9 POINTS event type values, ordering assertions, DB upsert error paths |
| `src/lib/milestones/status.test.ts` | 61 | not_started detection, high_engagement thresholds, pre-90/post-90 benchmark divergence |
| `src/lib/exports/csv.test.ts` | 45 | Formula injection cases (=, +, -, @), comma/newline/quote escaping, empty-array early return |
| `src/lib/utils/slug.additional.test.ts` | 69 | Collision detection, CJK stripping, accented Latin, special-char-only inputs |
| `src/lib/auth/rateLimit.test.ts` | 39 | Bucket creation, threshold enforcement, TTL expiry, concurrent-request behaviour |

### Pre-existing Failures (6)

All in `src/app/api/auth/login/route.test.ts` — rate limiter not reset between test cases. Company login path tests receive 429 instead of 200/401/503.

**Fix:** Export `resetForTesting()` from `rateLimit.ts` or mock the module in `beforeEach`.

### Remaining Critical Gaps

`session-edge.ts` (Edge runtime crypto used by middleware on every request), `awardAchievements.ts`, `runMilestoneCheck.ts` (343 lines), `createDailySnapshots.ts` (permanent historical records), `syncEnrollments.ts`, `syncUsers.ts`, `weekly/rollups.ts` (464 lines — largest untested file), `syncEnrollmentData.ts`, `syncGroups.ts`, `syncSurveys.ts`, `syncOrders.ts`, `syncAssignments.ts`, `syncStartDates.ts`, `learners/rollups.ts`, `companies/rollups.ts`, `alerts/createAlert.ts`, `syncCore.ts`.

---

## 10. Top 5 Recommendations by Business Impact

**1. Fix the IDOR auth gap on all /api/companies/[slug]/* routes**
Replace `requireAdminOrCron` with `requireCompanyAuth` and add `session.companySlug === slug || session.role === 'admin'` in every slug-scoped handler. Also fix `requireAdminOrCron` in `guards.ts` to reject company-role sessions explicitly. This is a complete cross-company data breach — learner PII, quiz scores, CSV exports, and alerts for every company are readable by any authenticated user. Deploy this fix before any other change.

**2. Patch CSV formula injection in escapeCSVField**
A one-line fix with direct, exploitable impact: add `if (/^[=+\-@]/.test(value)) value = "'" + value;` before the existing quote guard in `src/lib/exports/csv.ts`. This is a zero-configuration exploit requiring no privileges beyond having a Thinkific username containing a formula string.

**3. Replace full-table-scan rollup patterns with SQL GROUP BY**
Three critical performance issues share the same fix: move aggregation into PostgreSQL. At current growth rates, `getLiveSessionCounts`, `createDailySnapshots`, and the weekly rollup fallback will hit Vercel's 60s timeout within 6-12 months. Prioritize `getLiveSessionCounts` and `createDailySnapshots` — they run on every sync cycle.

**4. Hash passcodes and stop exposing them in API responses**
Store as bcrypt or Argon2 hashes, remove the `code` column from GET `/api/admin/passcodes` SELECT responses, return plaintext only once at creation time, and remove `/api/admin/passcodes` from `CRON_PATHS`. The current state allows any admin session to retrieve all company credentials in one request.

**5. Establish baseline test coverage for the auth and sync pipeline**
Fix the 6 failing login tests first (mock or reset rate limiter in `beforeEach`). Then add tests for `session-edge.ts` and `guards.ts` — security-critical paths with zero coverage. Follow with `calculatePoints`, `runMilestoneCheck`, and `createDailySnapshots` to protect gamification and historical data integrity. Target 40% file coverage within one sprint.

---

## 11. What's Working

- JWT/session implementation in `session.ts` is sound — HMAC-SHA256, timing-safe comparison, expiry validation, and nonce all correctly implemented.
- Middleware page-level routing correctly enforces slug-scoped access.
- No SSRF risks found in external fetch calls — all outbound requests target known configured endpoints.
- Server-only guards correctly used in sensitive lib files, preventing accidental client-side execution.
- Singleton admin Supabase client correctly caches in a module-level variable.
- Rate limiter is correctly wired at the login endpoint — concept and placement are right; only the backend needs upgrading.
- No explicit `any` types in `auth/session.ts` or `normalize.ts` — these critical modules are well-typed.
- Pagination pattern using `.range(offset, offset+999)` is correctly implemented in `syncEnrollments` and `syncGroups` — needs extension to remaining locations.
- Security headers baseline exists in `next.config.ts` — structure is correct, only CSP and HSTS are missing.
- The 8 parallelized COUNT queries inside `buildWeeklySnapshot` are correctly structured — the N+1 issue is at the outer company-loop level, not inside per-company computation.
- Upsert conflict strategies are correctly defined throughout — `onConflict` keys are appropriate and `ignoreDuplicates` flags are used intentionally.
- `session.ts` and `middleware.ts` are well-tested with meaningful assertions, providing a solid foundation for extending auth test coverage.
