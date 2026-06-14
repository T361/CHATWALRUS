# Infrastructure & DB Audit — ChatWalrus CSM Dashboard
**Date:** 2026-06-15

---

## CRITICAL

### INFRA-C1 — RLS disabled on all 17 tables
`supabase/schema.sql:438–441` — all RLS statements commented out. Since all routes use service-role key (bypasses RLS), internally consistent — but zero defense-in-depth if any route switches to anon key.

### INFRA-C2 — 9 API routes unprotected (see security-audit.md CRIT-01)
Same issue cross-referenced. All use service-role client with no auth guard.

---

## HIGH

### INFRA-H1 — Empty `next.config.ts` — no security headers
Missing: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`.

### INFRA-H2 — `constantTimeEqual` bug (see security-audit.md HIGH-01)

### INFRA-H3 — No versioned migrations
Only a single `schema.sql` file. No `supabase/migrations/` directory. Schema drift undetectable. Any ALTER TABLE must be done manually with no audit trail.

---

## MEDIUM

### INFRA-M1 — Missing `maxDuration` on 5+ sync routes
`vercel.json` only covers 3 routes. Missing:
- `src/app/api/admin/sync/core/route.ts`
- `src/app/api/admin/sync/surveys/route.ts`
- `src/app/api/admin/sync/assignments/route.ts`
- `src/app/api/admin/sync/zoom/route.ts`
- `src/app/api/jobs/sync-zoom-attendance/route.ts`
- `src/app/api/jobs/run-milestones/route.ts`

These default to 10s on Hobby or silently cap at plan limit.

### INFRA-M2 — `learners.email` not UNIQUE
No unique constraint — re-syncs can create duplicate learner records if Thinkific user IDs change.

### INFRA-M3 — `assignments.thinkific_assignment_id` not UNIQUE
Upserts silently INSERT duplicates on every sync (see perf-audit PERF-H1).

---

## LOW

- **INFRA-L1** — Missing composite indexes (see perf-audit for details)
- **INFRA-L2** — `supabase/.temp/` not in `.gitignore`
- **INFRA-L3** — `"lint": "eslint"` in package.json runs with no path argument, produces no output. Fix: `"lint": "eslint src/"`
- **INFRA-L4** — `pg@^8.21.0` in devDependencies may be unused — verify and remove
- **INFRA-L5** — Zero test coverage for auth, sync, or milestone calculation logic

---

## Passes
- `.env*` correctly gitignored; `.env.local` not committed
- All env vars in code have matching `.env.example` entries
- `admin.ts` throws on missing vars (fail-fast)
- `typecheck` script present and passes
- All cron job handlers use `requireCronSecret`
- FK relationships correct throughout schema
- `updated_at` triggers applied to all mutable tables
- Core indexes present on `company_id`, `learner_id`, `thinkific_*_id` columns
