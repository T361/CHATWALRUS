import 'server-only';

import { createAdminClient, isAdminConfigured } from '@/lib/supabase/admin';
import { withServerTiming } from '@/lib/perf';
import { isMissingRelationError } from '@/lib/utils/db';

export interface WeeklyReportData {
  company: {
    name: string;
    start_date: string | null;
    learning_timeline_days: number | null;
  };
  week_start: string;
  week_end: string;
  totals: {
    learners: number;
    active_this_week: number;
    course_completions: number;
    zoom_attendances: number;
    assignments_submitted: number;
    surveys_submitted: number;
  };
  status_distribution: {
    high_engagement: number;
    on_track: number;
    slightly_behind: number;
    at_risk: number;
    not_started: number;
  };
  avg_completion: number;
  top_learners: Array<{ full_name: string; total_points: number; sessions_attended: number }>;
  open_alerts: Array<{ alert_type: string; severity: string; title: string; created_at: string }>;
}

type CompanyRow = {
  id: string;
  name: string;
  start_date: string | null;
  learning_timeline_days: number | null;
};

function getWeekWindow(now = new Date()) {
  const weekEnd = new Date(now);
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);
  return {
    weekStartDate: weekStart.toISOString().slice(0, 10),
    weekEndDate: now.toISOString().slice(0, 10),
    weekStartIso: weekStart.toISOString(),
    weekEndIso: weekEnd.toISOString(),
  };
}

async function getCompaniesForWeeklyRefresh(companyIds?: string[]): Promise<CompanyRow[]> {
  const db = createAdminClient();
  const rows: CompanyRow[] = [];

  if (companyIds && companyIds.length > 0) {
    const { data, error } = await db
      .from('companies')
      .select('id, name, start_date, learning_timeline_days')
      .in('id', companyIds);
    if (error) throw error;
    return (data ?? []) as CompanyRow[];
  }

  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db
      .from('companies')
      .select('id, name, start_date, learning_timeline_days')
      .eq('is_active', true)
      .order('name')
      .range(offset, offset + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...(data as CompanyRow[]));
    if (data.length < 1000) break;
  }

  return rows;
}

