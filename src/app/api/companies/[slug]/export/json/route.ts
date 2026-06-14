import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { jsonResponse } from '@/lib/exports/json';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const authError = requireAdminOrCron(req);
  if (authError) return authError;
  const { slug } = await params;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

  const { data: company } = await db.from('companies').select('*').eq('slug', slug).single();
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  const { data: learners } = await db.from('learners').select('*').eq('company_id', company.id);
  const { data: enrollments } = await db.from('enrollments').select('*').eq('company_id', company.id);
  const { data: alerts } = await db.from('alerts').select('*').eq('company_id', company.id);
  const { data: milestones } = await db.from('milestone_checks').select('*').eq('company_id', company.id);

  return jsonResponse(
    {
      company,
      learners: learners || [],
      enrollments: enrollments || [],
      alerts: alerts || [],
      milestones: milestones || [],
      exported_at: new Date().toISOString(),
    },
    `${slug}-full-export.json`
  );
}
