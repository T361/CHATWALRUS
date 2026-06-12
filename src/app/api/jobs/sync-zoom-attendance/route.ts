import { NextRequest, NextResponse } from 'next/server';
import { syncZoomAttendance } from '@/lib/zoom/syncAttendance';

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
