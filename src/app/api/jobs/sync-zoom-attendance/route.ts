import { NextRequest, NextResponse } from 'next/server';
import { syncZoomAttendance } from '@/lib/zoom/syncAttendance';
import { requireCronSecret } from '@/lib/auth/guards';
import { createSyncLog, updateSyncLog } from '@/lib/thinkific/syncCore';

// Vercel sends GET for cron jobs — both GET and POST run the same sync.
export async function GET(req: NextRequest) {
  const authError = requireCronSecret(req);
  if (authError) return authError;
  return runZoomSync();
}

export async function POST(req: NextRequest) {
  const authError = requireCronSecret(req);
  if (authError) return authError;
  return runZoomSync();
}

async function runZoomSync(): Promise<NextResponse> {
  const logId = await createSyncLog('zoom_attendance_cron', 'running');
  try {
    const result = await syncZoomAttendance();
    if (logId) {
      await updateSyncLog(logId, {
        status: result.status,
        records_processed: result.recordsProcessed,
        error_message: result.errorMessage,
      });
    }
    return NextResponse.json({ status: result.status, records_processed: result.recordsProcessed, sync_log_id: logId });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (logId) await updateSyncLog(logId, { status: 'failed', error_message: msg });
    return NextResponse.json({ status: 'error', error: msg, sync_log_id: logId }, { status: 500 });
  }
}
