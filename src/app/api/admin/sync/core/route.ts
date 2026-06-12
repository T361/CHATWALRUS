import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron, unauthorizedJson } from '@/lib/auth/guards';
import { syncCourses } from '@/lib/thinkific/syncCourses';
import { syncUsers } from '@/lib/thinkific/syncUsers';

export async function POST(req: NextRequest) {
  if (!requireAdminOrCron(req)) return unauthorizedJson();
  try {
    const courseResult = await syncCourses();
    const userResult = await syncUsers();

    return NextResponse.json({
      status: 'success',
      results: { courses: courseResult, users: userResult },
      records_processed: (courseResult.recordsProcessed || 0) + (userResult.recordsProcessed || 0),
    });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
