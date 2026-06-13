import { NextRequest, NextResponse } from 'next/server';
import { runAllMilestoneChecks } from '@/lib/milestones/runMilestoneCheck';
import { requireCronSecret } from '@/lib/auth/guards';

export async function POST(req: NextRequest) {
  const authError = requireCronSecret(req);
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
