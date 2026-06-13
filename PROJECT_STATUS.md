# Project Status — Honest Audit

> Last audited: 2026-06-13 (final audit-hardening pass)
> Build: `npm run build` ✅ passes (0 TypeScript errors, 22 app routes)
> Lint: `npm run lint` ✅ 0 errors, 1 warning (`@next/next/no-page-custom-font` in `layout.tsx`)
> Typecheck: `npm run typecheck` ✅ passes (uses `tsc --noEmit`)

---

## Status Legend

| Status | Meaning |
|--------|---------|
| **Complete** | Real implementation; works when env + credentials are present |
| **Partial** | Real code path exists but incomplete, unvalidated, or UX/security gaps remain |
| **Skeleton** | Placeholder/stub; returns static or no-op behavior |
| **Blocked** | Cannot proceed without client credentials or external API confirmation |

---

## Module Status Table

| Area | Module / Route | Status | Notes |
|------|----------------|--------|-------|
| **Build** | `npm run build` | **Complete** | Compiles cleanly; static generation logs Supabase warning when env missing (expected) |
| **Build** | `npm run lint` | **Complete** | 1 non-blocking font warning |
| **Build** | `npm run typecheck` | **Complete** | Script added to `package.json`; runs `tsc --noEmit` |
| **Env** | `.env.example` | **Complete** | All required vars documented (Supabase, Thinkific, Zoom, CRON, Slack, session secrets) |
| **Env** | Missing Supabase | **Complete** | API routes return `{ error: "Database not configured" }` (503); pages show warning banners |
| **Env** | Missing Thinkific | **Complete** | Sync functions return `{ status: "skipped", errorMessage: "Thinkific not configured" }` |
| **Env** | Missing Zoom | **Complete** | `syncZoomAttendance()` returns skipped status |
| **Env** | Missing Slack | **Complete** | `sendSlackAlert()` logs to console; no crash |
| **Env** | Secrets in repo | **Complete** | `.env*` gitignored; no real keys found in tracked files |
| **Env** | `APP_SESSION_SECRET` / `ADMIN_PASSCODE_SECRET` | **Complete** | Used server-side for signed 12h admin sessions and admin passcode login |
| **Supabase** | `lib/supabase/client.ts` | **Complete** | Anon key only; warns + placeholder when missing |
| **Supabase** | `lib/supabase/server.ts` | **Complete** | Safe null fallback via `createServerClientSafe()` |
| **Supabase** | `lib/supabase/admin.ts` | **Complete** | Service role server-only; singleton |
| **Supabase** | Schema ↔ query alignment | **Complete** | All `.from()` table/column names match `supabase/schema.sql` |
| **Supabase** | Upsert `onConflict` keys | **Complete** | All conflict keys have matching UNIQUE constraints (see below) |
| **Supabase** | Live database | **Blocked** | Supabase project/env not fully configured yet |
| **Auth** | `POST /api/auth/login` | **Complete** | Validates `ADMIN_PASSCODE_SECRET`, sets signed httpOnly `chatwalrus_admin_session` cookie |
| **Auth** | `GET /api/auth/session` | **Complete** | Verifies signed admin session cookie and returns real authenticated state |
| **Auth** | `POST /api/auth/logout` | **Complete** | Clears admin session cookie |
| **Auth** | `lib/auth/guards.ts` | **Complete** | `CRON_SECRET` fails closed; admin routes accept valid session or valid cron bearer only |
| **Auth** | Admin Settings sync UI | **Complete** | Same-origin sync calls work with httpOnly admin session cookie; no browser cron secret |
| **Auth** | Passcode admin UI | **Skeleton** | Settings page shows placeholder text; API CRUD exists but UI not wired |
| **Thinkific** | `lib/thinkific/client.ts` | **Complete** | Real authenticated fetch + pagination |
| **Thinkific** | `syncCourses` | **Partial** | Real `/courses` upsert; lesson sync helper exists but is not called from any sync route |
| **Thinkific** | `syncUsers` | **Complete** | Real `/users` upsert; company match via custom profile field (may need client tuning) |
| **Thinkific** | `syncEnrollments` | **Complete** | Real `/enrollments` upsert; only in Full Sync + daily cron (not Core Sync button) |
| **Thinkific** | `syncProgress` | **Partial** | Real loop over enrollments; uses best-guess `GET /enrollments/{id}` — endpoint shape unvalidated |
| **Thinkific** | `syncAssignments` | **Blocked** | Returns honest `skipped` + message; no Thinkific REST endpoint confirmed |
| **Thinkific** | `syncSurveys` | **Blocked** | Returns honest `skipped` + message; no Thinkific REST endpoint confirmed |
| **Thinkific** | Live API validation | **Blocked** | Needs `THINKIFIC_API_KEY` + `THINKIFIC_SUBDOMAIN` from client |
| **Zoom** | `lib/zoom/client.ts` | **Complete** | Real Server-to-Server OAuth (`account_credentials`), token cache, Base64 Basic auth |
| **Zoom** | `syncZoomAttendance` | **Partial** | Real pipeline with `zoom_attendance.dedupe_key` upsert; participant/meeting errors are non-fatal (warn and continue); live credentials still needed |
| **Zoom** | Live API validation | **Blocked** | Needs `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` from client |
| **Business** | Milestone engine | **Complete** | Real calculations, snapshots, alerts |
| **Business** | Alert dedup | **Complete** | Prevents duplicate open alerts per company + type |
| **Business** | Slack alerts | **Partial** | Real Slack API call when token set; **not wired** into milestone flow (`sendSlackAlert` never called) |
| **Business** | Daily snapshots | **Complete** | Real upsert loop |
| **Business** | CSV/JSON exports | **Complete** | Real generation + download headers |
| **API** | Public read routes | **Complete** | Company/learner/dashboard/chart/alert/survey reads work without auth (by design) |
| **API** | Admin/sync/write routes | **Complete** | Protected by signed admin session or valid cron bearer |
| **API** | Job routes | **Complete** | `CRON_SECRET` Bearer guard fails closed; missing secret returns 503 |
| **API** | `POST /api/admin/sync/core` | **Complete** | Aggregates child sync statuses honestly (`success`, `partial`, `skipped`, `failed`) |
| **API** | `POST /api/admin/sync/assignments` | **Complete** | Honest skipped JSON |
| **API** | `POST /api/admin/sync/surveys` | **Complete** | Honest skipped JSON |
| **Pages** | All dashboard pages | **Complete** | Empty DB handled; no `"Company undefined"` strings found |
| **Pages** | Client → server imports | **Complete** | No `'use client'` file imports admin/thinkific/zoom modules |
| **Pages** | Learners CSV link | **Complete** | Protected export links work for logged-in admins via httpOnly session cookie |

