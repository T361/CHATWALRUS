import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyOrAdmin } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { jsonResponse } from '@/lib/exports/json';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const authError = requireCompanyOrAdmin(req, slug);
  if (authError) return authError;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

  const { data: company } = await db.from('companies').select('*').eq('slug', slug).single();
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  const learners: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data } = await db.from('learners').select('*').eq('company_id', company.id).range(offset, offset + 999);
    if (!data || data.length === 0) break;
    learners.push(...data);
    if (data.length < 1000) break;
  }

  const enrollments: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data } = await db.from('enrollments').select('*').eq('company_id', company.id).range(offset, offset + 999);
    if (!data || data.length === 0) break;
    enrollments.push(...data);
    if (data.length < 1000) break;
  }

  const alerts: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data } = await db.from('alerts').select('*').eq('company_id', company.id).range(offset, offset + 999);
    if (!data || data.length === 0) break;
    alerts.push(...data);
    if (data.length < 1000) break;
  }

  const { data: milestones } = await db.from('milestone_checks').select('*').eq('company_id', company.id);

  return jsonResponse(
    {
      company,
      learners,
      enrollments,
      alerts,
      milestones: milestones || [],
      exported_at: new Date().toISOString(),
    },
    `${slug}-full-export.json`
  );
}
