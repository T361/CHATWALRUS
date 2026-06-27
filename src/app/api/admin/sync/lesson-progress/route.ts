export const maxDuration = 300;
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth/guards';
import { syncLessonProgress } from '@/lib/thinkific/syncLessonProgress';

// Thinkific v1 API has no lesson-level progress endpoint.
// GET returns unavailable immediately so callers get a clear signal.
export async function GET(req: NextRequest) {
  const authError = requireAdminOrCron(req);
  if (authError) return authError;
  return NextResponse.json({
    status: 'unavailable',
    message: 'Thinkific v1 API has no lesson-level progress endpoint (/course_progress returns 404). This feature requires a Thinkific partner/private API.',
    recordsProcessed: 0,
    total: 0,
    nextOffset: 0,
    done: true,
  });
}

// Full POST — only works on Vercel Pro (300s) or local dev
export async function POST(req: NextRequest) {
  const authError = requireAdminOrCron(req);
  if (authError) return authError;
  try {
    const result = await syncLessonProgress();
    return NextResponse.json({
      status: result.status,
      records_processed: result.recordsProcessed,
      error: result.errorMessage,
    });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
