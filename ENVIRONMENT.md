# Environment Variables

## Public (Safe for frontend)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key (RLS enforced) |

## Server-Only (NEVER expose to frontend)

| Variable | Purpose |
|----------|---------|
| `SUPABASE_SERVICE_ROLE_KEY` | Full database access, bypasses RLS |
| `THINKIFIC_API_KEY` | Thinkific API authentication |
| `THINKIFIC_SUBDOMAIN` | Thinkific site subdomain |
| `THINKIFIC_BASE_URL` | API base URL (default: https://api.thinkific.com/api/public/v1) |
| `ZOOM_ACCOUNT_ID` | Zoom Server-to-Server OAuth |
| `ZOOM_CLIENT_ID` | Zoom OAuth client |
| `ZOOM_CLIENT_SECRET` | Zoom OAuth secret |
| `CRON_SECRET` | Protects scheduled job endpoints |
| `SLACK_BOT_TOKEN` | Optional Slack integration |
| `SLACK_DEFAULT_CHANNEL_ID` | Default Slack channel for alerts |
| `APP_SESSION_SECRET` | Session encryption |
| `ADMIN_PASSCODE_SECRET` | Admin passcode encryption |

## Security Rules

- Never prefix server-only vars with `NEXT_PUBLIC_`
- Never create `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`
- Never commit `.env.local`
- Missing vars cause graceful fallback, not crashes
- Supabase anon key is safe for frontend because RLS controls access
- Service role key bypasses RLS and must stay server-side

## Missing Env Behavior

- **Supabase missing**: Pages show "Database not connected" warning
- **Thinkific missing**: Sync operations return `skipped` status
- **Zoom missing**: Zoom sync returns `skipped` status
- **Slack missing**: Alerts log to console instead of sending
- **CRON_SECRET missing**: Job endpoints are unprotected (for development)
