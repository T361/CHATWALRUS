# Project Status — Honest Audit

> Last audited: 2026-06-13
> Build: `npm run build` ✅ passes (0 TypeScript errors, 37 routes, 87 source files)

---

## Module-by-Module Verdict

### 1. Supabase Clients
| File | Status | Notes |
|------|--------|-------|
| `lib/supabase/client.ts` | **Complete** | Browser-safe, uses anon key only |
| `lib/supabase/server.ts` | **Complete** | Anon key for server components, safe null fallback |
| `lib/supabase/admin.ts` | **Complete** | Service role key, singleton, server-only |

### 2. Thinkific Integration
| File | Status | Notes |
|------|--------|-------|
| `lib/thinkific/client.ts` | **Complete** | Real `fetch` calls with auth headers, pagination |
| `lib/thinkific/syncCore.ts` | **Complete** | Real sync logging to `sync_logs` table |
| `lib/thinkific/syncCourses.ts` | **Complete** | Real API call → Supabase upsert. Lesson sync has TODO for chapters endpoint shape |
| `lib/thinkific/syncUsers.ts` | **Complete** | Real API call → Supabase upsert. Company matching via custom profile fields (may need tuning per Thinkific setup) |
| `lib/thinkific/syncEnrollments.ts` | **Complete** | Real API call → Supabase upsert with FK lookups |
| `lib/thinkific/syncProgress.ts` | **Partial** | Real logic, but Thinkific endpoint for lesson-level progress is a best-guess (`GET /enrollments/{id}`). Marked with TODO. May need empirical validation against live API |
| `lib/thinkific/syncAssignments.ts` | **🔴 SKELETON** | Returns 0 records. Body is `console.log` + `return 0`. No API call. Blocked on Thinkific endpoint confirmation |
| `lib/thinkific/syncSurveys.ts` | **🔴 SKELETON** | Returns 0 records. Body is `console.log` + `return 0`. No API call. Blocked on Thinkific endpoint confirmation |

### 3. Zoom Integration
| File | Status | Notes |
|------|--------|-------|
| `lib/zoom/client.ts` | **Complete** | Real Server-to-Server OAuth with `account_credentials` grant, token caching, `Buffer.from` Base64 encoding |
| `lib/zoom/syncAttendance.ts` | **Complete** | Real API calls: lists users → past meetings → participants → matches by email → inserts to Supabase. Full pipeline |

### 4. Business Logic
| File | Status | Notes |
|------|--------|-------|
| `lib/milestones/benchmark.ts` | **Complete** | `min(100, milestone_day / learning_timeline_days * 100)`. Handles edge cases |
| `lib/milestones/status.ts` | **Complete** | 5-tier classification with Day 90 Zoom logic. All branches covered |
| `lib/milestones/runMilestoneCheck.ts` | **Complete** | Real: fetches learners → calculates status → writes `learner_status_snapshots` + `milestone_checks` → triggers alerts |
| `lib/alerts/createAlert.ts` | **Complete** | Real deduplication (checks for existing open alert) → inserts to `alerts` table |
| `lib/alerts/sendSlackAlert.ts` | **Partial** | Real `fetch` to Slack API when token is set. Falls back to `console.log` when missing. Block Kit message builder is real |
| `lib/snapshots/createDailySnapshots.ts` | **Complete** | Real: loops learners → counts lessons → calculates delta from yesterday → upserts `daily_snapshots` |
| `lib/exports/csv.ts` | **Complete** | Real CSV generation with field escaping |
| `lib/exports/json.ts` | **Complete** | Real JSON download response |

### 5. API Routes
| Route | Status | Notes |
|-------|--------|-------|
| `POST /api/admin/sync/core` | **Complete** | Calls real `syncCourses()` + `syncUsers()` |
| `POST /api/admin/sync/progress` | **Complete** | Calls real `syncProgress()` |
| `POST /api/admin/sync/assignments` | **⚠️ Facade** | Calls `syncAssignments()` which is skeleton → always returns `{ records_processed: 0 }` |
| `POST /api/admin/sync/surveys` | **⚠️ Facade** | Calls `syncSurveys()` which is skeleton → always returns `{ records_processed: 0 }` |
| `POST /api/admin/sync/zoom` | **Complete** | Calls real `syncZoomAttendance()` |
| `POST /api/admin/sync/full` | **Partial** | Calls all syncs, but 2 of 6 are skeleton |
| `POST /api/jobs/daily-thinkific-sync` | **Complete** | Real pipeline + daily snapshots + CRON_SECRET guard |
| `POST /api/jobs/run-milestones` | **Complete** | Real milestone engine + CRON_SECRET guard |
| `POST /api/jobs/sync-zoom-attendance` | **Complete** | Real zoom sync + CRON_SECRET guard |
| `GET /api/companies` | **Complete** | Real DB query |
| `GET /api/companies/[slug]` | **Complete** | Real DB query |
| `PATCH /api/companies/[slug]` | **Complete** | Real update with field whitelist |
| `GET /api/companies/[slug]/dashboard` | **Complete** | Real aggregate queries |
| `GET /api/companies/[slug]/learners` | **Complete** | Real enrichment loop |
| `GET /api/companies/[slug]/charts` | **Complete** | Real aggregation from snapshots |
| `GET /api/companies/[slug]/alerts` | **Complete** | Real DB query |
| `GET /api/companies/[slug]/assessments` | **Complete** | Real DB query with joins |
| `GET /api/companies/[slug]/export/csv` | **Complete** | Real CSV generation + download headers |
| `GET /api/companies/[slug]/export/json` | **Complete** | Real JSON export |
| `PATCH /api/alerts/[id]/review` | **Complete** | Real DB update |
| `PATCH /api/alerts/[id]/action` | **Complete** | Real DB update |
| `GET /api/surveys` | **Complete** | Real DB query with joins. But data depends on `syncSurveys` which is skeleton |
| `GET /api/surveys/export` | **Complete** | Real CSV export |
| `POST /api/auth/login` | **Partial** | Validates passcode against DB, returns role. No session cookie/JWT yet |
| `POST /api/auth/logout` | **🔴 SKELETON** | Returns `{ logged_out: true }` with no logic |
| `GET /api/auth/session` | **🔴 SKELETON** | Always returns `{ authenticated: false }` |
| `GET /api/admin/passcodes` | **Complete** | Real CRUD |
| `PATCH /api/admin/passcodes/[id]` | **Complete** | Real update |
| `GET /api/learners/[id]` | **Complete** | Real DB query with enrollments + zoom |

