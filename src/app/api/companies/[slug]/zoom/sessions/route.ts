import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyOrAdmin } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCompanySessionLists } from '@/lib/zoom/analytics';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const authError = requireCompanyOrAdmin(req, slug);
  if (authError) return authError;
  const db = createAdminClient();
  const { data: company } = await db.from('companies').select('id, name').eq('slug', slug).single();
  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit') || '20'), 1), 100);
  const sessions = await getCompanySessionLists(company.id, limit);

  return NextResponse.json({
    company_name: company.name,
    sessions,
    total: sessions.length,
    has_more: false,
  });
}