async function buildWeeklySnapshot(company: CompanyRow): Promise<Omit<WeeklyReportData, 'company' | 'week_start' | 'week_end'>> {
  const db = createAdminClient();
  const { weekStartIso } = getWeekWindow();
  let latestStatusesResult:
    | { data: Array<{ status: string; completion_percent: number | null }> | null; error: unknown }
    | null = null;

  try {
    const { data, error } = await db
      .from('latest_learner_status_v')
      .select('status, completion_percent')
      .eq('company_id', company.id);
    if (error) throw error;
    latestStatusesResult = {
      data: (data ?? []) as Array<{ status: string; completion_percent: number | null }>,
      error: null,
    };
  } catch (error) {
    if (!isMissingRelationError(error)) throw error;

    const { data, error: snapshotError } = await db
      .from('learner_status_snapshots')
      .select('learner_id, status, completion_percent, snapshot_date')
      .eq('company_id', company.id)
      .order('snapshot_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (snapshotError) throw snapshotError;

    const latestByLearner = new Map<string, { status: string; completion_percent: number | null }>();
    for (const row of data ?? []) {
      if (!latestByLearner.has(row.learner_id)) {
        latestByLearner.set(row.learner_id, {
          status: row.status,
          completion_percent: row.completion_percent,
        });
      }
    }

    latestStatusesResult = {
      data: Array.from(latestByLearner.values()),
      error: null,
    };
  }

  const [
    learnersResult,
    activeThisWeekResult,
    completionsThisWeekResult,
    zoomThisWeekResult,
    assignmentsThisWeekResult,
    surveysThisWeekResult,
    topLearnersResult,
    alertsResult,
  ] = await Promise.all([
    db.from('learners').select('id', { count: 'exact', head: true }).eq('company_id', company.id).eq('is_active', true),
    db.from('learners').select('id', { count: 'exact', head: true }).eq('company_id', company.id).eq('is_active', true).gte('last_active_at', weekStartIso),
    db.from('enrollments').select('id', { count: 'exact', head: true }).eq('company_id', company.id).gte('completed_at', weekStartIso),
    db.from('zoom_attendance').select('id', { count: 'exact', head: true }).eq('company_id', company.id).eq('attended', true).gte('join_time', weekStartIso),
    db.from('assignments').select('id', { count: 'exact', head: true }).eq('company_id', company.id).eq('submitted', true).gte('submitted_at', weekStartIso),
    db.from('surveys').select('id', { count: 'exact', head: true }).eq('company_id', company.id).gte('submitted_at', weekStartIso),
    db.from('learner_points')
      .select('learner_id, total_points, sessions_attended, learners(full_name)')
      .eq('company_id', company.id)
      .order('total_points', { ascending: false })
      .limit(5),
    db.from('alerts')
      .select('alert_type, severity, title, created_at')
      .eq('company_id', company.id)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const latestStatuses = latestStatusesResult?.data ?? [];
  const statusCounts = {
    high_engagement: 0,
    on_track: 0,
    slightly_behind: 0,
    at_risk: 0,
    not_started: 0,
  };

  let completionSum = 0;
  for (const row of latestStatuses) {
    const status = row.status as keyof typeof statusCounts;
    if (status in statusCounts) statusCounts[status]++;
    completionSum += Number(row.completion_percent ?? 0);
  }

  const topLearners = (topLearnersResult.data ?? []).map((row) => {
    const learner = Array.isArray(row.learners) ? row.learners[0] : row.learners;
    return {
      full_name: (learner as { full_name?: string } | null)?.full_name ?? 'Unknown',
      total_points: Number(row.total_points ?? 0),
      sessions_attended: Number(row.sessions_attended ?? 0),
    };
  });

  return {
    totals: {
      learners: Number(learnersResult.count ?? 0),
      active_this_week: Number(activeThisWeekResult.count ?? 0),
      course_completions: Number(completionsThisWeekResult.count ?? 0),
      zoom_attendances: Number(zoomThisWeekResult.count ?? 0),
      assignments_submitted: Number(assignmentsThisWeekResult.count ?? 0),
      surveys_submitted: Number(surveysThisWeekResult.count ?? 0),
    },
    status_distribution: statusCounts,
    avg_completion: latestStatuses.length > 0 ? completionSum / latestStatuses.length : 0,
    top_learners: topLearners,
    open_alerts: (alertsResult.data ?? []) as WeeklyReportData['open_alerts'],
  };
}

export async function refreshCompanyWeeklyRollups(companyIds?: string[]): Promise<number> {
  if (!isAdminConfigured()) return 0;

  try {
    return await withServerTiming('weekly.rollups.refresh', async () => {
      const db = createAdminClient();
      const companies = await getCompaniesForWeeklyRefresh(companyIds);
      const { weekStartDate, weekEndDate } = getWeekWindow();
      const upsertRows: Record<string, unknown>[] = [];

      for (const company of companies) {
        const snapshot = await buildWeeklySnapshot(company);
        upsertRows.push({
          company_id: company.id,
          week_start: weekStartDate,
          week_end: weekEndDate,
          learners: snapshot.totals.learners,
          active_this_week: snapshot.totals.active_this_week,
          course_completions: snapshot.totals.course_completions,
          zoom_attendances: snapshot.totals.zoom_attendances,
          assignments_submitted: snapshot.totals.assignments_submitted,
          surveys_submitted: snapshot.totals.surveys_submitted,
          high_engagement_count: snapshot.status_distribution.high_engagement,
          on_track_count: snapshot.status_distribution.on_track,
          slightly_behind_count: snapshot.status_distribution.slightly_behind,
          at_risk_count: snapshot.status_distribution.at_risk,
          not_started_count: snapshot.status_distribution.not_started,
          avg_completion: snapshot.avg_completion,
          top_learners_json: snapshot.top_learners,
          open_alerts_json: snapshot.open_alerts,
          updated_at: new Date().toISOString(),
        });
      }

      for (let index = 0; index < upsertRows.length; index += 100) {
        const { error } = await db
          .from('company_weekly_rollups')
          .upsert(upsertRows.slice(index, index + 100), { onConflict: 'company_id,week_start' });
        if (error) throw error;
      }

      return upsertRows.length;
    }, { company_count: companyIds?.length ?? 'all' });
  } catch (error) {
    if (isMissingRelationError(error)) {
      console.warn('[WeeklyRollups] Skipping refresh until migration 006 is applied.');
      return 0;
    }
    throw error;
  }
}

export async function getWeeklyReportByCompanySlug(slug: string): Promise<WeeklyReportData | null> {
  if (!isAdminConfigured()) return null;

  return withServerTiming('weekly.report.load', async () => {
    const db = createAdminClient();
    const { weekStartDate, weekEndDate } = getWeekWindow();

    const { data: company, error: companyError } = await db
      .from('companies')
      .select('id, name, start_date, learning_timeline_days')
      .eq('slug', slug)
      .single();
    if (companyError || !company) return null;

    let { data: rollup, error: rollupError } = await db
      .from('company_weekly_rollups')
      .select('*')
      .eq('company_id', company.id)
      .eq('week_start', weekStartDate)
      .single();

    if (rollupError || !rollup) {
      if (rollupError && isMissingRelationError(rollupError)) {
        const snapshot = await buildWeeklySnapshot(company);
        return {
          company: {
            name: company.name,
            start_date: company.start_date,
            learning_timeline_days: company.learning_timeline_days,
          },
          week_start: `${weekStartDate}T00:00:00.000Z`,
          week_end: `${weekEndDate}T23:59:59.999Z`,
          ...snapshot,
        };
      }

      await refreshCompanyWeeklyRollups([company.id]);
      const reread = await db
        .from('company_weekly_rollups')
        .select('*')
        .eq('company_id', company.id)
        .eq('week_start', weekStartDate)
        .single();
      rollup = reread.data;
      rollupError = reread.error;
    }

    if (rollupError || !rollup) return null;

    return {
      company: {
        name: company.name,
        start_date: company.start_date,
        learning_timeline_days: company.learning_timeline_days,
      },
      week_start: `${weekStartDate}T00:00:00.000Z`,
      week_end: `${weekEndDate}T23:59:59.999Z`,
      totals: {
        learners: Number(rollup.learners ?? 0),
        active_this_week: Number(rollup.active_this_week ?? 0),
        course_completions: Number(rollup.course_completions ?? 0),
        zoom_attendances: Number(rollup.zoom_attendances ?? 0),
        assignments_submitted: Number(rollup.assignments_submitted ?? 0),
        surveys_submitted: Number(rollup.surveys_submitted ?? 0),
      },
      status_distribution: {
        high_engagement: Number(rollup.high_engagement_count ?? 0),
        on_track: Number(rollup.on_track_count ?? 0),
        slightly_behind: Number(rollup.slightly_behind_count ?? 0),
        at_risk: Number(rollup.at_risk_count ?? 0),
        not_started: Number(rollup.not_started_count ?? 0),
      },
      avg_completion: Number(rollup.avg_completion ?? 0),
      top_learners: (rollup.top_learners_json ?? []) as WeeklyReportData['top_learners'],
      open_alerts: (rollup.open_alerts_json ?? []) as WeeklyReportData['open_alerts'],
    };
  }, { slug, week_start: getWeekWindow().weekStartDate });
}
