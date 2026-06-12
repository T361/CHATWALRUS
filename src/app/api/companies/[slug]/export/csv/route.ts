import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron, unauthorizedJson } from '@/lib/auth/guards';
import { createServerClientSafe } from '@/lib/supabase/server';
import { toCSV, csvResponse } from '@/lib/exports/csv';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!requireAdminOrCron(req)) return unauthorizedJson();
  const { slug } = await params;
  const db = createServerClientSafe();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

  const { data: company } = await db.from('companies').select('id, name').eq('slug', slug).single();
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  const type = req.nextUrl.searchParams.get('type') || 'learners';

  if (type === 'assessments') {
    const { data } = await db.from('quizzes').select('*').eq('company_id', company.id);
    return csvResponse(toCSV(data || []), `${slug}-assessments.csv`);
  }

  if (type === 'surveys') {
    const { data } = await db.from('surveys').select('*').eq('company_id', company.id);
    return csvResponse(toCSV(data || []), `${slug}-surveys.csv`);
  }

  if (type === 'attendance') {
    const { data } = await db.from('zoom_attendance').select('*').eq('company_id', company.id);
    return csvResponse(toCSV(data || []), `${slug}-attendance.csv`);
  }

  // Default: learner progress
  const { data: learners } = await db
    .from('learners')
    .select('full_name, email, department, title, last_active_at')
    .eq('company_id', company.id)
    .eq('is_active', true);

  return csvResponse(toCSV(learners || []), `${slug}-learners.csv`);
}
