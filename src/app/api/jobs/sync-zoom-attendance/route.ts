import { NextRequest, NextResponse } from 'next/server';
import { syncZoomAttendance } from '@/lib/zoom/syncAttendance';
import { requireCronSecret } from '@/lib/auth/guards';

export async function POST(req: NextRequest) {
  const authError = requireCronSecret(req);
  if (authError) return authError;

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