---

## Thinkific Endpoints Currently Used

| Method | Endpoint | Used By | Status |
|--------|----------|---------|--------|
| GET | `/courses` (paginated) | `syncCourses` | Complete |
| GET | `/courses/{id}/chapters` (paginated) | `syncCourseLessons` | Partial (helper not invoked by sync routes) |
| GET | `/users` (paginated) | `syncUsers` | Complete |
| GET | `/enrollments` (paginated) | `syncEnrollments` | Complete |
| GET | `/enrollments/{id}` | `syncProgress` | Partial (response shape unvalidated) |

**Not implemented (blocked):** assignment submissions, survey/feedback responses.

---

## Zoom Endpoints Currently Used

| Method | Endpoint | Used By |
|--------|----------|---------|
| POST | `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=…` | `getZoomToken` |
| GET | `/users` | `syncZoomAttendance` |
| GET | `/users/{id}/meetings?type=previous_meetings` | `syncZoomAttendance` |
| GET | `/past_meetings/{uuid}/participants` | `syncZoomAttendance` |

---

## Upsert `onConflict` ↔ Schema UNIQUE Constraints

| Table | `onConflict` | Schema constraint | Match |
|-------|--------------|-------------------|-------|
| `courses` | `thinkific_course_id` | `UNIQUE` | ✅ |
| `lessons` | `thinkific_lesson_id` | `UNIQUE` | ✅ |
| `learners` | `thinkific_user_id` | `UNIQUE` | ✅ |
| `enrollments` | `thinkific_enrollment_id` | `UNIQUE` | ✅ |
| `lesson_progress` | `learner_id,course_id,lesson_id` | `UNIQUE(learner_id, course_id, lesson_id)` | ✅ |
| `daily_snapshots` | `learner_id,snapshot_date` | `UNIQUE(learner_id, snapshot_date)` | ✅ |
| `learner_status_snapshots` | `learner_id,snapshot_date` | `UNIQUE(learner_id, snapshot_date)` | ✅ |
| `milestone_checks` | `company_id,milestone_day` | `UNIQUE(company_id, milestone_day)` | ✅ |
| `zoom_sessions` | `zoom_meeting_id` | `UNIQUE` | ✅ |
| `zoom_attendance` | `dedupe_key` | `UNIQUE` | ✅ |

