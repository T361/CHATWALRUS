# Smoke Test Report — 2026-06-17

> All scenarios verified by code inspection (no live DB or API calls).
> "From code" = behavior derived by reading the actual implementation.

---

## Scenario 1: Empty Database Homepage

**How to test:** Clear all rows from `companies` table; visit `/`

**Expected (from code):**
- Page renders without error
- `companies.length === 0 && !dbError` block triggers
- Renders "No Companies Found" empty state card with "Go to Settings" link
- No crash, no "undefined" in DOM

**Evidence:** `src/app/page.tsx` lines 101-108

**Verdict: PASS**

---

## Scenario 2: Admin Login with Wrong Passcode

**How to test:** `POST /api/auth/login` with `{ "passcode": "wrong" }`

**Expected (from code):**
- `verifyAdminPasscode("wrong")` → `constantTimeEqual("wrong", env.ADMIN_PASSCODE_SECRET)` → false
- Returns `HTTP 401 { "error": "Invalid passcode" }`
- No session cookie set

**Evidence:** `src/app/api/auth/login/route.ts` lines 27-29

**Verdict: PASS**

---

## Scenario 3: Admin Login with Correct Passcode

**How to test:** `POST /api/auth/login` with `{ "passcode": "<ADMIN_PASSCODE_SECRET>" }`

**Expected (from code):**
- `verifyAdminPasscode` returns true
- `createAdminSessionToken()` creates HMAC-signed token with 12h TTL
- Returns `HTTP 200 { "authenticated": true, "role": "admin", "expires_at": "..." }`
- Sets `chatwalrus_admin_session` cookie: httpOnly=true, secure=true (production), sameSite=lax

**Evidence:** `src/app/api/auth/login/route.ts` lines 27-43; `src/lib/auth/session.ts` lines 124-139

**Verdict: PASS**

---

## Scenario 4: Protected Route Without Auth

**How to test:** `GET /api/companies/[slug]/learners` with no cookie

**Expected (from code):**
- Middleware checks `ADMIN_SESSION_COOKIE` → no cookie → `getAdminSessionEdge` returns null
- `pathname.startsWith('/api/')` → returns `HTTP 401 { "error": "Unauthorized" }`
- Route handler never executes

**Evidence:** `src/middleware.ts` lines 79-87

**Verdict: PASS**

---

## Scenario 5: Job Route Without CRON_SECRET

**How to test:** `POST /api/jobs/daily-thinkific-sync` with no Authorization header

**Expected (from code):**
- Middleware: `/api/jobs/` is a CRON_PATH; no bearer token → falls through to session check → no session → 401
- OR if somehow reached the handler: `requireCronSecret` → `getBearerToken` returns null → `unauthorizedJson()` → 401

**Note:** If `CRON_SECRET` env var is missing entirely and a bearer IS provided: returns 503 `{ "error": "Cron secret not configured" }`.

**Evidence:** `src/middleware.ts` lines 68-76; `src/lib/auth/guards.ts` lines 28-35

**Verdict: PASS (fail-closed on both paths)**

---

## Scenario 6: Zoom Missing → Skipped State

**How to test:** Remove ZOOM_* env vars; `POST /api/admin/sync/zoom`

**Expected (from code):**
- `syncZoomAttendance()` calls `isZoomConfigured()` → returns false
- Returns `{ syncType: "zoom_attendance", status: "skipped", recordsProcessed: 0, errorMessage: "Zoom not configured" }`
- HTTP 200; no crash; sync log records "skipped"

**Evidence:** `src/lib/zoom/syncAttendance.ts` lines 47-49

**Verdict: PASS**

---

## Scenario 7: Export Unauthorized State

**How to test:** `GET /api/companies/[slug]/export/csv` with no auth cookie

**Expected (from code):**
- Middleware intercepts at `/api/` path → 401
- If middleware bypassed: `requireAdminOrCron` → 401

**Evidence:** `src/app/api/companies/[slug]/export/csv/route.ts` lines 9-10; `src/middleware.ts`

**Verdict: PASS**

---

## Scenario 8: Thinkific Key Missing State

**How to test:** Remove THINKIFIC_API_KEY; run any Thinkific sync

**Expected (from code):**
- `isThinkificConfigured()` returns false
- All sync functions check this first and return `{ status: "skipped", errorMessage: "Thinkific not configured" }`
- No HTTP calls attempted

**Evidence:** `src/lib/thinkific/client.ts` lines 13-23; checked in `syncCourses`, `syncUsers`, `syncEnrollments`, `syncSurveys`, `syncLessonProgress`

**Verdict: PASS**

---

## Scenario 9: Missing APP_SESSION_SECRET

**How to test:** Remove APP_SESSION_SECRET env var; try to access admin

**Expected (from code):**
- `isAdminAuthConfigured()` returns false
- Login page shows "Auth not configured — set APP_SESSION_SECRET and ADMIN_PASSCODE_SECRET"
- `POST /api/auth/login` returns 503 `{ "error": "Admin auth not configured" }`

**Evidence:** `src/app/api/auth/login/route.ts` lines 10-13; `src/lib/auth/session.ts` lines 58-60

**Verdict: PASS**

---

## Known Gaps (Not Tested — Blocked)

| Gap | Reason |
|---|---|
| Live Thinkific sync returning real data | Thinkific credentials returned 401 as of 2026-06-14 |
| Live Supabase DB reads | Supabase admin key was rejected with "Invalid API key" as of 2026-06-14 |
| Zoom attendance dedup correctness | Requires live Zoom credentials |
| Daily cron actually firing on Vercel | Requires vercel.json cron config to be deployed and verified |
