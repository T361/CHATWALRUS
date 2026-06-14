# FIXES.md — ChatWalrus Full Codebase Audit
**Audited:** 2026-06-15 | **Auditors:** security, bug, performance, infrastructure (8 parallel agents)

---

## P0 — FIX NOW (Live Data Breach / Data Corruption)

These are not theoretical risks. They are exploitable today.

### P0-1 — 9 API GET routes expose all learner PII with zero authentication
**Source:** security CRIT-01, bug BUG-015, infra INFRA-C2

Every read endpoint returns sensitive data (learner names, emails, quiz scores, survey responses, company KPIs) to ANY unauthenticated HTTP request. `curl https://chatwalrus.vercel.app/api/companies` dumps everything.

Files to fix — add `const authError = requireAdminOrCron(req); if (authError) return authError;` at top of each GET handler:
- `src/app/api/companies/route.ts`
- `src/app/api/companies/[slug]/route.ts`
- `src/app/api/companies/[slug]/dashboard/route.ts`
- `src/app/api/companies/[slug]/learners/route.ts`
- `src/app/api/companies/[slug]/alerts/route.ts`
- `src/app/api/companies/[slug]/assessments/route.ts`
- `src/app/api/companies/[slug]/charts/route.ts`
- `src/app/api/learners/[id]/route.ts`
- `src/app/api/surveys/route.ts` (or `src/app/api/surveys/export/route.ts`)

### P0-2 — No middleware.ts — all pages publicly accessible without login
**Source:** security CRIT-03

`/company/acme`, `/admin/settings`, `/admin/surveys` — all render full data to anonymous visitors. No session check at the routing layer.

**Fix:** Create `src/middleware.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Allow auth routes through
  if (pathname.startsWith('/api/auth') || pathname === '/login') return NextResponse.next();
  const session = await getSession(req);
  if (!session) return NextResponse.redirect(new URL('/login', req.url));
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
```

### P0-3 — `percentage_completed * 100` bug: all active learners stored as 100% progress
**Source:** bug BUG-001

Thinkific returns `percentage_completed` already as 0–100. All three sync files multiply by 100 again, then `clampPercent` caps at 100. Every learner with any progress shows 100%.

Files: `src/lib/thinkific/syncEnrollments.ts:71`, `syncProgress.ts:49`, `syncEnrollmentData.ts:85`
**Fix:** Remove `* 100` from all three:
```ts
// BEFORE:
const progressPercent = clampPercent(safeNumber(enrollment.percentage_completed) * 100);
// AFTER:
const progressPercent = clampPercent(safeNumber(enrollment.percentage_completed));
```

### P0-4 — Alert Reviewed/Actioned buttons never check server response — alerts disappear without saving
**Source:** bug BUG-004

File: `src/components/company/AlertBanner.tsx:13–25`

`setDismissed()` fires regardless of whether the PATCH succeeded. A 500 hides the alert from the CSM but leaves it `open` in the DB. It reappears on next page load.

**Fix:**
```ts
const res = await fetch(`/api/alerts/${id}/${action}`, { method: 'PATCH', ... });
if (!res.ok) {
  setError(`Failed to ${action} alert. Please try again.`);
  setLoading(null);
  return;
}
setDismissed((prev) => new Set([...prev, id]));
```

### P0-5 — `thinkificPaginateFast` crashes entire sync when any single page fails
**Source:** bug BUG-003

File: `src/lib/thinkific/client.ts:139–157`

Pre-allocated sparse array `results = new Array(remainingPages.length)`. Failed pages leave slots undefined. Final spread crashes: `TypeError: Cannot spread undefined`.

**Fix:** Initialize with empty arrays and handle per-slot errors:
```ts
const results: Array<T[]> = Array.from({ length: remainingPages.length }, () => []);
// In worker:
try {
  const res = await thinkificGet<...>(endpoint, { ...params, page: String(page), limit });
  results[i] = res.items ?? [];
} catch (err) {
  console.warn(`[thinkificPaginateFast] Page ${page} failed, skipping:`, err);
  results[i] = [];
}
```

### P0-6 — Alert PATCH routes have no company-ownership check (horizontal privilege escalation)
**Source:** security CRIT-02

Files: `src/app/api/alerts/[id]/action/route.ts`, `src/app/api/alerts/[id]/review/route.ts`

An authenticated user can PATCH any alert by ID regardless of company. `actioned_by` taken from request body — audit trail forgeable.

**Fix:** After auth check, verify ownership:
```ts
const { data: alert } = await db.from('alerts').select('company_id').eq('id', params.id).single();
if (!alert) return NextResponse.json({ error: 'Not found' }, { status: 404 });
// (add company scope check from session if multi-tenant auth is added)
```

