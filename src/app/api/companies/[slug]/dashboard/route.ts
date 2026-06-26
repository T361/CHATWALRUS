import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyOrAdmin } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { safeNumber } from '@/lib/utils/normalize';

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
    .select('*')
    .eq('slug', slug)
    .single();

  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  // Total enrolled learners
  const { count: totalEnrolled } = await db
    .from('learners')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', company.id)
    .eq('is_active', true);

  // Enrollment stats — paginate to avoid 1k row cap
  const enrollments: Array<{ progress_percent: number | null; completed_at: string | null }> = [];
  for (let offset = 0; ; offset += 1000) {
    const { data: page } = await db
      .from('enrollments')
      .select('progress_percent, completed_at')
      .eq('company_id', company.id)
      .eq('is_active', true)
      .range(offset, offset + 999);
    if (!page || page.length === 0) break;
    enrollments.push(...page);
    if (page.length < 1000) break;
  }

  const avgProgress = enrollments.length > 0
    ? enrollments.reduce((s, e) => s + safeNumber(e.progress_percent), 0) / enrollments.length
    : 0;
  const courseCompletions = enrollments.filter((e) => e.completed_at).length;

  // Latest milestone check
  const { data: latestMilestone } = await db
    .from('milestone_checks')
    .select('*')
    .eq('company_id', company.id)
    .order('checked_at', { ascending: false })
    .limit(1)
    .single();

  const onTrack = latestMilestone?.on_track_count ?? 0;
  const slightlyBehind = latestMilestone?.slightly_behind_count ?? 0;
  const atRisk = latestMilestone?.at_risk_count ?? 0;
  const notStarted = latestMilestone?.not_started_count ?? 0;
  const highEngagement = latestMilestone?.high_engagement_count ?? 0;
  const total = Math.max(safeNumber(totalEnrolled), 1);
  const onPace = Math.round(((onTrack + highEngagement) / total) * 100);

  // Quiz median — paginate to avoid 1k row cap
  const quizScoreRows: Array<{ score: number | null }> = [];
  for (let offset = 0; ; offset += 1000) {
    const { data: page } = await db
      .from('quizzes')
      .select('score')
      .eq('company_id', company.id)
      .not('score', 'is', null)
      .range(offset, offset + 999);
    if (!page || page.length === 0) break;
    quizScoreRows.push(...page);
    if (page.length < 1000) break;
  }

  const quizScores = quizScoreRows.map((q) => safeNumber(q.score)).sort((a, b) => a - b);
  const medianQuiz = quizScores.length > 0
    ? quizScores.length % 2 === 0
      ? (quizScores[quizScores.length / 2 - 1] + quizScores[quizScores.length / 2]) / 2
      : quizScores[Math.floor(quizScores.length / 2)]
    : null;

  // Assignment submission rate — paginate to avoid 1k row cap
  const assignments: Array<{ submitted: boolean }> = [];
  for (let offset = 0; ; offset += 1000) {
    const { data: page } = await db
      .from('assignments')
      .select('submitted')
      .eq('company_id', company.id)
      .range(offset, offset + 999);
    if (!page || page.length === 0) break;
    assignments.push(...page);
    if (page.length < 1000) break;
  }

  const submissionRate = assignments.length > 0
    ? Math.round((assignments.filter((a) => a.submitted).length / assignments.length) * 100)
    : null;

  // Open alerts
  const { data: alerts } = await db
    .from('alerts')
    .select('*')
    .eq('company_id', company.id)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(10);

  return NextResponse.json({
    company,
    total_enrolled: totalEnrolled ?? 0,
    course_completions: courseCompletions,
    average_progress: Math.round(avgProgress * 10) / 10,
    median_quiz_score: medianQuiz,
    assignment_submission_rate: submissionRate,
    on_pace_percent: onPace,
    slightly_behind_count: slightlyBehind,
    at_risk_count: atRisk,
    not_started_count: notStarted,
    on_track_count: onTrack,
    high_engagement_count: highEngagement,
    status_distribution: {
      not_started: notStarted,
      at_risk: atRisk,
      slightly_behind: slightlyBehind,
      on_track: onTrack,
      high_engagement: highEngagement,
    },
    alerts: alerts || [],
  });
}
