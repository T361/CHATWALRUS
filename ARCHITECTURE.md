# ChatWalrus - System Architecture

## Data Pipeline

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
│  Thinkific   │────▶│  Next.js Backend │────▶│   Supabase   │
│  REST API    │     │  (Server-only)   │     │  (Postgres)  │
└──────────────┘     └──────────────────┘     └──────┬───────┘
                                                     │
┌──────────────┐     ┌──────────────────┐            │
│  Zoom S2S    │────▶│  Next.js Backend │────────────┘
│  OAuth       │     │  (Server-only)   │
└──────────────┘     └──────────────────┘

                     ┌──────────────────┐     ┌──────────────┐
                     │  Next.js Pages   │────▶│  Dashboard   │
                     │  (Server/Client) │     │  (Browser)   │
                     └──────────────────┘     └──────────────┘
```

## Key Design Decisions

1. **Server-Only API Calls**: Thinkific and Zoom APIs are never called from the browser. All API credentials are server-only.
2. **Supabase Dual Client**: Anon key for dashboard reads, Service Role for sync writes.
3. **Sync Logging**: Every sync operation writes to sync_logs for auditability.
4. **Alert Deduplication**: Prevents duplicate alerts for the same company and alert type.
5. **Status Engine**: 5-tier learner classification with Zoom attendance integration after Day 90.

## Modules

| Module | Purpose | Location |
|--------|---------|----------|
| Supabase Client | Browser-safe DB access | `lib/supabase/client.ts` |
| Supabase Server | Server component DB access | `lib/supabase/server.ts` |
| Supabase Admin | Service role operations | `lib/supabase/admin.ts` |
| Thinkific Client | API auth & pagination | `lib/thinkific/client.ts` |
| Zoom Client | S2S OAuth & API calls | `lib/zoom/client.ts` |
| Milestone Engine | Benchmark & status calc | `lib/milestones/` |
| Alert Engine | Alert creation & dedup | `lib/alerts/` |
| Snapshot Service | Daily progress snapshots | `lib/snapshots/` |
| Export Utils | CSV & JSON generation | `lib/exports/` |

## Security Boundaries

- `NEXT_PUBLIC_*` variables: Safe for browser
- All other env vars: Server-only, never exposed
- CRON_SECRET: Protects job endpoints
- Service role key: Admin operations only
- No Klaviyo integration
- No business logic in n8n
