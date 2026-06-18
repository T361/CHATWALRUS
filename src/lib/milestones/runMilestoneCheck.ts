// =============================================================================
// Milestone Check Runner
// =============================================================================

import { createAdminClient, isAdminConfigured } from '@/lib/supabase/admin';
import { calculateBenchmark, getMilestoneDay } from './benchmark';
import { calculateLearnerStatus } from './status';
import { todayISO } from '@/lib/utils/dates';
import { safeNumber } from '@/lib/utils/normalize';
import { createAlert } from '@/lib/alerts/createAlert';
import { sendSlackAlert } from '@/lib/alerts/sendSlackAlert';
import { refreshCompanySummaryRollups } from '@/lib/companies/rollups';
import { invalidateDashboardCaches } from '@/lib/cache/invalidation';
import { refreshLearnerDirectoryRollups } from '@/lib/learners/rollups';
import { refreshCompanyWeeklyRollups } from '@/lib/weekly/rollups';
import type { Company } from '@/types/company';
import type { LearnerStatus } from '@/types/learner';

export interface MilestoneCheckResult {
  companyId: string;
  milestoneDay: number;
  benchmarkPercent: number;
  averageCompletion: number;
  atRiskPercent: number;
  statusCounts: Record<LearnerStatus, number>;
  alertTriggered: boolean;
}

/**
 * Run milestone check for a single company.
 * Optimized: bulk-fetches enrollments and zoom counts instead of per-learner queries.
 */
