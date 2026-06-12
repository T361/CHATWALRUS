import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron, unauthorizedJson } from '@/lib/auth/guards';
import { syncZoomAttendance } from '@/lib/zoom/syncAttendance';

export async function POST(req: NextRequest) {
  if (!requireAdminOrCron(req)) return unauthorizedJson();
  try {
    const result = await syncZoomAttendance();
    return NextResponse.json({ status: result.status, records_processed: result.recordsProcessed, error: result.errorMessage });
  } catch (error) {
    return NextResponse.json({ status: 'error', error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
