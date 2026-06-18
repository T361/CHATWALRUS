import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { withServerTiming } from '@/lib/perf';
import type { LearnerStatus } from '@/types/learner';
import { isMissingRelationError } from '@/lib/utils/db';

export interface LearnerDirectoryFilters {
  companyId?: string | null;
  q?: string;
  courseId?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface LearnerDirectoryRow {
  learner_id: string;
  company_id: string | null;
  company_name: string | null;
  company_slug: string | null;
  full_name: string | null;
  email: string | null;
  department: string | null;
  title: string | null;
  last_active_at: string | null;
  courses_enrolled: number;
  avg_progress: number;
  status: LearnerStatus;
  completion_percent: number;
  benchmark_percent: number;
  live_sessions_last_30_days: number;
}

export interface CourseFilterOption {
  id: string;
  name: string;
}

export interface LearnerDirectoryResult {
  rows: LearnerDirectoryRow[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

function normalizePage(value?: number): number {
  return Number.isFinite(value) && value && value > 0 ? Math.floor(value) : 1;
}

function normalizeLimit(value?: number): number {
  const parsed = Number.isFinite(value) && value ? Math.floor(value) : 25;
  return Math.min(Math.max(parsed, 10), 100);
}

type DirectoryFilterableQuery = {
  eq: (column: string, value: string) => DirectoryFilterableQuery;
  contains: (column: string, value: string[]) => DirectoryFilterableQuery;
  or: (filters: string) => DirectoryFilterableQuery;
};

function applyDirectoryQueryFilters(
  query: DirectoryFilterableQuery,
  filters: Required<Pick<LearnerDirectoryFilters, 'q' | 'courseId' | 'status'>> & { companyId?: string | null },
) {
  let nextQuery = query;
  if (filters.companyId) {
    nextQuery = nextQuery.eq('company_id', filters.companyId);
  }
  if (filters.status !== 'all') {
    nextQuery = nextQuery.eq('status', filters.status);
  }
  if (filters.courseId) {
    nextQuery = nextQuery.contains('active_course_ids', [filters.courseId]);
  }
  if (filters.q) {
    const q = filters.q.replace(/,/g, ' ');
    nextQuery = nextQuery.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);
  }
  return nextQuery;
}

async function queryLearnerDirectoryTable(
  tableName: 'learner_directory_rollups' | 'learner_directory_v',
  filters: LearnerDirectoryFilters
): Promise<LearnerDirectoryResult> {
  const db = createAdminClient();
  const page = normalizePage(filters.page);
  const limit = normalizeLimit(filters.limit);
  const normalized = {
    companyId: filters.companyId ?? null,
    q: filters.q?.trim() ?? '',
    courseId: filters.courseId ?? '',
    status: filters.status?.trim() || 'all',
  };

  const countQuery = applyDirectoryQueryFilters(
    db.from(tableName).select('learner_id', { count: 'exact', head: true }) as unknown as DirectoryFilterableQuery,
    normalized,
  ) as unknown as Promise<{ count: number | null; error: Error | null }>;
  const dataQuery = applyDirectoryQueryFilters(
    db.from(tableName)
      .select('learner_id, company_id, company_name, company_slug, full_name, email, department, title, last_active_at, courses_enrolled, avg_progress, status, completion_percent, benchmark_percent, live_sessions_last_30_days')
      .order('full_name') as unknown as DirectoryFilterableQuery,
    normalized,
  ) as unknown as { range: (from: number, to: number) => Promise<{ data: unknown; error: Error | null }> };

  const [{ count, error: countError }, { data, error }] = await Promise.all([
    countQuery,
    dataQuery.range((page - 1) * limit, (page - 1) * limit + limit - 1),
  ]);
  if (countError) throw countError;
  if (error) throw error;

  const total = Number(count ?? 0);
  const rows = ((data || []) as LearnerDirectoryRow[]).map((row) => ({
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
    status: (row.status || 'not_started') as LearnerStatus,
    completion_percent: Number(row.completion_percent ?? 0),
    benchmark_percent: Number(row.benchmark_percent ?? 0),
    live_sessions_last_30_days: Number(row.live_sessions_last_30_days ?? 0),
  }));

  return {
    rows,
    total,
    page,
    limit,
    has_more: page * limit < total,
  };
}

export async function getLearnerDirectory(
  filters: LearnerDirectoryFilters,
): Promise<LearnerDirectoryResult> {
  return withServerTiming('learners.directory.load', async () => {
    try {
      return await queryLearnerDirectoryTable('learner_directory_rollups', filters);
    } catch (error) {
      if (!isMissingRelationError(error)) throw error;
      return queryLearnerDirectoryTable('learner_directory_v', filters);
    }
  }, {
    company_id: filters.companyId ?? 'global',
    page: filters.page ?? 1,
    limit: filters.limit ?? 25,
    has_course_filter: !!filters.courseId,
    has_search: !!filters.q,
    has_status_filter: !!filters.status && filters.status !== 'all',
  });
}

export async function getLearnerDirectoryMeta(companyId?: string | null): Promise<{
  company_name?: string;
  course_options: CourseFilterOption[];
}> {
  return withServerTiming('learners.directory.meta', async () => {
    const db = createAdminClient();
    const courseIds = new Set<string>();

    try {
      for (let offset = 0; ; offset += 1000) {
        let query = db
          .from('learner_directory_rollups')
          .select('active_course_ids')
          .order('learner_id')
          .range(offset, offset + 999);

        if (companyId) {
          query = query.eq('company_id', companyId);
        }

        const { data, error } = await query;
        if (error) throw error;
        if (!data || data.length === 0) break;
        for (const row of data as Array<{ active_course_ids: string[] | null }>) {
          for (const courseId of row.active_course_ids ?? []) {
            if (courseId) courseIds.add(courseId);
          }
        }
        if (data.length < 1000) break;
      }
    } catch (error) {
      if (!isMissingRelationError(error)) throw error;
      let enrollmentQuery = db
        .from('enrollments')
        .select('course_id')
        .eq('is_active', true);

      if (companyId) {
        enrollmentQuery = enrollmentQuery.eq('company_id', companyId);
      }

      for (let offset = 0; ; offset += 1000) {
        const { data, error: enrollmentError } = await enrollmentQuery.range(offset, offset + 999);
        if (enrollmentError) throw enrollmentError;
        if (!data || data.length === 0) break;
        for (const row of data) {
          if (row.course_id) courseIds.add(row.course_id);
        }
        if (data.length < 1000) break;
      }
    }

    let companyName: string | undefined;
    if (companyId) {
      const { data: company, error } = await db
        .from('companies')
        .select('name')
        .eq('id', companyId)
        .single();
      if (error) throw error;
      companyName = company?.name;
    }

    if (courseIds.size === 0) {
      return {
        company_name: companyName,
        course_options: [],
      };
    }

    const { data: courses, error } = await db
      .from('courses')
      .select('id, name')
      .in('id', Array.from(courseIds))
      .order('name');
    if (error) throw error;

    return {
      company_name: companyName,
      course_options: (courses || []).map((course) => ({
        id: course.id,
        name: course.name,
      })),
    };
  }, { company_id: companyId ?? 'global' });
}
