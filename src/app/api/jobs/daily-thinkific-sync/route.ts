export const maxDuration = 300;
import { NextRequest, NextResponse } from 'next/server';
import { syncCourses } from '@/lib/thinkific/syncCourses';
import { syncUsers } from '@/lib/thinkific/syncUsers';
import { syncEnrollmentData } from '@/lib/thinkific/syncEnrollmentData';
import { createDailySnapshots } from '@/lib/snapshots/createDailySnapshots';
import { createSyncLog, summarizeSyncResults, updateSyncLog, type SyncResult } from '@/lib/thinkific/syncCore';
import { requireCronSecret } from '@/lib/auth/guards';
import { isAdminConfigured } from '@/lib/supabase/admin';
import { runAllMilestoneChecks } from '@/lib/milestones/runMilestoneCheck';
import { syncSurveys } from '@/lib/thinkific/syncSurveys';

export async function POST(req: NextRequest) {
  const authError = requireCronSecret(req);
  if (authError) return authError;

  const logId = await createSyncLog('daily-thinkific-sync', 'running');

  try {
    const courses = await syncCourses();
    const users = await syncUsers();
    // Single Thinkific pass for enrollments + assignments (was two passes before)
    const { enrollments, assignments } = await syncEnrollmentData();
    const results: Record<string, SyncResult> = { courses, users, enrollments, assignments };

    // Surveys sync (chapter feedback from /reviews)
    const surveys = await syncSurveys();
    results.surveys = surveys;

    // Daily snapshots — must run after enrollment sync so progress_percent is current
    const snapshotCount = await createDailySnapshots();
    results.snapshots = {
      syncType: 'snapshots',
      status: isAdminConfigured() ? 'success' : 'skipped',
      recordsProcessed: snapshotCount,
      errorMessage: isAdminConfigured() ? undefined : 'Supabase admin not configured',
    };

    // Milestone checks — runs after snapshots so learner status is up to date
    const milestoneResults = await runAllMilestoneChecks();
    results.milestones = {
      syncType: 'milestones',
      status: 'success',
      recordsProcessed: milestoneResults.length,
    };

    const summary = summarizeSyncResults(results);

    if (logId) {
      await updateSyncLog(logId, {
        status: summary.status,
        records_processed: summary.recordsProcessed,
        error_message: summary.status === 'success' ? undefined : summary.message,
      });
    }

    return NextResponse.json({
      status: summary.status,
      message: summary.message,
      results,
      records_processed: summary.recordsProcessed,
      snapshots_created: snapshotCount,
      milestones_run: milestoneResults.length,
      sync_log_id: logId,
    }, { status: summary.status === 'failed' ? 500 : 200 });
  } catch (error) {
    if (logId) {
      await updateSyncLog(logId, {
        status: 'failed',
        error_message: error instanceof Error ? error.message : String(error),
      });
    }

    return NextResponse.json({
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      sync_log_id: logId,
    }, { status: 500 });
  }
}
