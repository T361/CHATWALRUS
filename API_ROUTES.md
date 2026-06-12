# API Routes

## Authentication
| Method | Route | Purpose | Auth |
|--------|-------|---------|------|
| POST | `/api/auth/login` | Login with passcode | None |
| POST | `/api/auth/logout` | Clear session | None |
| GET | `/api/auth/session` | Check session status | None |

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
| GET | `/api/companies/[slug]/export/csv` | CSV export (type param) | None |
| GET | `/api/companies/[slug]/export/json` | Full company JSON export | None |

## Admin Sync
| Method | Route | Purpose | Auth |
|--------|-------|---------|------|
| POST | `/api/admin/sync/core` | Sync courses + users | Admin |
| POST | `/api/admin/sync/progress` | Sync lesson progress | Admin |
| POST | `/api/admin/sync/assignments` | Sync assignments | Admin |
| POST | `/api/admin/sync/surveys` | Sync surveys | Admin |
| POST | `/api/admin/sync/zoom` | Sync Zoom attendance | Admin |
| POST | `/api/admin/sync/full` | Full sync (all above) | Admin |

## Protected Jobs (CRON_SECRET)
| Method | Route | Purpose | Auth |
|--------|-------|---------|------|
| POST | `/api/jobs/daily-thinkific-sync` | Daily data sync + snapshots | CRON_SECRET |
| POST | `/api/jobs/run-milestones` | Run milestone checks | CRON_SECRET |
| POST | `/api/jobs/sync-zoom-attendance` | Sync Zoom attendance | CRON_SECRET |

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
