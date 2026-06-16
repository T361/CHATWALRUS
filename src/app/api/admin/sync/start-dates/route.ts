import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth/guards';
import { syncStartDates } from '@/lib/thinkific/syncStartDates';

export async function POST(req: NextRequest) {
  const authError = requireAdminOrCron(req);
  if (authError) return authError;
  try {
    const result = await syncStartDates();
    return NextResponse.json({
      status: result.status,
      records_processed: result.recordsProcessed,
      message: result.errorMessage,
    }, { status: result.status === 'error' ? 500 : 200 });
  } catch (error) {
    return NextResponse.json(
      { status: 'failed', error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
