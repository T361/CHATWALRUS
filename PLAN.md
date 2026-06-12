# ChatWalrus Engagement Dashboard - Implementation Plan

## Overview
Internal customer success dashboard that syncs Thinkific learning progress into Supabase, calculates learner/company engagement health, integrates Zoom live-session attendance, and provides CSMs with dashboard views, alerts, exports, and survey analytics.

## Architecture
Thinkific API → Next.js Backend → Supabase → Dashboard UI
Zoom S2S OAuth → Next.js Backend → Supabase → High Engagement Logic

## Phases

### Phase 0: Repo Inspection ✅
- Empty repository confirmed
- Next.js initialized from scratch

### Phase 1: Documentation ✅
- PLAN.md, ARCHITECTURE.md, PROJECT_STATUS.md, NEXT_STEPS.md
- ENVIRONMENT.md, API_ROUTES.md

### Phase 2: Project Foundation ✅
- Next.js 16 App Router with TypeScript
- Tailwind CSS 4
- Supabase client, server, admin clients
- Base layout, Navbar, PageShell

### Phase 3: Database Schema ✅
- supabase/schema.sql with 16 tables
- TypeScript types for all entities
- Indexes, triggers, constraints

### Phase 4: Static UI + Data Layer ✅
- Home page (company grid)
- Company dashboard (KPI cards, alerts, navigation)
- Learners page (search, filter, table)
- Learner detail page (enrollments, quizzes, assignments)
- Assessments page (KPI overview)
- Export page (CSV/JSON download links)
- Surveys page (ratings, feedback cards)
- Admin settings page (sync buttons, integration status)

### Phase 5: Supabase Data Layer ✅
- Server component queries for companies, learners, dashboards
- API routes for client-side data fetching
- Safe missing-env handling

### Phase 6: Thinkific Core Sync ✅
- API client with auth headers and pagination
- Course sync, user sync, enrollment sync
- Sync logs for all operations

### Phase 7: Progress Sync ✅
- Lesson-level progress sync
- Field normalization (completed/finished/completed_at)
- Raw payload storage

### Phase 8: Daily Snapshots ✅
- Snapshot service with delta calculation
- Per-learner daily metrics

### Phase 9: Status Engine ✅
- 5-tier learner status: not_started, at_risk, slightly_behind, on_track, high_engagement
- Benchmark calculation: milestone_day / learning_timeline_days * 100
- High Engagement rules for pre/post Day 90

### Phase 10: Milestone Alert Engine ✅
- Company-level milestone checks
- Alert creation with deduplication
- average_below_benchmark and risk_concentration alerts

### Phase 11: Zoom Attendance ✅
- Server-to-Server OAuth client
- Meeting/participant sync
- Email matching to learners

### Phase 12: Assessments, Surveys, Exports ✅
- Assignment and survey sync skeletons
- CSV export (learners, assessments, surveys, attendance)
- JSON full company export
- Survey analytics dashboard

### Phase 13: Cron, Slack, Admin ✅
- Protected job endpoints with CRON_SECRET
- Slack alert skeleton with Block Kit messages
- Admin sync buttons wired to routes

### Phase 14: QA ✅
- Build passes with zero errors
- All routes compile
- No secrets exposed
- Missing env handled gracefully
