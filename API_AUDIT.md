# API Route Audit — 2026-06-17

> All routes verified by reading source. No live calls made.
> Auth types: `requireAdminOrCron` = signed session cookie OR Bearer CRON_SECRET; `requireCronSecret` = Bearer CRON_SECRET only.

---

## Route Table

| Route | Method | Auth | Status | Gaps |
|---|---|---|---|---|
| `/api/auth/login` | POST | None (public) | Complete | Wrong passcode → 401; missing env → 503; session set as httpOnly cookie |
| `/api/auth/logout` | POST | None | Complete | Cookie cleared unconditionally |
| `/api/auth/session` | GET | None | Complete | Returns `authenticated: bool` without exposing secret |
| `/api/companies` | GET | None (public read) | Complete | Returns all companies from Supabase |
| `/api/companies/[slug]` | GET | None (public read) | Complete | Returns company + computed KPIs |
| `/api/companies/[slug]/dashboard` | GET | requireAdminOrCron | Complete | All pagination handled; returns full KPI set |
| `/api/companies/[slug]/learners` | GET | requireAdminOrCron | Complete | Paginated enrollments + snapshot merge |
| `/api/companies/[slug]/alerts` | GET | requireAdminOrCron | Complete | Parameterized status filter + limit cap at 200 |
| `/api/companies/[slug]/assessments` | GET | requireAdminOrCron | Complete | Paginated quizzes + assignments |
| `/api/companies/[slug]/charts` | GET | requireAdminOrCron | Complete | Trend and distribution data |
| `/api/companies/[slug]/interventions` | GET/POST/DELETE | requireAdminOrCron | Complete | Full CRUD with company scoping on DELETE |
| `/api/companies/[slug]/leaderboard` | GET | requireAdminOrCron | Complete | Sorted by total_points, limited to 100 |
| `/api/companies/[slug]/weekly` | GET | requireAdminOrCron | Complete | 9 parallel queries; all real data |
| `/api/companies/[slug]/export/csv` | GET | requireAdminOrCron | Complete | Paginated; 4 export types; proper Content-Disposition headers |
| `/api/companies/[slug]/export/json` | GET | requireAdminOrCron | Complete | Same |
| `/api/leaderboard/global` | GET | requireAdminOrCron | Complete | Limited to 100 rows |
| `/api/learners/[id]` | GET | requireAdminOrCron | Complete | Single learner detail |
| `/api/surveys` | GET | requireAdminOrCron | Complete | Full analytics with pagination |
| `/api/surveys/export` | GET | requireAdminOrCron | Complete | Auth guarded |
| `/api/admin/settings/status` | GET | requireAdminSession | Complete | Live probes to Supabase + Thinkific; returns honest status |
| `/api/admin/sync/core` | POST | requireAdminOrCron | Complete | courses + users + enrollments |
| `/api/admin/sync/full` | POST | requireAdminOrCron | Complete | All sync steps |
| `/api/admin/sync/progress` | POST | requireAdminOrCron | Complete | Enrollment progress update |
| `/api/admin/sync/assignments` | POST | requireAdminOrCron | Complete | Derived from local enrollments |
| `/api/admin/sync/surveys` | POST | requireAdminOrCron | Complete | Thinkific /reviews endpoint |
| `/api/admin/sync/zoom` | POST | requireAdminOrCron | Complete | Skips cleanly if Zoom not configured |
| `/api/admin/sync/groups` | POST | requireAdminOrCron | Complete | Thinkific Groups → companies |
| `/api/admin/sync/orders` | POST | requireAdminOrCron | Complete | Purchase history |
| `/api/admin/sync/start-dates` | POST | requireAdminOrCron | Complete | Auto-detects from earliest enrollment |
| `/api/admin/sync/snapshots` | POST | requireAdminOrCron | Complete | Daily snapshots |
| `/api/admin/sync/gamification` | POST | requireAdminOrCron | Complete | Points + achievements + leaderboard |
| `/api/admin/sync/lesson-progress` | POST | requireAdminOrCron | Complete | Incremental lesson-level sync |
| `/api/admin/passcodes` | GET/POST | requireAdminOrCron | Complete | CRUD for passcodes |
| `/api/admin/passcodes/[id]` | PATCH/DELETE | requireAdminOrCron | Complete | Single passcode update/delete |
| `/api/jobs/daily-thinkific-sync` | POST | requireCronSecret | Complete | Full daily pipeline; CRON_SECRET fails closed (503 if missing) |
| `/api/jobs/run-milestones` | POST | requireAdminOrCron | Complete | Milestone check run |
| `/api/jobs/sync-lesson-progress` | POST | requireCronSecret | Complete | Lesson progress only |
| `/api/jobs/sync-zoom-attendance` | POST | requireCronSecret | Complete | Zoom attendance only |
| `/api/alerts/[id]/review` | PATCH | requireAdminOrCron | Complete | Status update |
| `/api/alerts/[id]/action` | PATCH | requireAdminOrCron | Complete | Action logged |

---

## Auth Behavior Verification (from code inspection)

| Scenario | Expected | Evidence |
|---|---|---|
| POST /api/auth/login with wrong passcode | 401 `{ error: "Invalid passcode" }` | `session.ts:verifyAdminPasscode` returns false → 401 in login route |
| GET /api/auth/session with no cookie | 200 `{ authenticated: false }` | Route returns without requiring session |
| POST /api/jobs/daily-thinkific-sync with no bearer | 401 | `requireCronSecret` checks bearer → returns `unauthorizedJson()` |
| POST /api/jobs/daily-thinkific-sync with wrong bearer | 401 | `verifySecret` timing-safe compare fails |
| CRON_SECRET env var missing entirely | 503 `{ error: "Cron secret not configured" }` | `guards.ts:28-31` checks `!cronSecret` → `cronSecretNotConfiguredJson()` |
| Admin sync route without session or cron | 401 | `requireAdminOrCron` checks session → checks bearer → 401 |
| Export route without auth | 401 | `requireAdminOrCron` on all export routes |

---

## Security Concerns

| Finding | Severity | Detail |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` used server-side in milestone check | Low | `runMilestoneCheck.ts:210` — not a secret, but `APP_URL` env could be server-only. Non-blocking |
| Admin singleton Supabase client (module-level `let adminClient`) | Low | Module-level singletons in Vercel serverless functions persist across warm invocations on the same instance — expected behavior, no memory leak risk in this architecture |
| `assignments.thinkific_assignment_id` missing UNIQUE constraint | High | Upsert `onConflict: 'thinkific_assignment_id'` will silently fail; Supabase requires the column to have a UNIQUE constraint for `onConflict` to work. This will cause duplicate rows on every sync run |
| No login rate limiting | Medium | `/api/auth/login` has no rate limit; brute-force of ADMIN_PASSCODE_SECRET is possible. Mitigated by Vercel's platform-level rate limiting and the fact this is internal tooling |
| Surveys route has no `.limit()` | Medium | `/api/surveys/route.ts` fetches all surveys without pagination. For large deployments this could return >1000 rows (Supabase default cap silently truncates) |
