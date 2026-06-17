import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth/guards';
import { getThinkificExpansionFeasibilityReport } from '@/lib/thinkific/expansionFeasibility';

export async function GET(req: NextRequest) {
  const authError = requireAdminOrCron(req);
  if (authError) return authError;

  return NextResponse.json(getThinkificExpansionFeasibilityReport());
}