---

## P1 — Fix This Week (Security / Data Quality)

### P1-1 — Fix `constantTimeEqual`: `timingSafeEqual` result is discarded
**Source:** security HIGH-01, bug BUG-011

File: `src/lib/auth/session.ts:41–51`

The result of `crypto.timingSafeEqual(paddedA, paddedB)` is not returned — the function always returns `false` on length mismatch. Constant-time guarantee is void.

**Fix:**
```ts
function constantTimeEqual(a: string, b: string): boolean {
  const aBytes = Buffer.from(a);
  const bBytes = Buffer.from(b);
  if (aBytes.length !== bBytes.length) {
    // Compare against itself to maintain constant time, then return false
    crypto.timingSafeEqual(aBytes, aBytes);
    return false;
  }
  return crypto.timingSafeEqual(aBytes, bBytes);
}
```
Better: HMAC both inputs with a static key and compare digests (always same length).

### P1-2 — Rate limit `/api/auth/login`
**Source:** security HIGH-02

Zero rate limiting — unlimited brute-force attempts. Add in-memory or Vercel KV rate limiting: max 5 attempts per IP per 15 minutes.

### P1-3 — Guard `/api/admin/settings/status` route
**Source:** security HIGH-03

File: `src/app/api/admin/settings/status/route.ts`

Reads session but does not gate on it. Returns Supabase probe results, Thinkific errors, Zoom/Slack config status to unauthenticated callers.
**Fix:** Add `requireAdminOrCron` at top.

### P1-4 — Add security headers to `next.config.ts`
**Source:** security MED-06, infra INFRA-H1

`next.config.ts` is an empty stub. Add:
```ts
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];
// Add in headers() config
```

### P1-5 — Fix `onPace` KPI: `Infinity%` when 0 learners enrolled
**Source:** bug BUG-018

File: `src/app/company/[slug]/page.tsx:67–68`

`safeNumber(0, 1)` returns `0` (0 is a valid number). Division `n/0 = Infinity`. KPI renders `Infinity%`.
**Fix:**
```ts
const total = Math.max(safeNumber(totalEnrolled), 1);
```

### P1-6 — Fix `daysSince` in dashboard page: negative days for future start dates
**Source:** bug BUG-017

File: `src/app/company/[slug]/page.tsx:12–15`

Missing clamp. **Fix:** `return Math.max(0, Math.floor(...))`.

### P1-7 — Fix `getMilestoneDay` false alerts on new/future programs
**Source:** bug BUG-005, BUG-006

File: `src/lib/milestones/benchmark.ts:26–30`

`Math.max(30, milestone)` fires Day-30 benchmark alerts on Day 0. Add guard:
```ts
if (daysSinceStart <= 0) return null; // program not started yet, skip milestone check
```
And in `runMilestoneCheck.ts`: skip if `programDay <= 0`.

### P1-8 — `assignments.thinkific_assignment_id` missing UNIQUE constraint
**Source:** perf PERF-H1, infra INFRA-M3

Without this, `ON CONFLICT` is silently ignored and every sync inserts duplicate rows.
```sql
ALTER TABLE assignments ADD CONSTRAINT assignments_thinkific_assignment_id_unique UNIQUE (thinkific_assignment_id);
```

### P1-9 — Add `maxDuration` to all long-running sync and job routes
**Source:** infra INFRA-M1

Add `export const maxDuration = 300;` to:
- `src/app/api/admin/sync/core/route.ts`
- `src/app/api/admin/sync/surveys/route.ts`
- `src/app/api/admin/sync/assignments/route.ts`
- `src/app/api/admin/sync/zoom/route.ts`
- `src/app/api/jobs/sync-zoom-attendance/route.ts`
- `src/app/api/jobs/run-milestones/route.ts`

---

## P2 — Fix Before Next Feature (Performance / Correctness)

### P2-1 — Daily cron paginates 66k enrollments TWICE (~240s total)
**Source:** perf PERF-01, bug BUG-007

File: `src/app/api/jobs/daily-thinkific-sync/route.ts:19–24`

`syncEnrollments()` + `syncProgress()` = two full Thinkific pagination passes. `syncEnrollmentData()` already exists for this.
**Fix:** Replace:
```ts
// BEFORE:
enrollments: await syncEnrollments(),
progress: await syncProgress(),
// AFTER:
const { enrollments, assignments } = await syncEnrollmentData();
```

### P2-2 — Charts route duplicate query (one result voided)
**Source:** bug BUG-022, perf PERF-02

File: `src/app/api/companies/[slug]/charts/route.ts:42–74`

Delete lines 42–48 (first `statusData` query, immediately voided on line 74).

### P2-3 — Parallelise milestone checks across companies
**Source:** perf PERF-06

