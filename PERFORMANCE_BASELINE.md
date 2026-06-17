# Performance Baseline

This rollout adds timing instrumentation and replaces the main proven hot paths that were slowing the dashboard:

- `POST /api/auth/login`
- middleware session verification
- `/api/admin/settings/status`
- `/api/companies`
- `/api/companies/[slug]/learners`
- `/api/learners`
- homepage company list load
- client-side learner directory fetches
- client-side settings status loads

## Proven Bottlenecks Addressed

- Homepage company loading previously scanned `learner_status_snapshots` on each request.
- Company learner pages previously loaded the full learner roster and filtered in the browser.
- Settings loaded integration probes eagerly, including outbound Thinkific/Supabase checks, before the page settled.
- Session analytics were not surfaced through dedicated company-level read paths.

## Durability Strategy

- Add `company_summary_rollups` for company cards and counts.
- Add learner directory views for server-side filtering and pagination.
- Add hot-path composite indexes for snapshots, enrollments, learners, and Zoom attendance.
- Add short-lived server-side TTL caching for stable metadata and analytics.
- Invalidate caches after sync jobs that change dashboard-visible data.

## Verification Commands

- `npm run lint`
- `npm run typecheck`
- `npm run build`

## Runtime Notes

- Server timing logs emit through `src/lib/perf.ts`.
- Client timing logs emit through `src/lib/perf-client.ts`.
- Logging is enabled in non-production by default and can be forced with:
  - `ENABLE_PERF_LOGS=1`
  - `NEXT_PUBLIC_ENABLE_PERF_LOGS=1`
