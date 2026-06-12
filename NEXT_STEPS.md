# Next Steps

## Immediate: Connect to Real Supabase

1. Create a Supabase project at https://supabase.com
2. Run `supabase/schema.sql` in the SQL editor
3. Copy project URL and keys to `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```
4. Add a test company:
   ```sql
   INSERT INTO companies (name, slug, start_date, learning_timeline_days)
   VALUES ('Demo Company', 'demo-company', '2026-01-01', 90);
   ```
5. Run `npm run dev` and verify the home page shows the company

## Then: Connect Thinkific

1. Get API key from Thinkific admin panel
2. Add to `.env.local`:
   ```
   THINKIFIC_API_KEY=your-key
   THINKIFIC_SUBDOMAIN=your-subdomain
   ```
3. Go to Admin Settings → Run "Import Core Data"
4. Check sync logs in Supabase

## Pending Backend Integrations

1. Validate Thinkific endpoint for assignments sync (Currently returning skipped)
2. Validate Thinkific endpoint for survey sync (Currently returning skipped)
3. Implement Auth Session Management (Currently returning skeleton values)

1. Create Server-to-Server OAuth app in Zoom Marketplace
2. Add scopes: report:read:admin, meeting:read:admin, user:read:admin
3. Add to `.env.local`:
   ```
   ZOOM_ACCOUNT_ID=...
   ZOOM_CLIENT_ID=...
   ZOOM_CLIENT_SECRET=...
   ```
4. Run "Sync Zoom Attendance" from Admin Settings

## Files NOT to touch
- `supabase/schema.sql` (finalized)
- `src/types/*` (stable)
- `src/lib/supabase/*` (stable)

## Verification
```bash
npm run build
npm run dev
```
