import { NextRequest, NextResponse } from 'next/server';
import { syncZoomAttendance } from '@/lib/zoom/syncAttendance';
import { requireCronSecret, unauthorizedJson } from '@/lib/auth/guards';

export async function POST(req: NextRequest) {
  if (!requireCronSecret(req)) return unauthorizedJson();

  try {
    const result = await syncZoomAttendance();
    return NextResponse.json({ status: result.status, records_processed: result.recordsProcessed });
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