File: `src/lib/milestones/runMilestoneCheck.ts:257–262`

`for ... await` serialises companies. **Fix:** `await Promise.all(companies.map(c => runMilestoneCheck(c)))`.

### P2-4 — Dashboard page: drop redundant enrollment/assignment queries
**Source:** perf PERF-05

File: `src/app/company/[slug]/page.tsx:47,51`

`latestMilestone` already has `average_completion_percent`, status counts. The raw enrollment and assignment queries are fully redundant. Drop both.

### P2-5 — Learner page: add pagination and fix snapshot query
**Source:** perf PERF-04

File: `src/app/api/companies/[slug]/learners/route.ts:21–48`

Add `?page=&per_page=50`. Change snapshot query to `.eq('snapshot_date', new Date().toISOString().split('T')[0])` — today's snapshot only.

### P2-6 — Add composite indexes to schema
**Source:** perf PERF-H2, PERF-M2, PERF-M3

```sql
CREATE INDEX idx_learner_status_snapshots_company_date ON learner_status_snapshots(company_id, snapshot_date DESC);
CREATE INDEX idx_daily_snapshots_company_date ON daily_snapshots(company_id, snapshot_date ASC);
CREATE INDEX idx_zoom_attendance_company_join ON zoom_attendance(company_id, attended, join_time DESC);
```

### P2-7 — Learner detail page: add company ownership check
**Source:** bug BUG-020

File: `src/app/company/[slug]/learners/[learnerId]/page.tsx:18–21`

```ts
const { data: learner } = await db.from('learners').select('*').eq('id', learnerId).eq('company_id', company.id).single();
if (!learner) notFound();
```

### P2-8 — Survey pagination: fix infinite loop risk
**Source:** bug BUG-016

File: `src/lib/thinkific/syncSurveys.ts:104`

**Fix:** `hasMore = !!(response.meta?.pagination?.next_page);`

### P2-9 — Fix email domain fuzzy match for company assignment
**Source:** bug BUG-013

File: `src/lib/thinkific/syncUsers.ts:75–80`

Replace substring match with exact domain → company mapping stored in the `companies` table (a `email_domain` column), or require strict equality.

### P2-10 — Fix `lesson_progress` gap: snapshot completion is always 0%
**Source:** bug BUG-014

File: `src/lib/snapshots/createDailySnapshots.ts:43`

`lesson_progress` table is never populated (no sync function exists). Either write `syncLessonProgress` using Thinkific enrollment data, or derive `completion_percent` from `enrollments.progress_percent` (already synced).

---

## P3 — Tech Debt (Clean Up When Convenient)

- **P3-1** — Add `import 'server-only'` to `src/lib/supabase/admin.ts`, `src/lib/auth/session.ts`, `src/lib/thinkific/client.ts`, `src/lib/zoom/client.ts`
- **P3-2** — Hash admin passcodes before storage; don't return raw `code` in GET `/api/admin/passcodes`
- **P3-3** — `syncProgress.ts` is now dead code (progress route uses `syncEnrollments` directly). Delete file.
- **P3-4** — Fix sync log timestamps: `started_at` set at start, `completed_at` set at end (`src/lib/thinkific/syncCore.ts:90–95`)
- **P3-5** — Fix `"lint": "eslint"` → `"lint": "eslint src/"` in `package.json`
- **P3-6** — `assessments/page.tsx:73` — use stored `passed` boolean instead of hardcoded 70% threshold
- **P3-7** — Add `supabase/.temp` to `.gitignore`
- **P3-8** — Enable Supabase RLS on all tables as defense-in-depth (even though service-role bypasses it)
- **P3-9** — Adopt Supabase CLI migrations (`supabase/migrations/`) instead of single `schema.sql`
- **P3-10** — Remove or confirm `pg` devDependency (likely unused)

---

## Summary Counts by Severity

| Priority | Count | Notes |
|---|---|---|
| P0 — Fix Now | 6 | Live breach surface + data corruption |
| P1 — This Week | 9 | Security hardening + data quality |
| P2 — Before Next Feature | 10 | Performance + correctness |
| P3 — Tech Debt | 10 | Clean up / future-proofing |
| **Total** | **35** | |

## What's Working Correctly
- HMAC-SHA256 signed session tokens with nonce and 12h TTL
- All admin WRITE routes properly authenticated
- `THINKIFIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` never exposed to client
- 429 retry logic with `Retry-After` header respect
- Thinkific parallel pagination (significant improvement over sequential)
- Import Assignments reads Supabase only (no Thinkific calls, no 429s)
- `.env.local` gitignored, not committed
- Recharts correctly isolated to client-only bundle
- FK relationships and `updated_at` triggers correct throughout schema
