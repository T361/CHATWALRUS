export const maxDuration = 300;
import { NextRequest, NextResponse } from 'next/server';
import { requireCronSecret } from '@/lib/auth/guards';
import { syncLessonProgress } from '@/lib/thinkific/syncLessonProgress';
import { createSyncLog, updateSyncLog } from '@/lib/thinkific/syncCore';

export async function POST(req: NextRequest) {
  const authError = requireCronSecret(req);
  if (authError) return authError;

  const logId = await createSyncLog('lesson_progress_cron', 'running');

  try {
    const result = await syncLessonProgress();

    if (logId) {
      await updateSyncLog(logId, {
        status: result.status,
        records_processed: result.recordsProcessed,
        error_message: result.errorMessage,
      });
    }

    return NextResponse.json({
      status: result.status,
      records_processed: result.recordsProcessed,
      sync_log_id: logId,
    });
  } catch (error) {
    if (logId) {
      await updateSyncLog(logId, {
        status: 'failed',
        error_message: error instanceof Error ? error.message : String(error),
      });
    }
    return NextResponse.json(
      { status: 'failed', error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
