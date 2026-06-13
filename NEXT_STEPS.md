# Next Steps

Ordered checklist once client credentials arrive. No new architecture required — validate, connect, and finish skeleton pieces.

---

## Step 1: Supabase (unblocks all dashboard data)

1. Create a Supabase project at https://supabase.com
2. Run `supabase/schema.sql` in the SQL editor (includes `zoom_attendance.dedupe_key` UNIQUE dedup)
3. Copy keys into `.env.local` (from `.env.example`):

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

4. Seed a test company:

   ```sql
   INSERT INTO companies (name, slug, start_date, learning_timeline_days)
   VALUES ('Demo Company', 'demo-company', '2026-01-01', 90);
   ```

5. Verify:
   - `npm run build` (should pass without Supabase warning at build time if env loaded)
   - `npm run dev` → home page lists company (or shows honest empty state)
   - `GET /api/companies` returns JSON (not 503)

If `zoom_attendance` already contains live rows, dedupe existing rows before applying the new `dedupe_key` UNIQUE constraint.

---

## Step 2: Admin auth and cron secrets

1. Generate local/server-only secrets:

   ```bash
   openssl rand -base64 32
   ```

2. Add to `.env.local`:

   ```env
   APP_SESSION_SECRET=your-random-session-secret
   ADMIN_PASSCODE_SECRET=your-admin-login-passcode
   CRON_SECRET=your-random-cron-secret
   ```

3. Verify admin auth:

   ```bash
   curl -i -X POST http://localhost:3000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"passcode":"your-admin-login-passcode"}'
   ```

4. Use the returned httpOnly cookie in the browser for Admin Settings sync buttons. Do not send `CRON_SECRET` from client-side code.

5. Use `CRON_SECRET` only for server-side schedulers or curl:

   ```bash
   curl -X POST http://localhost:3000/api/jobs/daily-thinkific-sync \
     -H "Authorization: Bearer $CRON_SECRET"
   ```

---

## Step 3: Thinkific (unblocks core engagement data)

1. Obtain from Thinkific admin:
   - API key
   - Subdomain

2. Add to `.env.local`:

   ```env
   THINKIFIC_API_KEY=your-key
   THINKIFIC_SUBDOMAIN=your-subdomain
   ```

3. Run sync from Admin Settings after logging in, or test by curl with the server-only cron secret:

   ```bash
   curl -X POST http://localhost:3000/api/admin/sync/core \
     -H "Authorization: Bearer $CRON_SECRET"
   ```

4. Run sync pipeline in order:
   - **Core** (`/api/admin/sync/core`) — courses + users
   - **Full** (`/api/admin/sync/full`) — adds enrollments + progress (+ honest skips for assignments/surveys)
   - Or use daily job: `POST /api/jobs/daily-thinkific-sync` with same Bearer token

5. Validate in Supabase:
   - `sync_logs` rows with `status = success`
   - Rows in `courses`, `learners`, `enrollments`
   - `lesson_progress` after progress sync (confirm Thinkific response shape)

6. **Empirical validation needed:**
   - `GET /enrollments/{id}` response shape for `syncProgress` — adjust mapping if fields differ
   - Whether `/courses/{id}/chapters` returns `contents[]` as expected — wire `syncCourseLessons` into sync flow if confirmed
   - Company assignment: confirm which Thinkific custom profile field maps learners to companies

---

## Step 4: Thinkific assignments & surveys (blocked on API source)

1. With client Thinkific admin access, confirm whether assignment submissions and survey responses are available via:
   - Public REST endpoints
   - Webhooks
   - Lesson content types / exports

2. Once endpoint is confirmed, implement fetch + upsert in:
   - `src/lib/thinkific/syncAssignments.ts`
   - `src/lib/thinkific/syncSurveys.ts`

3. Re-run `/api/admin/sync/assignments` and `/api/admin/sync/surveys` — should return `success` with `records_processed > 0`

---

## Step 5: Zoom (unblocks live session attendance)

1. Create Server-to-Server OAuth app in Zoom Marketplace
2. Scopes: `report:read:admin`, `meeting:read:admin`, `user:read:admin`
3. Add to `.env.local`:

   ```env
   ZOOM_ACCOUNT_ID=...
   ZOOM_CLIENT_ID=...
   ZOOM_CLIENT_SECRET=...
   ```

4. Sync:

   ```bash
   curl -X POST http://localhost:3000/api/admin/sync/zoom \
     -H "Authorization: Bearer $CRON_SECRET"
   ```

5. Verify `zoom_sessions` and `zoom_attendance` populated; learner email match rate against `learners.email`
6. Re-running Zoom sync should update existing `zoom_attendance` rows by `dedupe_key`, not duplicate them

---

## Step 6: Auth/admin follow-up

1. Minimal admin cookie sessions are implemented and use `APP_SESSION_SECRET`
2. Admin Settings sync buttons work with the httpOnly admin session cookie
3. Passcode management UI is still a placeholder; wire it to existing `/api/admin/passcodes` routes when needed

---

## Step 7: Optional integrations

### Slack alerts

```env
SLACK_BOT_TOKEN=xoxb-...
SLACK_DEFAULT_CHANNEL_ID=C0123456789
```

Wire `sendSlackAlert()` into milestone alert flow in `runMilestoneCheck.ts`.

### Production cron jobs

Schedule with Bearer `CRON_SECRET`:

| Job | Route |
|-----|-------|
| Daily Thinkific sync | `POST /api/jobs/daily-thinkific-sync` |
| Milestone checks | `POST /api/jobs/run-milestones` |
| Zoom attendance | `POST /api/jobs/sync-zoom-attendance` |

---

## Verification commands

```bash
npm run build
npm run lint
npm run dev
```

---

## Files safe to leave unchanged (unless validation finds a bug)

- `supabase/schema.sql`
- `src/types/*`
- `src/lib/supabase/*`
- `src/lib/thinkific/syncAssignments.ts` / `syncSurveys.ts` (until endpoints confirmed)
