import 'server-only';

import { createAdminClient, isAdminConfigured } from '@/lib/supabase/admin';
import { withServerTiming } from '@/lib/perf';
import { isMissingRelationError } from '@/lib/utils/db';

type LearnerDirectorySourceRow = {
  learner_id: string;
  company_id: string | null;
  company_name: string | null;
  company_slug: string | null;
  full_name: string | null;
  email: string | null;
  department: string | null;
  title: string | null;
  last_active_at: string | null;
  courses_enrolled: number | null;
  avg_progress: number | null;
  active_course_ids: string[] | null;
  status: string | null;
  completion_percent: number | null;
  benchmark_percent: number | null;
  live_sessions_last_30_days: number | null;
  snapshot_date: string | null;
};

type RollupDeleteRow = {
  learner_id: string;
};

async function deleteStaleRollupRows(
  activeLearnerIds: string[],
  companyIds?: string[],
) {
  const db = createAdminClient();
  const activeSet = new Set(activeLearnerIds);
  const existingRows: RollupDeleteRow[] = [];

  if (companyIds && companyIds.length > 0) {
    for (const companyId of companyIds) {
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await db
          .from('learner_directory_rollups')
          .select('learner_id')
          .eq('company_id', companyId)
          .range(offset, offset + 999);
        if (error) throw error;
        if (!data || data.length === 0) break;
        existingRows.push(...data);
        if (data.length < 1000) break;
      }
    }
  } else {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db
        .from('learner_directory_rollups')
        .select('learner_id')
        .range(offset, offset + 999);
      if (error) throw error;
      if (!data || data.length === 0) break;
      existingRows.push(...data);
      if (data.length < 1000) break;
    }
  }

  const staleIds = existingRows
    .map((row) => row.learner_id)
    .filter((learnerId) => !activeSet.has(learnerId));

  for (let index = 0; index < staleIds.length; index += 500) {
    const { error } = await db
      .from('learner_directory_rollups')
      .delete()
      .in('learner_id', staleIds.slice(index, index + 500));
    if (error) throw error;
  }
}

async function getLiveSessionCounts(companyIds?: string[]) {
  const db = createAdminClient();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const counts = new Map<string, number>();

  if (companyIds && companyIds.length > 0) {
    for (const companyId of companyIds) {
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await db
          .from('zoom_attendance')
          .select('learner_id')
          .eq('company_id', companyId)
          .eq('attended', true)
          .gte('join_time', thirtyDaysAgo.toISOString())
          .range(offset, offset + 999);
        if (error) throw error;
        if (!data || data.length === 0) break;
        for (const row of data) {
          if (!row.learner_id) continue;
          counts.set(row.learner_id, (counts.get(row.learner_id) ?? 0) + 1);
        }
        if (data.length < 1000) break;
      }
    }
    return counts;
  }

  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db
      .from('zoom_attendance')
      .select('learner_id')
      .eq('attended', true)
      .gte('join_time', thirtyDaysAgo.toISOString())
      .range(offset, offset + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (!row.learner_id) continue;
      counts.set(row.learner_id, (counts.get(row.learner_id) ?? 0) + 1);
    }
    if (data.length < 1000) break;
  }

  return counts;
}

export async function refreshLearnerDirectoryRollups(companyIds?: string[]): Promise<number> {
  if (!isAdminConfigured()) return 0;

  try {
    return await withServerTiming('learners.rollups.refresh', async () => {
      const db = createAdminClient();
      const liveSessionsByLearner = await getLiveSessionCounts(companyIds);
      const scopedCompanyIds = companyIds && companyIds.length > 0 ? companyIds : null;
      const sourceRows: LearnerDirectorySourceRow[] = [];
      const activeLearnerIds: string[] = [];

      for (let offset = 0; ; offset += 1000) {
        let query = db
          .from('learner_directory_v')
          .select('learner_id, company_id, company_name, company_slug, full_name, email, department, title, last_active_at, courses_enrolled, avg_progress, active_course_ids, status, completion_percent, benchmark_percent, live_sessions_last_30_days, snapshot_date')
          .order('learner_id')
          .range(offset, offset + 999);

        if (scopedCompanyIds) {
          query = query.in('company_id', scopedCompanyIds);
        }

        const { data, error } = await query;
        if (error) throw error;
        if (!data || data.length === 0) break;
        sourceRows.push(...(data as LearnerDirectorySourceRow[]));
        activeLearnerIds.push(...data.map((row) => row.learner_id));
        if (data.length < 1000) break;
      }

      const upsertRows = sourceRows.map((row) => ({
        learner_id: row.learner_id,
        company_id: row.company_id,
        company_name: row.company_name,
        company_slug: row.company_slug,
        full_name: row.full_name,
        email: row.email,
        department: row.department,
        title: row.title,
        last_active_at: row.last_active_at,
        courses_enrolled: Number(row.courses_enrolled ?? 0),
        avg_progress: Number(row.avg_progress ?? 0),
        active_course_ids: row.active_course_ids ?? [],
        status: row.status ?? 'not_started',
        completion_percent: Number(row.completion_percent ?? 0),
        benchmark_percent: Number(row.benchmark_percent ?? 0),
        live_sessions_last_30_days: liveSessionsByLearner.get(row.learner_id) ?? Number(row.live_sessions_last_30_days ?? 0),
        snapshot_date: row.snapshot_date,
        updated_at: new Date().toISOString(),
      }));

      for (let index = 0; index < upsertRows.length; index += 500) {
        const { error } = await db
          .from('learner_directory_rollups')
          .upsert(upsertRows.slice(index, index + 500), { onConflict: 'learner_id' });
        if (error) throw error;
      }

      await deleteStaleRollupRows(activeLearnerIds, companyIds);
      return upsertRows.length;
    }, { company_count: companyIds?.length ?? 'all' });
  } catch (error) {
    if (isMissingRelationError(error)) {
      console.warn('[LearnerRollups] Skipping refresh until migration 006 is applied.');
      return 0;
    }
    throw error;
  }
}
