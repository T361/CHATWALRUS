export const maxDuration = 300;
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth/guards';
import { syncLessonProgress, syncLessonProgressChunk } from '@/lib/thinkific/syncLessonProgress';

// Chunked GET — safe for Vercel Hobby 60s limit.
// Client calls GET ?offset=0&limit=20, then ?offset=next_offset until done=true.
export async function GET(req: NextRequest) {
  const authError = requireAdminOrCron(req);
  if (authError) return authError;
  const offset = parseInt(req.nextUrl.searchParams.get('offset') ?? '0', 10) || 0;
  const limit  = parseInt(req.nextUrl.searchParams.get('limit')  ?? '20', 10) || 20;
  try {
    const result = await syncLessonProgressChunk({ offset, limit });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ status: 'error', error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
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
