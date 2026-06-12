import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron, unauthorizedJson } from '@/lib/auth/guards';
import { syncSurveys } from '@/lib/thinkific/syncSurveys';

export async function POST(req: NextRequest) {
  if (!requireAdminOrCron(req)) return unauthorizedJson();
  try {
    const result = await syncSurveys();
    return NextResponse.json({
      status: result.status,
      records_processed: result.recordsProcessed,
      message: result.errorMessage
    });
  } catch (error) {
    return NextResponse.json({ status: 'error', message: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
