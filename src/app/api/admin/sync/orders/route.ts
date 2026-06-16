export const maxDuration = 300;
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth/guards';
import { syncOrders } from '@/lib/thinkific/syncOrders';

export async function POST(req: NextRequest) {
  const authError = requireAdminOrCron(req);
  if (authError) return authError;
  try {
    const result = await syncOrders();
    return NextResponse.json({ status: result.status, records_processed: result.recordsProcessed, error: result.errorMessage });
  } catch (error) {
    return NextResponse.json({ status: 'error', error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
