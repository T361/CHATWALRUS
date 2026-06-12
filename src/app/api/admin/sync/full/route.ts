import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron, unauthorizedJson } from '@/lib/auth/guards';
import { syncCourses } from '@/lib/thinkific/syncCourses';
import { syncUsers } from '@/lib/thinkific/syncUsers';
import { syncEnrollments } from '@/lib/thinkific/syncEnrollments';
import { syncProgress } from '@/lib/thinkific/syncProgress';
import { syncAssignments } from '@/lib/thinkific/syncAssignments';
import { syncSurveys } from '@/lib/thinkific/syncSurveys';

export async function POST(req: NextRequest) {
  if (!requireAdminOrCron(req)) return unauthorizedJson();
  try {
    const results = {
      courses: await syncCourses(),
      users: await syncUsers(),
      enrollments: await syncEnrollments(),
      progress: await syncProgress(),
      assignments: await syncAssignments(),
      surveys: await syncSurveys(),
    };

    const totalRecords = Object.values(results).reduce((s, r) => s + r.recordsProcessed, 0);

    return NextResponse.json({ status: 'success', results, records_processed: totalRecords });
  } catch (error) {
    return NextResponse.json({ status: 'error', error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
