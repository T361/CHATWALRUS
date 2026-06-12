// =============================================================================
// Milestone Check Runner
// =============================================================================
// Runs company-level milestone checks, calculates aggregate stats,
// stores milestone_checks and learner_status_snapshots, triggers alerts.

import { createAdminClient, isAdminConfigured } from '@/lib/supabase/admin';
import { calculateBenchmark, getMilestoneDay } from './benchmark';
import { calculateLearnerStatus } from './status';
import { todayISO } from '@/lib/utils/dates';
import { safeNumber } from '@/lib/utils/normalize';
import { createAlert } from '@/lib/alerts/createAlert';
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
  const benchmarkPercent = calculateBenchmark(
    milestoneDay,
    company.learning_timeline_days
  );

  // Fetch active learners for this company
  const { data: learners, error: learnersError } = await db
    .from('learners')
    .select('id, last_login_at, last_active_at')
    .eq('company_id', company.id)
    .eq('is_active', true);

  if (learnersError || !learners || learners.length === 0) {
    console.warn(`[MilestoneCheck] No learners found for ${company.name}.`);
    return null;
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

  for (const learner of learners) {
    // Get learner's enrollment progress
    const { data: enrollments } = await db
      .from('enrollments')
      .select('progress_percent')
      .eq('learner_id', learner.id)
      .eq('company_id', company.id)
      .eq('is_active', true);

    const avgProgress = enrollments && enrollments.length > 0
      ? enrollments.reduce((sum, e) => sum + safeNumber(e.progress_percent), 0) / enrollments.length
      : 0;

    // Get Zoom attendance count for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { count: liveSessionCount } = await db
      .from('zoom_attendance')
      .select('*', { count: 'exact', head: true })
      .eq('learner_id', learner.id)
      .eq('attended', true)
      .gte('join_time', thirtyDaysAgo.toISOString());

    const { status, reason } = calculateLearnerStatus({
      completionPercent: avgProgress,
      milestoneDay,
      learningTimelineDays: company.learning_timeline_days,
      hasActivity: !!learner.last_active_at,
      hasLoggedIn: !!learner.last_login_at,
      liveSessionsLast30Days: liveSessionCount ?? 0,
    });

    statusCounts[status]++;
    totalCompletion += avgProgress;

    // Store learner status snapshot
    await db.from('learner_status_snapshots').upsert(
      {
        company_id: company.id,
        learner_id: learner.id,
        snapshot_date: snapshotDate,
        milestone_day: milestoneDay,
        status,
        completion_percent: avgProgress,
        benchmark_percent: benchmarkPercent,
        live_sessions_last_30_days: liveSessionCount ?? 0,
        reason,
      },
      { onConflict: 'learner_id,snapshot_date', ignoreDuplicates: false }
    );
  }

  const totalLearners = learners.length;
  const averageCompletion = totalLearners > 0 ? totalCompletion / totalLearners : 0;
  const atRiskPercent = totalLearners > 0
    ? ((statusCounts.at_risk + statusCounts.not_started) / totalLearners) * 100
    : 0;

  // Determine if alert should be triggered
  let alertTriggered = false;

  if (averageCompletion < benchmarkPercent) {
    alertTriggered = true;
    await createAlert({
      companyId: company.id,
      alertType: 'average_below_benchmark',
      severity: 'warning',
      title: `Average completion below benchmark at Day ${milestoneDay}`,
      message: `Company ${company.name} average completion is ${averageCompletion.toFixed(1)}% vs benchmark ${benchmarkPercent.toFixed(1)}% at Day ${milestoneDay}.`,
      milestoneDay,
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

  const results: MilestoneCheckResult[] = [];
  for (const company of companies) {
    const result = await runMilestoneCheck(company as Company);
    if (result) results.push(result);
  }

  return results;
}
