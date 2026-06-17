import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCompanyZoomAnalytics } from '@/lib/zoom/analytics';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const authError = requireAdminOrCron(req);
  if (authError) return authError;

  const { slug } = await params;
  const db = createAdminClient();
  const { data: company } = await db.from('companies').select('id, name').eq('slug', slug).single();
  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get('days') || '84'), 7), 365);
  const analytics = await getCompanyZoomAnalytics(company.id, days);
  return NextResponse.json({
    company_name: company.name,
    ...analytics,
  });
}
