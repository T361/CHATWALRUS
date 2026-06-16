export const maxDuration = 300;
import { NextRequest, NextResponse } from 'next/server';
import { syncCourses } from '@/lib/thinkific/syncCourses';
import { syncUsers } from '@/lib/thinkific/syncUsers';
import { syncGroups } from '@/lib/thinkific/syncGroups';
import { syncOrders } from '@/lib/thinkific/syncOrders';
import { syncEnrollmentData } from '@/lib/thinkific/syncEnrollmentData';
import { createDailySnapshots } from '@/lib/snapshots/createDailySnapshots';
import { createSyncLog, summarizeSyncResults, updateSyncLog, type SyncResult } from '@/lib/thinkific/syncCore';
import { requireCronSecret } from '@/lib/auth/guards';
import { isAdminConfigured, createAdminClient } from '@/lib/supabase/admin';
import { runAllMilestoneChecks } from '@/lib/milestones/runMilestoneCheck';
import { syncSurveys } from '@/lib/thinkific/syncSurveys';
import { syncStartDates } from '@/lib/thinkific/syncStartDates';
import { createAlert } from '@/lib/alerts/createAlert';
import { seedPointsFromActivity, recalculateAllPoints } from '@/lib/gamification/calculatePoints';
import { awardAchievements } from '@/lib/gamification/awardAchievements';
import { snapshotLeaderboard } from '@/lib/gamification/snapshotLeaderboard';

export async function POST(req: NextRequest) {
  const authError = requireCronSecret(req);
  if (authError) return authError;

  const logId = await createSyncLog('daily-thinkific-sync', 'running');

  try {
    const courses = await syncCourses();
    const users = await syncUsers();
    const groups = await syncGroups();
    const orders = await syncOrders();
    const { enrollments, assignments } = await syncEnrollmentData();
    const results: Record<string, SyncResult> = { courses, users, groups, orders, enrollments, assignments };

    const surveys = await syncSurveys();
    results.surveys = surveys;

    // Auto-detect start dates for companies that don't have one yet
    const startDates = await syncStartDates();
    results.start_dates = startDates;

    // Daily snapshots — runs after enrollment sync so progress_percent is current
    const snapshotCount = await createDailySnapshots();
    results.snapshots = {
      syncType: 'snapshots',
      status: isAdminConfigured() ? 'success' : 'skipped',
      recordsProcessed: snapshotCount,
      errorMessage: isAdminConfigured() ? undefined : 'Supabase admin not configured',
    };

    // ── Never-started alert: flag learners enrolled 7+ days with no activity ──
    const neverStartedCount = await checkNeverStartedLearners();
    results.never_started_check = {
      syncType: 'never_started_check',
      status: 'success',
      recordsProcessed: neverStartedCount,
    };

    // Milestone checks — runs after snapshots so status is fresh
    const milestoneResults = await runAllMilestoneChecks();
    results.milestones = {
      syncType: 'milestones',
      status: 'success',
      recordsProcessed: milestoneResults.length,
    };

    // Gamification — seed events from activity, recalculate totals, award badges, snapshot ranks
    await seedPointsFromActivity();
    const gamificationLearners = await recalculateAllPoints();
    const achievementsAwarded = await awardAchievements();
    const leaderboardRows = await snapshotLeaderboard();
    results.gamification = {
      syncType: 'gamification',
      status: 'success',
      recordsProcessed: gamificationLearners + achievementsAwarded + leaderboardRows,
    };

    const summary = summarizeSyncResults(results);

    if (logId) {
      await updateSyncLog(logId, {
        status: summary.status,
        records_processed: summary.recordsProcessed,
        error_message: summary.status === 'success' ? undefined : summary.message,
      });
    }

    return NextResponse.json({
      status: summary.status,
      message: summary.message,
      results,
      records_processed: summary.recordsProcessed,
      snapshots_created: snapshotCount,
      milestones_run: milestoneResults.length,
      sync_log_id: logId,
    }, { status: summary.status === 'failed' ? 500 : 200 });
  } catch (error) {
    if (logId) {
      await updateSyncLog(logId, {
        status: 'failed',
        error_message: error instanceof Error ? error.message : String(error),
      });
    }
    return NextResponse.json({
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      sync_log_id: logId,
    }, { status: 500 });
  }
}

/**
 * Check for learners who were enrolled 7+ days ago but have never logged in
 * or shown any activity. Creates a 'never_started' alert per company (deduped).
 * Brief requirement: "Not Started fires immediately — does not wait for the 30-day check."
 */
async function checkNeverStartedLearners(): Promise<number> {
  if (!isAdminConfigured()) return 0;
  const db = createAdminClient();

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Find active learners enrolled for 7+ days with no login and no activity
  // Proxy: check enrollments older than 7 days for learners with no last_active_at
  const neverStartedByCompany = new Map<string, number>();

  for (let offset = 0; ; offset += 1000) {
    const { data } = await db
      .from('learners')
      .select('id, company_id, last_active_at, last_login_at, created_at')
      .eq('is_active', true)
      .is('last_active_at', null)
      .is('last_login_at', null)
      .lt('created_at', sevenDaysAgo.toISOString())
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;

    for (const learner of data) {
      if (!learner.company_id) continue;
      neverStartedByCompany.set(
        learner.company_id,
        (neverStartedByCompany.get(learner.company_id) ?? 0) + 1
      );
    }
    if (data.length < 1000) break;
  }

  let totalAlerted = 0;
  for (const [companyId, count] of neverStartedByCompany.entries()) {
    await createAlert({
      companyId,
      alertType: 'never_started',
      severity: 'warning',
      title: `${count} learner${count !== 1 ? 's' : ''} enrolled but never started`,
      message: `${count} learner${count !== 1 ? 's have' : ' has'} been enrolled for 7+ days with no activity or login recorded.`,
    });
    totalAlerted += count;
  }

  if (totalAlerted > 0) {
    console.log(`[DailySync] Never-started alert: ${totalAlerted} learners across ${neverStartedByCompany.size} companies`);
  }

  return totalAlerted;
}
