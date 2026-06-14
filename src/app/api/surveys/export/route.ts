import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { toCSV, csvResponse } from '@/lib/exports/csv';

export async function GET(
  req: NextRequest
) {
  const authError = requireAdminOrCron(req);
  if (authError) return authError;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

  const companyId = req.nextUrl.searchParams.get('company_id');
  if (!companyId) {
    return NextResponse.json({ error: 'company_id is required' }, { status: 400 });
  }

  const { data, error } = await db
    .from('surveys')
    .select('id, rating, feedback_text, proficiency_level, submitted_at, company_id, learner_id, course_id')
    .eq('company_id', companyId)
    .order('submitted_at', { ascending: false })
    .limit(10000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return csvResponse(toCSV(data || []), 'surveys-export.csv');
}
