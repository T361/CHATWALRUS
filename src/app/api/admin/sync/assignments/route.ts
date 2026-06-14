import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth/guards';
import { syncAssignments } from '@/lib/thinkific/syncAssignments';

export async function POST(req: NextRequest) {
  const authError = requireAdminOrCron(req);
  if (authError) return authError;
  try {
    const result = await syncAssignments();
    return NextResponse.json({
      status: result.status,
      records_processed: result.recordsProcessed,
      message: result.errorMessage,
    });
  } catch (error) {
    return NextResponse.json({ status: 'error', message: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
