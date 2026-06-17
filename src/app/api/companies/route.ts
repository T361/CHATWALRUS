import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth/guards';
import { getCompanyCardRows } from '@/lib/companies/query';
import { withServerTiming } from '@/lib/perf';

export async function GET(req: NextRequest) {
  return withServerTiming('companies.route.get', async () => {
    const authError = requireAdminOrCron(req);
    if (authError) return authError;
    const companies = await getCompanyCardRows();
    return NextResponse.json({ companies });
  });
}