### 6. Pages (Empty State Handling)
| Page | Empty DB? | Notes |
|------|-----------|-------|
| `/` (Home) | ✅ Handled | Shows "No Companies Found" + link to Settings |
| `/company/[slug]` | ✅ Handled | Shows "Database not connected" warning when no DB |
| `/company/[slug]/learners` | ✅ Handled | Shows "No Learners Found" empty state |
| `/company/[slug]/learners/[id]` | ✅ Handled | Shows "No enrollments/quizzes/assignments found" per section |
| `/company/[slug]/assessments` | ✅ Handled | KPIs show 0/—, empty sections |
| `/company/[slug]/export` | ✅ Handled | Export links still render (CSV will be empty) |
| `/admin/surveys` | ✅ Handled | Shows "No Survey Responses" empty state |
| `/admin/settings` | ✅ Handled | Sync buttons always render, show status after click |

### 7. Schema vs Code Alignment
| Check | Status | Fix Applied? |
|-------|--------|-------------|
| All table names in code match schema | ✅ Pass | — |
| All column names in queries match schema | ✅ Pass | — |
| `lesson_progress` missing `UNIQUE(learner_id, course_id, lesson_id)` | 🔴 Was bug | ✅ Fixed |
| `learner_status_snapshots` missing `UNIQUE(learner_id, snapshot_date)` | 🔴 Was bug | ✅ Fixed |
| `zoom_sessions.zoom_meeting_id` missing `UNIQUE` | 🔴 Was bug | ✅ Fixed |

### 8. Security Audit
| Check | Status |
|-------|--------|
| No `'use client'` file imports admin/thinkific/zoom modules | ✅ Pass |
| `SUPABASE_SERVICE_ROLE_KEY` only in `lib/supabase/admin.ts` | ✅ Pass |
| No `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` anywhere | ✅ Pass |
| Admin client only imported from `lib/` modules (never from pages) | ✅ Pass |
| CRON_SECRET guards all job endpoints | ✅ Pass |
| Thinkific/Zoom API keys never in NEXT_PUBLIC vars | ✅ Pass |

---

## Summary Verdict

| Category | Rating |
|----------|--------|
| Supabase layer | ✅ Complete |
| Thinkific courses/users/enrollments | ✅ Complete (needs live API validation) |
| Thinkific progress | ⚠️ Partial (endpoint shape is a best-guess) |
| Thinkific assignments sync | 🔴 Skeleton (no API call, returns 0) |
| Thinkific surveys sync | 🔴 Skeleton (no API call, returns 0) |
| Zoom OAuth + attendance | ✅ Complete |
| Milestone engine | ✅ Complete |
| Alert engine + dedup | ✅ Complete |
| Daily snapshots | ✅ Complete |
| Slack alerts | ⚠️ Partial (real when token present, console.log fallback) |
| Auth (login/session) | 🔴 Skeleton (no JWT/cookie, session always returns false) |
| CSV/JSON exports | ✅ Complete |
| All API routes | ✅ Complete except 2 skeletons (assignments, surveys sync) and auth |
| All pages | ✅ Complete with empty state handling |
| Schema alignment | ✅ Fixed (3 missing UNIQUE constraints added) |
| Security (secret isolation) | ✅ Complete |
| Build | ✅ Passes (0 errors) |

### Blocked Items
1. **syncAssignments** — Thinkific does not expose a public REST API for assignment submissions. Needs endpoint confirmation or webhook approach.
2. **syncSurveys** — Same: Thinkific survey data may come through lesson content types, webhooks, or a third-party tool. Needs empirical validation.
3. **Auth session management** — Requires implementation of cookie/JWT-based sessions using `APP_SESSION_SECRET`. Login validates passcode but doesn't create a session.
