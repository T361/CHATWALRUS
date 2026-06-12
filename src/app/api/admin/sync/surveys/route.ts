import { NextResponse } from 'next/server';
import { syncSurveys } from '@/lib/thinkific/syncSurveys';

export async function POST() {
  try {
    const result = await syncSurveys();
    return NextResponse.json({ status: result.status, records_processed: result.recordsProcessed, error: result.errorMessage });
  } catch (error) {
    return NextResponse.json({ status: 'error', error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
