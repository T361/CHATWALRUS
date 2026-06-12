import { NextRequest, NextResponse } from 'next/server';
import { syncCourses } from '@/lib/thinkific/syncCourses';
import { syncUsers } from '@/lib/thinkific/syncUsers';
import { syncEnrollments } from '@/lib/thinkific/syncEnrollments';
import { syncProgress } from '@/lib/thinkific/syncProgress';
import { createDailySnapshots } from '@/lib/snapshots/createDailySnapshots';
import { createSyncLog } from '@/lib/thinkific/syncCore';
import { requireCronSecret, unauthorizedJson } from '@/lib/auth/guards';

export async function POST(req: NextRequest) {
  // Verify CRON_SECRET
  if (!requireCronSecret(req)) return unauthorizedJson();

  const logId = await createSyncLog('daily-thinkific-sync', 'running');

  try {
    await syncCourses();
    await syncUsers();
    await syncEnrollments();
    await syncProgress();
    const snapshotCount = await createDailySnapshots();

    return NextResponse.json({
      status: 'success',
      snapshots_created: snapshotCount,
      sync_log_id: logId,
    });
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      sync_log_id: logId,
    }, { status: 500 });
  }
}