`zoom_attendance.dedupe_key` is additive. Existing live rows, if any, must be deduped before applying the UNIQUE constraint.

---

## Route Protection Audit

### Protected by `requireAdminOrCron`

Allows a valid signed admin session cookie or valid `Authorization: Bearer <CRON_SECRET>`. Returns 401 `{ error: "Unauthorized" }` when denied, or 503 `{ error: "Cron secret not configured" }` when a cron bearer is supplied but `CRON_SECRET` is missing.

- `POST /api/admin/sync/core`
- `POST /api/admin/sync/progress`
- `POST /api/admin/sync/assignments`
- `POST /api/admin/sync/surveys`
- `POST /api/admin/sync/zoom`
- `POST /api/admin/sync/full`
- `GET|POST /api/admin/passcodes`
- `PATCH /api/admin/passcodes/[id]`
- `PATCH /api/companies/[slug]`
- `GET /api/companies/[slug]/export/csv`
- `GET /api/companies/[slug]/export/json`
- `GET /api/surveys/export`
- `PATCH /api/alerts/[id]/review`
- `PATCH /api/alerts/[id]/action`

### Protected by `requireCronSecret`

Requires `Authorization: Bearer <CRON_SECRET>`. Returns 503 when `CRON_SECRET` is missing and 401 when the bearer is missing or invalid.

- `POST /api/jobs/daily-thinkific-sync`
- `POST /api/jobs/run-milestones`
- `POST /api/jobs/sync-zoom-attendance`

### Intentionally public (read-only UI support)

- `GET /api/companies`
- `GET /api/companies/[slug]`
- `GET /api/companies/[slug]/dashboard`
- `GET /api/companies/[slug]/learners`
- `GET /api/companies/[slug]/charts`
- `GET /api/companies/[slug]/alerts`
- `GET /api/companies/[slug]/assessments`
- `GET /api/learners/[id]`
- `GET /api/surveys`
- `POST /api/auth/login` (public by design; validates server-only admin passcode)
- `GET /api/auth/session`, `POST /api/auth/logout`

---

## Security Checks

| Check | Result |
|-------|--------|
| No `'use client'` imports of admin/thinkific/zoom | ✅ Pass |
| `SUPABASE_SERVICE_ROLE_KEY` only in `lib/supabase/admin.ts` | ✅ Pass |
| No `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` | ✅ Pass |
| Thinkific/Zoom keys not in `NEXT_PUBLIC_*` vars | ✅ Pass |
| Real secrets committed | ✅ None found |

---

## Summary Verdict

| Category | Rating |
|----------|--------|
| Build & TypeScript | ✅ Complete |
| Env handling (graceful degradation) | ✅ Complete |
| Supabase layer (code) | ✅ Complete |
| Supabase (live connection) | 🔴 Blocked — env not configured |
| Thinkific courses/users/enrollments | ✅ Complete (needs live validation) |
| Thinkific progress | ⚠️ Partial |
| Thinkific assignments/surveys | 🔴 Blocked (honest skip in place) |
| Zoom OAuth + attendance sync | ⚠️ Partial (real code with dedup; needs credentials) |
| Milestone / alert engine | ✅ Complete |
| Slack delivery | ⚠️ Partial (implemented but not wired) |
| Auth / sessions | ✅ Complete (minimal admin session) |
| Route protection | ✅ Complete |
| Dashboard pages | ✅ Complete |
| Schema alignment | ✅ Complete |
