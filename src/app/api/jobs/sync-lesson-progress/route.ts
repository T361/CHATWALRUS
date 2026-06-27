import { NextRequest, NextResponse } from 'next/server';
import { requireCronSecret } from '@/lib/auth/guards';

// Thinkific v1 API has no lesson-level progress endpoint (/course_progress returns 404).
// This cron route is kept as a no-op so vercel.json doesn't break if the entry is restored.
// Vercel sends GET for cron jobs — both methods return the same unavailable response.
export async function GET(req: NextRequest) {
  const authError = requireCronSecret(req);
  if (authError) return authError;
  return NextResponse.json({
    status: 'unavailable',
    message: 'Thinkific v1 API has no lesson-level progress endpoint. Remove this cron from vercel.json.',
    records_processed: 0,
  });
}

export async function POST(req: NextRequest) {
  const authError = requireCronSecret(req);
  if (authError) return authError;
  return NextResponse.json({
    status: 'unavailable',
    message: 'Thinkific v1 API has no lesson-level progress endpoint. Remove this cron from vercel.json.',
    records_processed: 0,
  });
}