export async function runMilestoneCheck(
  company: Company
): Promise<MilestoneCheckResult | null> {
  if (!isAdminConfigured()) {
    console.warn('[MilestoneCheck] Admin client not configured. Skipping.');
    return null;
  }

  const db = createAdminClient();
  const milestoneDay = getMilestoneDay(company.start_date);
  if (milestoneDay === null) {
    console.log(`[MilestoneCheck] ${company.name} program has not started yet — skipping.`);
    return null;
  }
  const benchmarkPercent = calculateBenchmark(milestoneDay, company.learning_timeline_days);

  // Fetch active learners — paginate in 1k chunks due to Supabase server max-rows cap
  const allLearnerRows: Array<{ id: string; last_login_at: string | null; last_active_at: string | null }> = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error: pageError } = await db
      .from('learners')
      .select('id, last_login_at, last_active_at')
      .eq('company_id', company.id)
      .eq('is_active', true)
      .range(offset, offset + 999);
    if (pageError) { console.warn(`[MilestoneCheck] Learner fetch error: ${pageError.message}`); break; }
    if (!data || data.length === 0) break;
    allLearnerRows.push(...data);
    if (data.length < 1000) break;
  }
  const learners = allLearnerRows;
  const learnersError = learners.length === 0 ? new Error('no learners') : null;

  if (learnersError || !learners || learners.length === 0) {
    console.warn(`[MilestoneCheck] No learners found for ${company.name}.`);
    return null;
  }

  const learnerIds = learners.map((l) => l.id);

  // Bulk-fetch all enrollments for this company — paginated to avoid 1k cap
  type EnrollRow = { learner_id: string; course_id: string; progress_percent: number | null; courses: { total_lessons: number } | null };
  const allEnrollments: EnrollRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data } = await db
      .from('enrollments')
      .select('learner_id, course_id, progress_percent, courses(total_lessons)')
      .eq('company_id', company.id)
      .eq('is_active', true)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    allEnrollments.push(...(data as unknown as EnrollRow[]));
    if (data.length < 1000) break;
  }

  // Build enrollment-level progress map (fallback)
  const enrollmentsByLearner = new Map<string, number[]>();
  const courseTotalLessons = new Map<string, number>();
  for (const e of allEnrollments) {
    if (!enrollmentsByLearner.has(e.learner_id)) enrollmentsByLearner.set(e.learner_id, []);
    enrollmentsByLearner.get(e.learner_id)!.push(safeNumber(e.progress_percent));
    if (e.courses?.total_lessons && !courseTotalLessons.has(e.course_id)) {
      courseTotalLessons.set(e.course_id, e.courses.total_lessons);
    }
  }

  // Check for lesson_progress data (source of truth when available)
  // Batch by learner IDs in chunks of 100 to stay within URL length limits
  const completedLessonsByLearner = new Map<string, number>();
  for (let i = 0; i < learnerIds.length; i += 100) {
    const chunk = learnerIds.slice(i, i + 100);
    const { data } = await db
      .from('lesson_progress')
      .select('learner_id')
      .in('learner_id', chunk)
      .eq('completed', true);
    if (data) {
      for (const row of data) {
        completedLessonsByLearner.set(
          row.learner_id,
          (completedLessonsByLearner.get(row.learner_id) ?? 0) + 1
        );
      }
    }
  }
  const hasLessonData = completedLessonsByLearner.size > 0;

  // Bulk-fetch Zoom attendance counts for last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const zoomAttendanceRows: Array<{ learner_id: string }> = [];
  for (let offset = 0; ; offset += 1000) {
    const { data: page } = await db
      .from('zoom_attendance')
      .select('learner_id')
      .eq('company_id', company.id)
      .eq('attended', true)
      .gte('join_time', thirtyDaysAgo.toISOString())
      .range(offset, offset + 999);
    if (!page || page.length === 0) break;
    zoomAttendanceRows.push(...page);
    if (page.length < 1000) break;
  }

  const zoomCountByLearner = new Map<string, number>();
  for (const row of zoomAttendanceRows) {
    zoomCountByLearner.set(row.learner_id, (zoomCountByLearner.get(row.learner_id) ?? 0) + 1);
  }

  const statusCounts: Record<LearnerStatus, number> = {
    not_started: 0,
    at_risk: 0,
    slightly_behind: 0,
    on_track: 0,
    high_engagement: 0,
  };

  let totalCompletion = 0;
  const snapshotDate = todayISO();
  const snapshotBatch: Array<Record<string, unknown>> = [];

  for (const learner of learners) {
    // Source priority: lesson_progress counts > enrollment percentage
    let avgProgress: number;
    if (hasLessonData && completedLessonsByLearner.has(learner.id)) {
      const completedLessons = completedLessonsByLearner.get(learner.id) ?? 0;
      const learnerEnrollments = allEnrollments.filter(e => e.learner_id === learner.id);
      const totalLessons = learnerEnrollments.reduce(
        (sum, e) => sum + (courseTotalLessons.get(e.course_id) ?? 0), 0
      );
      avgProgress = totalLessons > 0 ? (completedLessons / totalLessons) * 100 : 0;
    } else {
      const progressValues = enrollmentsByLearner.get(learner.id) || [];
      avgProgress = progressValues.length > 0
        ? progressValues.reduce((sum, v) => sum + v, 0) / progressValues.length
        : 0;
    }

    const liveSessionCount = zoomCountByLearner.get(learner.id) ?? 0;

    const { status, reason } = calculateLearnerStatus({
      completionPercent: avgProgress,
      milestoneDay,
      learningTimelineDays: company.learning_timeline_days,
      hasActivity: !!learner.last_active_at,
      hasLoggedIn: !!learner.last_login_at,
      liveSessionsLast30Days: liveSessionCount,
    });

    statusCounts[status]++;
    totalCompletion += avgProgress;

    snapshotBatch.push({
      company_id: company.id,
      learner_id: learner.id,
      snapshot_date: snapshotDate,
      milestone_day: milestoneDay,
      status,
      completion_percent: avgProgress,
      benchmark_percent: benchmarkPercent,
      live_sessions_last_30_days: liveSessionCount,
      reason,
    });
  }

  // Batch upsert all snapshots at once
  if (snapshotBatch.length > 0) {
    const { error } = await db.from('learner_status_snapshots').upsert(snapshotBatch, {
      onConflict: 'learner_id,snapshot_date',
      ignoreDuplicates: false,
    });
    if (error) console.warn('[MilestoneCheck] Snapshot batch upsert error:', error.message);
  }

  const totalLearners = learners.length;
  const averageCompletion = totalLearners > 0 ? totalCompletion / totalLearners : 0;
  const atRiskPercent = totalLearners > 0
    ? ((statusCounts.at_risk + statusCounts.not_started) / totalLearners) * 100
    : 0;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
  const dashboardUrl = `${appUrl}/company/${(company as Company & { slug?: string }).slug || company.id}`;

  let alertTriggered = false;

  if (averageCompletion < benchmarkPercent) {
    alertTriggered = true;
    await createAlert({
      companyId: company.id,
      alertType: 'average_below_benchmark',
      severity: 'warning',
      title: `Average completion below benchmark at Day ${milestoneDay}`,
      message: `${company.name} average completion is ${averageCompletion.toFixed(1)}% vs benchmark ${benchmarkPercent.toFixed(1)}% at Day ${milestoneDay}.`,
      milestoneDay,
    });
    // Wire Slack notification
    const co = company as Company & { slack_channel_id?: string; csm_owner_email?: string; slack_routing?: string };
    await sendSlackAlert({
      companyName: company.name,
      milestoneDay,
      benchmarkPercent,
      averageCompletion,
      atRiskCount: statusCounts.at_risk,
      notStartedCount: statusCounts.not_started,
      dashboardUrl,
      slackChannelId: co.slack_channel_id ?? null,
      csmOwnerEmail: co.csm_owner_email ?? null,
      slackRouting: (co.slack_routing as 'channel_only' | 'dm_only' | 'both') ?? 'channel_only',
    });
  }

  if (atRiskPercent > safeNumber(company.risk_threshold_percent, 30)) {
    alertTriggered = true;
    await createAlert({
      companyId: company.id,
      alertType: 'risk_concentration',
      severity: 'critical',
      title: `High risk concentration at Day ${milestoneDay}`,
      message: `${atRiskPercent.toFixed(1)}% of learners are at risk or not started (threshold: ${company.risk_threshold_percent}%).`,
      milestoneDay,
    });
    // Send Slack only if not already sent for avg_below_benchmark
    if (averageCompletion >= benchmarkPercent) {
      const co = company as Company & { slack_channel_id?: string; csm_owner_email?: string; slack_routing?: string };
      await sendSlackAlert({
        companyName: company.name,
        milestoneDay,
        benchmarkPercent,
        averageCompletion,
        atRiskCount: statusCounts.at_risk,
        notStartedCount: statusCounts.not_started,
        dashboardUrl,
        slackChannelId: co.slack_channel_id ?? null,
        csmOwnerEmail: co.csm_owner_email ?? null,
        slackRouting: (co.slack_routing as 'channel_only' | 'dm_only' | 'both') ?? 'channel_only',
      });
    }
  }

  // Store milestone check
  const { data: milestoneCheck } = await db
    .from('milestone_checks')
    .upsert(
      {
        company_id: company.id,
        milestone_day: milestoneDay,
        benchmark_percent: benchmarkPercent,
        average_completion_percent: averageCompletion,
        at_risk_percent: atRiskPercent,
        not_started_count: statusCounts.not_started,
        slightly_behind_count: statusCounts.slightly_behind,
        at_risk_count: statusCounts.at_risk,
        on_track_count: statusCounts.on_track,
        high_engagement_count: statusCounts.high_engagement,
        alert_triggered: alertTriggered,
        checked_at: new Date().toISOString(),
      },
      { onConflict: 'company_id,milestone_day' }
    )
    .select('id')
    .single();

  if (milestoneCheck) {
    console.log(`[MilestoneCheck] Completed for ${company.name} at Day ${milestoneDay}`);
  }

  return {
    companyId: company.id,
    milestoneDay,
    benchmarkPercent,
    averageCompletion,
    atRiskPercent,
    statusCounts,
    alertTriggered,
  };
}

/**
 * Run milestone checks for all active companies.
 */
export async function runAllMilestoneChecks(): Promise<MilestoneCheckResult[]> {
  if (!isAdminConfigured()) {
    console.warn('[MilestoneCheck] Admin client not configured.');
    return [];
  }

  const db = createAdminClient();
  const { data: companies, error } = await db
    .from('companies')
    .select('*')
    .eq('is_active', true);

  if (error || !companies) {
    console.error('[MilestoneCheck] Failed to fetch companies:', error);
    return [];
  }

  const settled = await Promise.all(
    companies.map((company) => runMilestoneCheck(company as Company))
  );
  const results = settled.filter((r): r is MilestoneCheckResult => r !== null);
  if (results.length > 0) {
    const companyIds = results.map((result) => result.companyId);
    await refreshCompanySummaryRollups(companyIds);
    await refreshLearnerDirectoryRollups(companyIds);
    await refreshCompanyWeeklyRollups(companyIds);
    invalidateDashboardCaches();
  }
  return results;
}
