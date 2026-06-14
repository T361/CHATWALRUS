# Security Audit — ChatWalrus CSM Dashboard
**Date:** 2026-06-15

---

## CRITICAL

### CRIT-01 — 9 GET routes expose PII with zero authentication
Files: `src/app/api/companies/route.ts`, `src/app/api/companies/[slug]/route.ts` (GET), `src/app/api/companies/[slug]/dashboard/route.ts`, `src/app/api/companies/[slug]/learners/route.ts`, `src/app/api/companies/[slug]/alerts/route.ts`, `src/app/api/companies/[slug]/assessments/route.ts`, `src/app/api/companies/[slug]/charts/route.ts`, `src/app/api/learners/[id]/route.ts`, `src/app/api/surveys/route.ts`

Every one of these routes calls `createAdminClient()` (service-role, bypasses RLS) and returns data with no `requireAdminOrCron` guard. Any unauthenticated HTTP client can dump all learner names, emails, departments, quiz scores, survey free-text, and company KPIs.

### CRIT-02 — Alert mutation routes have no company-ownership validation (horizontal privilege escalation)
Files: `src/app/api/alerts/[id]/action/route.ts:16–26`, `src/app/api/alerts/[id]/review/route.ts:16–26`

Both PATCH endpoints update `alerts.id = {id}` directly with no verification that the alert belongs to any scoped company. An authenticated caller can mutate any alert in the DB by guessing IDs. `actioned_by` is taken from `body.actioned_by` — caller can forge the audit trail identity.

### CRIT-03 — No `middleware.ts` — the entire app is publicly accessible without a session
No `src/middleware.ts` exists. Every page — `/company/[slug]`, `/admin/settings`, `/admin/surveys` — is publicly accessible. Server pages call `createAdminClient()` and render sensitive data for any anonymous visitor.

---

## HIGH

### HIGH-01 — `constantTimeEqual` has a length-oracle timing leak
File: `src/lib/auth/session.ts:44–47`

`timingSafeEqual(paddedA, paddedB)` result is discarded. Function unconditionally returns `false` on length mismatch. Still leaks length information via branching. Fix: HMAC both inputs and compare digests.

### HIGH-02 — No rate limiting on `/api/auth/login`
File: `src/app/api/auth/login/route.ts` — zero rate limiting, unlimited guesses. Plaintext passcode comparison.

### HIGH-03 — `/api/admin/settings/status` returns infra probe results to unauthenticated callers
File: `src/app/api/admin/settings/status/route.ts:104–141` — reads session but does NOT gate on it. Returns Supabase/Thinkific error messages, integration probe results, configured services.

### HIGH-04 — No CSRF protection on login/logout/PATCH routes
Session cookie uses `sameSite: 'lax'` but no CSRF tokens, no Origin/Referer checks.

---

## MEDIUM

- **MED-01** — `secure` cookie flag off outside `NODE_ENV === 'production'`
- **MED-02** — `GET /api/surveys` returns all surveys cross-company, no scope, no auth (`src/app/api/surveys/route.ts:7`)
- **MED-03** — `GET /api/learners/[id]` no company-scope check; UUID enumeration possible
- **MED-04** — `PATCH /api/admin/passcodes/[id]` no allowlist on `status`/`role` values
- **MED-05** — Passcodes stored in plaintext; GET response returns raw `code` field
- **MED-06** — No security headers (`next.config.ts` empty): missing CSP, X-Frame-Options, HSTS, Referrer-Policy
- **MED-07** — `actioned_by`/`reviewed_by` taken from user-supplied request body, stored in DB (stored XSS risk if ever rendered unescaped)

---

## LOW

- **LOW-01** — No `import 'server-only'` in `src/lib/supabase/admin.ts`, `src/lib/auth/session.ts`, `src/lib/thinkific/client.ts`, `src/lib/zoom/client.ts`
- **LOW-02** — `APP_SESSION_SECRET` has no minimum entropy enforcement
- **LOW-03** — `actioned_by` defaults to hardcoded string `'admin'`, not derived from verified session
- **LOW-04** — Charts route: dead query result explicitly voided (`src/app/api/companies/[slug]/charts/route.ts:74`)

---

## What IS Correctly Implemented
- `.env*` properly gitignored
- HMAC-SHA256 session tokens with nonce (prevents replay)
- 12-hour TTL with `exp` verified on every request
- `THINKIFIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are NOT `NEXT_PUBLIC_*`
- Cookie is `httpOnly: true`
- `companies/[slug]` PATCH uses explicit allowlist for updatable fields
- All write routes inside `/api/admin/` correctly call `requireAdminOrCron`

---

## Priority Fix Order
1. Add `src/middleware.ts` gating all routes behind session (CRIT-03)
2. Add `requireAdminOrCron` to all 9 unprotected GET handlers (CRIT-01)
3. Add company-ownership check to alert action/review routes (CRIT-02)
4. Fix `constantTimeEqual` (HIGH-01)
5. Rate limit `/api/auth/login` (HIGH-02)
6. Guard `/api/admin/settings/status` (HIGH-03)
7. Add security headers in `next.config.ts` (MED-06)
8. Hash passcodes; remove raw `code` from GET response (MED-05)
9. Add `import 'server-only'` to server-only libs (LOW-01)
