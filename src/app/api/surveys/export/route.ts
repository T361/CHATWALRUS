import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron, unauthorizedJson } from '@/lib/auth/guards';
import { createServerClientSafe } from '@/lib/supabase/server';
import { toCSV, csvResponse } from '@/lib/exports/csv';

export async function GET(
  req: NextRequest
) {
  if (!requireAdminOrCron(req)) return unauthorizedJson();
  const db = createServerClientSafe();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

  const companyId = req.nextUrl.searchParams.get('company_id');

  let query = db
    .from('surveys')
    .select('id, rating, feedback_text, proficiency_level, submitted_at, company_id, learner_id, course_id')
    .order('submitted_at', { ascending: false });

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return csvResponse(toCSV(data || []), 'surveys-export.csv');
}
