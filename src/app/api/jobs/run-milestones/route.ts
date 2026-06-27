export const maxDuration = 300;
import { NextRequest, NextResponse } from 'next/server';
import { runAllMilestoneChecks, runMilestoneChecksChunk } from '@/lib/milestones/runMilestoneCheck';
import { requireAdminOrCron } from '@/lib/auth/guards';

// Chunked GET — safe for Vercel Hobby 60s limit.
// Processes limit companies per call. Client loops until done=true.
export async function GET(req: NextRequest) {
  const authError = requireAdminOrCron(req);
  if (authError) return authError;
  const offset = parseInt(req.nextUrl.searchParams.get('offset') ?? '0', 10) || 0;
  const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '20', 10) || 20;
  try {
    const result = await runMilestoneChecksChunk({ offset, limit });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ status: 'error', error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authError = requireAdminOrCron(req);
  if (authError) return authError;

  try {
    const results = await runAllMilestoneChecks();
    return NextResponse.json({
      status: 'success',
      companies_checked: results.length,
      results: results.map((r) => ({
        companyId: r.companyId,
        milestoneDay: r.milestoneDay,
        alertTriggered: r.alertTriggered,
      })),
    });
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
