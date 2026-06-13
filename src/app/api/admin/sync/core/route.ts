import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth/guards';
import { syncCourses } from '@/lib/thinkific/syncCourses';
import { syncUsers } from '@/lib/thinkific/syncUsers';
import { summarizeSyncResults } from '@/lib/thinkific/syncCore';

export async function POST(req: NextRequest) {
  const authError = requireAdminOrCron(req);
  if (authError) return authError;
  try {
    const courseResult = await syncCourses();
    const userResult = await syncUsers();
    const results = { courses: courseResult, users: userResult };
    const summary = summarizeSyncResults(results);

    return NextResponse.json({
      status: summary.status,
      message: summary.message,
      results,
      records_processed: summary.recordsProcessed,
    }, { status: summary.status === 'failed' ? 500 : 200 });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
