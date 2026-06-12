import { NextRequest, NextResponse } from 'next/server';
import { runAllMilestoneChecks } from '@/lib/milestones/runMilestoneCheck';

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
