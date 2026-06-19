import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';

type SurveySyncMetadata = {
  courses_checked?: number;
  upstream_reviews_found?: number;
  records_upserted?: number;
  endpoint_errors?: Array<{ course_id: string; message: string }>;
};

type SurveySyncLogRow = {
  status: string | null;
  records_processed: number | null;
  error_message: string | null;
  completed_at: string | null;
  metadata: SurveySyncMetadata | null;
};

export async function GET(req: NextRequest) {
  const authError = requireAdminOrCron(req);
  if (authError) return authError;
  const db = createAdminClient();
  const { searchParams } = new URL(req.url);

  const companyId      = searchParams.get('company_id')       || null;
  const proficiency    = searchParams.get('proficiency_level') || null;
  const fromDate       = searchParams.get('from_date')         || null;
  const toDate         = searchParams.get('to_date')           || null;

  // Paginate to get all matching rows past Supabase's default 1000-row cap
  const rows: Array<Record<string, unknown>> = [];
  for (let offset = 0; ; offset += 1000) {
    let query = db
      .from('surveys')
      .select('id, rating, feedback_text, proficiency_level, submitted_at, company_id, course_id, companies(id, name), learners(full_name), courses(name)')
      .order('submitted_at', { ascending: false })
      .range(offset, offset + 999);

    if (companyId && companyId !== 'all')      query = query.eq('company_id', companyId);
    if (proficiency && proficiency !== 'all')  query = query.eq('proficiency_level', proficiency);
    if (fromDate)                              query = query.gte('submitted_at', fromDate);
    if (toDate)                                query = query.lte('submitted_at', toDate + 'T23:59:59Z');

    const { data: page, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!page || page.length === 0) break;
    rows.push(...(page as Array<Record<string, unknown>>));
    if (page.length < 1000) break;
  }

  const surveys = rows.map((s) => {
    const co = s.companies as Record<string, string> | null;
    const le = s.learners  as Record<string, string> | null;
    const cr = s.courses   as Record<string, string> | null;
    return {
      id:               s.id as string,
      rating:           s.rating as number | null,
      feedback_text:    s.feedback_text as string | null,
      proficiency_level:s.proficiency_level as string | null,
      submitted_at:     s.submitted_at as string | null,
      company_id:       s.company_id as string | null,
      company_name:     co?.name ?? null,
      learner_name:     le?.full_name ?? null,
      course_id:        s.course_id as string | null,
      course_name:      cr?.name ?? null,
    };
  });

  const withRating = surveys.filter((s) => s.rating !== null);
  const ratings    = withRating.map((s) => s.rating as number);
  const maxRating  = ratings.length > 0 ? Math.max(...ratings) : 5;
  const scale      = maxRating > 5 ? 10 : 5;
  const satThresh  = scale === 10 ? 8 : 4;

  const avgRating      = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
  const satisfiedCount = ratings.filter((r) => r >= satThresh).length;
  const satisfactionRate = ratings.length > 0 ? Math.round((satisfiedCount / ratings.length) * 100) : 0;

  // Rating distribution — buckets 1..scale
  const distMap = new Map<number, number>();
  for (let i = 1; i <= scale; i++) distMap.set(i, 0);
  for (const r of ratings) {
    const bucket = Math.min(scale, Math.max(1, Math.round(r)));
    distMap.set(bucket, (distMap.get(bucket) ?? 0) + 1);
  }
  const rating_distribution = Array.from(distMap.entries())
    .map(([rating, count]) => ({ rating, count }))
    .sort((a, b) => a.rating - b.rating);

  // Rating trend — group by YYYY-MM
  const trendMap = new Map<string, { sum: number; count: number }>();
  for (const s of withRating) {
    if (!s.submitted_at) continue;
    const month = s.submitted_at.slice(0, 7); // YYYY-MM
    const existing = trendMap.get(month) ?? { sum: 0, count: 0 };
    existing.sum   += s.rating as number;
    existing.count += 1;
    trendMap.set(month, existing);
  }
  const rating_trend = Array.from(trendMap.entries())
    .map(([date, { sum, count }]) => ({ date, average_rating: sum / count, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Course performance
  const courseMap = new Map<string, { name: string; sum: number; count: number }>();
  for (const s of withRating) {
    if (!s.course_id) continue;
    const existing = courseMap.get(s.course_id) ?? { name: s.course_name ?? s.course_id, sum: 0, count: 0 };
    existing.sum   += s.rating as number;
    existing.count += 1;
    courseMap.set(s.course_id, existing);
  }
  const course_performance = Array.from(courseMap.entries())
    .map(([course_id, { name, sum, count }]) => ({
      course_id,
      course_name:    name,
      average_rating: sum / count,
      response_count: count,
    }))
    .sort((a, b) => b.average_rating - a.average_rating);

  // Companies list for filter dropdown (deduplicate from survey rows)
  const companyMap = new Map<string, string>();
  for (const s of surveys) {
    if (s.company_id && s.company_name) companyMap.set(s.company_id, s.company_name);
  }
  // Also fetch all active companies so filter is complete even with active company filter
  const { data: allCompanies } = await db.from('companies').select('id, name').eq('is_active', true).order('name');
  const companies = (allCompanies || []).map((c) => ({ id: c.id, name: c.name }));
  const { data: latestSync } = await db
    .from('sync_logs')
    .select('status, records_processed, error_message, completed_at, metadata')
    .eq('sync_type', 'surveys')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastSync = (latestSync ?? null) as SurveySyncLogRow | null;
  const emptyReason = surveys.length === 0
    ? lastSync?.status === 'success'
      ? 'No course reviews returned by Thinkific for current courses.'
      : 'No stored survey reviews yet. Run Import Survey Reviews from Settings.'
    : null;

  return NextResponse.json({
    surveys,
    average_rating:    avgRating,
    total_responses:   surveys.length,
    satisfaction_rate: satisfactionRate,
    scale,
    rating_distribution,
    rating_trend,
    course_performance,
    companies,
    empty_reason: emptyReason,
    last_sync: lastSync ? {
      status: lastSync.status,
      records_processed: Number(lastSync.records_processed ?? 0),
      error_message: lastSync.error_message,
      completed_at: lastSync.completed_at,
      metadata: lastSync.metadata,
    } : null,
  });
}
