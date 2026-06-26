import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyOrAdmin } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const authError = requireCompanyOrAdmin(req, slug);
  if (authError) return authError;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

  const { data: company } = await db
    .from('companies')
    .select('id')
    .eq('slug', slug)
    .single();

  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  const statusFilter = req.nextUrl.searchParams.get('status') || 'open';
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') || '50'), 200);

  let query = db
    .from('alerts')
    .select('*')
    .eq('company_id', company.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  const { data: alerts, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const openCount   = (alerts || []).filter(a => a.status === 'open').length;
  const reviewedCount = (alerts || []).filter(a => a.status === 'reviewed').length;

  return NextResponse.json({
    alerts: alerts || [],
    meta: { open: openCount, reviewed: reviewedCount, total: alerts?.length ?? 0 },
  });
}
