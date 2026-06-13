import { NextRequest, NextResponse } from 'next/server';
import { syncCourses } from '@/lib/thinkific/syncCourses';
import { syncUsers } from '@/lib/thinkific/syncUsers';
import { syncEnrollments } from '@/lib/thinkific/syncEnrollments';
import { syncProgress } from '@/lib/thinkific/syncProgress';
import { createDailySnapshots } from '@/lib/snapshots/createDailySnapshots';
import { createSyncLog, summarizeSyncResults, updateSyncLog, type SyncResult } from '@/lib/thinkific/syncCore';
import { requireCronSecret } from '@/lib/auth/guards';
import { isAdminConfigured } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  const authError = requireCronSecret(req);
  if (authError) return authError;

  const logId = await createSyncLog('daily-thinkific-sync', 'running');

  try {
    const results: Record<string, SyncResult> = {
      courses: await syncCourses(),
      users: await syncUsers(),
      enrollments: await syncEnrollments(),
      progress: await syncProgress(),
    };
    const snapshotCount = await createDailySnapshots();
    results.snapshots = {
      syncType: 'snapshots',
      status: isAdminConfigured() ? 'success' : 'skipped',
      recordsProcessed: snapshotCount,
      errorMessage: isAdminConfigured() ? undefined : 'Supabase admin not configured',
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
