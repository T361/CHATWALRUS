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

  const allSurveys: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data: page, error } = await db
      .from('surveys')
      .select('id, rating, feedback_text, proficiency_level, submitted_at, company_id, learner_id, course_id')
      .eq('company_id', companyId)
      .order('submitted_at', { ascending: false })
      .range(offset, offset + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!page || page.length === 0) break;
    allSurveys.push(...page);
    if (page.length < 1000) break;
  }

  return csvResponse(toCSV(allSurveys), 'surveys-export.csv');
}
