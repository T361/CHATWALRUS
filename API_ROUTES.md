# API Routes

## Authentication
| Method | Route | Purpose | Auth |
|--------|-------|---------|------|
| POST | `/api/auth/login` | Login with `ADMIN_PASSCODE_SECRET`; sets signed httpOnly admin cookie | None |
| POST | `/api/auth/logout` | Clear admin session cookie | None |
| GET | `/api/auth/session` | Check signed admin session status | None |

## Companies
| Method | Route | Purpose | Auth |
|--------|-------|---------|------|
| GET | `/api/companies` | List active companies | None |
| GET | `/api/companies/[slug]` | Get company details | None |

## Dashboard Data
| Method | Route | Purpose | Auth |
|--------|-------|---------|------|
| GET | `/api/companies/[slug]/learners` | Learners with progress/status | None |

## Surveys
| Method | Route | Purpose | Auth |
|--------|-------|---------|------|
| GET | `/api/surveys` | All survey responses with stats | None |

## Exports
| Method | Route | Purpose | Auth |
|--------|-------|---------|------|
| GET | `/api/companies/[slug]/export/csv` | CSV export (type param) | Admin |
| GET | `/api/companies/[slug]/export/json` | Full company JSON export | Admin |

## Admin Sync
| Method | Route | Purpose | Auth |
|--------|-------|---------|------|
| POST | `/api/admin/sync/core` | Sync courses + users | Admin |
| POST | `/api/admin/sync/progress` | Sync lesson progress | Admin |
| POST | `/api/admin/sync/assignments` | Sync assignments | Admin |
| POST | `/api/admin/sync/surveys` | Sync surveys | Admin |
| POST | `/api/admin/sync/zoom` | Sync Zoom attendance | Admin |
| POST | `/api/admin/sync/full` | Full sync (all above) | Admin |

`Admin` means a valid `chatwalrus_admin_session` httpOnly cookie or server-side `Authorization: Bearer <CRON_SECRET>`.

## Protected Jobs (CRON_SECRET)
| Method | Route | Purpose | Auth |
|--------|-------|---------|------|
| POST | `/api/jobs/daily-thinkific-sync` | Daily data sync + snapshots | CRON_SECRET |
| POST | `/api/jobs/run-milestones` | Run milestone checks | CRON_SECRET |
| POST | `/api/jobs/sync-zoom-attendance` | Sync Zoom attendance | CRON_SECRET |

Missing `CRON_SECRET` returns `503 { "error": "Cron secret not configured" }`. Missing or invalid bearer returns `401 { "error": "Unauthorized" }`.

## Alert Management
| Method | Route | Purpose | Auth |
|--------|-------|---------|------|
| PATCH | `/api/alerts/[id]/review` | Mark alert as reviewed | Admin |
| PATCH | `/api/alerts/[id]/action` | Mark alert as actioned | Admin |

## CSV Export Types
Use `?type=` query parameter:
- `learners` (default) - Learner progress
- `assessments` - Quiz data
- `surveys` - Survey responses
- `attendance` - Zoom attendance

## Sync Response Statuses
Aggregate sync routes can return:
- `success` - all child sync operations completed
- `partial` - mixed success/skipped/error child results
- `skipped` - all child sync operations skipped, usually missing external credentials
- `failed` - all child sync operations failed
