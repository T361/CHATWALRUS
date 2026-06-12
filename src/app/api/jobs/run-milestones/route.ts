import { NextRequest, NextResponse } from 'next/server';
import { runAllMilestoneChecks } from '@/lib/milestones/runMilestoneCheck';
import { requireCronSecret, unauthorizedJson } from '@/lib/auth/guards';

export async function POST(req: NextRequest) {
  if (!requireCronSecret(req)) return unauthorizedJson();

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
