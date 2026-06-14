# Bug Audit — ChatWalrus CSM Dashboard
**Date:** 2026-06-15

---

## CRITICAL

### BUG-001 — `percentage_completed` double-scaled: all active learners stored as 100%
Files: `src/lib/thinkific/syncEnrollments.ts:71`, `syncProgress.ts:49`, `syncEnrollmentData.ts:85`

All three sync files do:
```ts
const progressPercent = clampPercent(safeNumber(enrollment.percentage_completed) * 100);
```
Thinkific returns `percentage_completed` already scaled 0–100. The `* 100` turns 72% into 7200, clamped to 100. Every learner with any progress is stored as 100% complete. `clampPercent` silently masks the bug.
**Fix:** Remove the `* 100`.

### BUG-003 — `thinkificPaginateFast` crashes on partial page fetch failure
File: `src/lib/thinkific/client.ts:139–157`

`results` is a sparse array pre-allocated with `new Array(remainingPages.length)`. If any worker's fetch throws, `results[i]` is never assigned. The final spread crashes: `TypeError: Cannot spread a non-iterable undefined`. One failed page kills the entire sync run and loses all work done so far.

### BUG-004 — `AlertBanner` silently discards server errors — alerts disappear without DB update
File: `src/components/company/AlertBanner.tsx:13–25`

```ts
await fetch(`/api/alerts/${id}/${action}`, { method: 'PATCH' });
setDismissed((prev) => new Set([...prev, id]));  // always runs, even on 4xx/5xx
```
`fetch` only rejects on network error. 401/404/500 are treated as success. Alert disappears from UI but stays `open` in DB. Reappears on next page load.

---

## HIGH

### BUG-005 — `getMilestoneDay` forces minimum Day 30, triggering false alerts on new companies
File: `src/lib/milestones/benchmark.ts:26–30`

`Math.max(30, milestone)` — Day 0 companies immediately get benchmark 33.3%, fire alert, send Slack notification before anyone starts the program.

### BUG-006 — Future `start_date` triggers immediate benchmark alerts
File: `src/lib/milestones/runMilestoneCheck.ts:152`

When `start_date` is in the future, `daysSince` returns 0, getMilestoneDay returns 30, benchmark fires.

### BUG-007 — Daily cron paginates 66k enrollments TWICE
File: `src/app/api/jobs/daily-thinkific-sync/route.ts:19–23`

`syncEnrollments()` then `syncProgress()` each call `thinkificPaginateFast('/enrollments')` independently. ~240s total. `syncEnrollmentData` exists to fix this but was never wired into the cron.

### BUG-009 — `syncAssignments` fabricates `score: 100` for all completions
File: `src/lib/thinkific/syncAssignments.ts:44`

```ts
score: isCompleted ? 100 : null,
```
Every course completer gets a perfect score regardless of actual performance.

### BUG-010 — `createAdminClient()` throws but routes check `if (!db)` — dead guard
File: `src/lib/supabase/admin.ts:17–21` + every API route

`createAdminClient()` throws on missing env vars. Every route does `if (!db) return 503`. The `if (!db)` never fires — the throw surfaces as an unhandled 500 with a stack trace in the response body.

### BUG-011 — `constantTimeEqual` discards `timingSafeEqual` result
File: `src/lib/auth/session.ts:41–51`

`timingSafeEqual(paddedA, paddedB)` result thrown away. Always returns `false` for unequal-length inputs. Constant-time guarantee is void.

### BUG-012 — Charts route loads all historical snapshots with no row limit
File: `src/app/api/companies/[slug]/charts/route.ts:51–64`

No `.limit()` on snapshot query. 500 learners × 365 days = 182,500 rows loaded on every chart request.

### BUG-018 — `onPace` KPI renders `Infinity%` when `totalEnrolled = 0`
File: `src/app/company/[slug]/page.tsx:67–68`

```ts
const total = safeNumber(totalEnrolled, 1);  // returns 0 because 0 passes isNaN check
const onPace = Math.round(((onTrack + highEngagement) / total) * 100);  // n/0 = Infinity
```

---

## MEDIUM

### BUG-013 — Email domain fuzzy match assigns learners to wrong company
File: `src/lib/thinkific/syncUsers.ts:75–80`

`acme-tech.com` matches slug `acme`. `globalinc.com` matches slug `global`. Map iteration order determines winner on multiple matches. Learners silently assigned to wrong company.

### BUG-014 — `lesson_progress` table has no sync function — snapshot completion always 0
File: `src/lib/snapshots/createDailySnapshots.ts:43`

Snapshot derives `completion_percent` from `lesson_progress.completed` counts. No `syncLessonProgress` exists. Table is never populated. Completion trend chart is permanently flat at 0%.

### BUG-015 — `/api/companies/[slug]/alerts` GET has no auth guard
File: `src/app/api/companies/[slug]/alerts/route.ts`

Returns all alerts for a company. No `requireAdminOrCron` call.

### BUG-016 — Survey pagination `next_page !== null` check can loop infinitely
File: `src/lib/thinkific/syncSurveys.ts:104`

`undefined !== null` is `true`. If `meta` is missing, loop never terminates.

### BUG-017 — Local `daysSince` shows negative days for future start dates
File: `src/app/company/[slug]/page.tsx:12–15`

Missing `Math.max(0, ...)` clamp. Future `start_date` renders `Day -5 of 90`.

### BUG-019 — Zoom attendance throw aborts all remaining participants in meeting
File: `src/lib/zoom/syncAttendance.ts:97–99`

Throw inside per-meeting loop aborts all remaining attendees when one upsert fails.

### BUG-020 — Learner detail page no company ownership check
File: `src/app/company/[slug]/learners/[learnerId]/page.tsx:18–21`

Fetches learner by UUID with no check that learner belongs to the URL company. Cross-company data accessible via crafted URL.

---

## LOW

- **BUG-021** — `syncCore.ts:90–95` — Sync log `started_at`/`completed_at` always identical, duration always 0ms
- **BUG-022** — `charts/route.ts:44–48,73` — Dead DB query executed and immediately voided
- **BUG-023** — `assessments/page.tsx:73` — Hardcoded 70% pass threshold ignores stored `passed` boolean
- **BUG-024** — `syncCourses.ts:63–65` — Serial lesson fetches per course (slow but correct)
