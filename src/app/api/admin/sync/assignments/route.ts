import { NextResponse } from 'next/server';
import { syncAssignments } from '@/lib/thinkific/syncAssignments';

export async function POST() {
  try {
    const result = await syncAssignments();
    return NextResponse.json({ status: result.status, records_processed: result.recordsProcessed, error: result.errorMessage });
  } catch (error) {
    return NextResponse.json({ status: 'error', error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
