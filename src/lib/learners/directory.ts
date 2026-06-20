import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { withServerTiming } from '@/lib/perf';
import type { LearnerStatus } from '@/types/learner';
import { isMissingRelationError } from '@/lib/utils/db';
import { readThroughTtlCache } from '@/lib/cache/serverCache';

export interface LearnerDirectoryFilters {
  companyId?: string | null;
  q?: string;
  courseId?: string;
  status?: string;
  role?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
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
  learner_count?: number;
}

export interface RoleFilterOption {
  role: string;
  learner_count: number;
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

async function countBaseActiveLearners(companyId?: string | null): Promise<number> {
  const db = createAdminClient();
  let query = db
    .from('learners')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true);

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { count, error } = await query;
  if (error) throw error;
  return Number(count ?? 0);
}

async function countRollupRowsForScope(companyId?: string | null): Promise<number> {
  const db = createAdminClient();
  let query = db
    .from('learner_directory_rollups')
    .select('learner_id', { count: 'exact', head: true });

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { count, error } = await query;
  if (error) throw error;
  return Number(count ?? 0);
}

async function getCourseOptionsFromReadModel(companyId?: string | null): Promise<CourseFilterOption[] | null> {
  const db = createAdminClient();
  let query = db
    .from('learner_course_filter_options_v')
    .select('course_id, course_name')
    .eq('scope_type', companyId ? 'company' : 'global')
    .order('course_name');

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;
  if (isMissingRelationError(error)) return null;
  if (error) throw error;

  return (data || []).map((course) => ({
    id: course.course_id,
    name: course.course_name,
  }));
}

async function getRoleOptionsWithCounts(companyId?: string | null): Promise<RoleFilterOption[]> {
  const db = createAdminClient();

  // Try rollup table first
  try {
    let query = db
      .from('learner_directory_rollups')
      .select('title');

    if (companyId) {
      query = query.eq('company_id', companyId);
    }

    const { data, error } = await query;
    if (error && !isMissingRelationError(error)) throw error;

    if (data && data.length > 0) {
      // Count occurrences of each role
      const roleCounts = new Map<string, number>();
      for (const row of data as Array<{ title: string | null }>) {
        const role = row.title || 'Unassigned';
        roleCounts.set(role, (roleCounts.get(role) || 0) + 1);
      }

      return Array.from(roleCounts.entries())
        .map(([role, count]) => ({ role, learner_count: count }))
        .sort((a, b) => a.role.localeCompare(b.role));
    }
  } catch (error) {
    if (!isMissingRelationError(error)) throw error;
  }

  // Fallback to learners table
  let query = db
    .from('learners')
    .select('title')
    .eq('is_active', true);

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const roleCounts = new Map<string, number>();
  for (const row of (data || []) as Array<{ title: string | null }>) {
    const role = row.title || 'Unassigned';
    roleCounts.set(role, (roleCounts.get(role) || 0) + 1);
  }

  return Array.from(roleCounts.entries())
    .map(([role, count]) => ({ role, learner_count: count }))
    .sort((a, b) => a.role.localeCompare(b.role));
}

async function addLearnerCountsToCourses(
  courses: CourseFilterOption[],
  companyId?: string | null
): Promise<CourseFilterOption[]> {
  if (courses.length === 0) return courses;

  const db = createAdminClient();
  const courseIds = courses.map(c => c.id);

  // Try to get counts from rollups first
  try {
    let query = db
      .from('learner_directory_rollups')
      .select('active_course_ids');

    if (companyId) {
      query = query.eq('company_id', companyId);
    }

    const { data, error } = await query;
    if (error && !isMissingRelationError(error)) throw error;

    if (data && data.length > 0) {
      const courseCounts = new Map<string, number>();
      for (const row of data as Array<{ active_course_ids: string[] | null }>) {
        for (const courseId of row.active_course_ids ?? []) {
          if (courseIds.includes(courseId)) {
            courseCounts.set(courseId, (courseCounts.get(courseId) || 0) + 1);
          }
        }
      }

      return courses.map(course => ({
        ...course,
        learner_count: courseCounts.get(course.id) || 0,
      }));
    }
  } catch (error) {
    if (!isMissingRelationError(error)) throw error;
  }

  // Fallback: count from enrollments
  let enrollQuery = db
    .from('enrollments')
    .select('course_id, learner_id')
    .in('course_id', courseIds)
    .eq('is_active', true);

  if (companyId) {
    enrollQuery = enrollQuery.eq('company_id', companyId);
  }

  const { data: enrollments, error: enrollError } = await enrollQuery;
  if (enrollError) throw enrollError;

  const courseCounts = new Map<string, Set<string>>();
  for (const enroll of (enrollments || []) as Array<{ course_id: string; learner_id: string }>) {
    if (!courseCounts.has(enroll.course_id)) {
      courseCounts.set(enroll.course_id, new Set());
    }
    courseCounts.get(enroll.course_id)!.add(enroll.learner_id);
  }

  return courses.map(course => ({
    ...course,
    learner_count: courseCounts.get(course.id)?.size || 0,
  }));
}

type DirectoryFilterableQuery = {
  eq: (column: string, value: string) => DirectoryFilterableQuery;
  contains: (column: string, value: string[]) => DirectoryFilterableQuery;
  or: (filters: string) => DirectoryFilterableQuery;
};

function applyDirectoryQueryFilters(
  query: DirectoryFilterableQuery,
  filters: Required<Pick<LearnerDirectoryFilters, 'q' | 'courseId' | 'status'>> & { companyId?: string | null; role?: string },
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
  if (filters.role && filters.role !== 'all') {
    nextQuery = nextQuery.eq('title', filters.role);
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
    role: filters.role?.trim() || 'all',
  };

  // Determine sort column and direction
  const sortBy = filters.sortBy || 'full_name';
  const sortDir = filters.sortDir === 'desc' ? 'desc' : 'asc';
  const ascending = sortDir === 'asc';

  // Validate sortBy against allowed columns
  const allowedSortColumns = ['full_name', 'email', 'department', 'title', 'courses_enrolled', 'avg_progress', 'last_active_at'];
  const sortColumn = allowedSortColumns.includes(sortBy) ? sortBy : 'full_name';

  const countQuery = applyDirectoryQueryFilters(
    db.from(tableName).select('learner_id', { count: 'exact', head: true }) as unknown as DirectoryFilterableQuery,
    normalized,
  ) as unknown as Promise<{ count: number | null; error: Error | null }>;
  const dataQuery = applyDirectoryQueryFilters(
    db.from(tableName)
      .select('learner_id, company_id, company_name, company_slug, full_name, email, department, title, last_active_at, courses_enrolled, avg_progress, status, completion_percent, benchmark_percent, live_sessions_last_30_days')
      .order(sortColumn, { ascending }) as unknown as DirectoryFilterableQuery,
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
      const rollupResult = await queryLearnerDirectoryTable('learner_directory_rollups', filters);
      if (rollupResult.total > 0 || rollupResult.rows.length > 0) {
        return rollupResult;
      }

      const rollupRowsForScope = await countRollupRowsForScope(filters.companyId ?? null);
      if (rollupRowsForScope > 0) {
        return rollupResult;
      }

      const baseActiveLearnerCount = await countBaseActiveLearners(filters.companyId ?? null);
      if (baseActiveLearnerCount === 0) {
        return rollupResult;
      }

      return queryLearnerDirectoryTable('learner_directory_v', filters);
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
  role_options: RoleFilterOption[];
}> {
  return withServerTiming('learners.directory.meta', async () => {
    const db = createAdminClient();
    const cacheKey = companyId ? `learners:meta:${companyId}` : 'learners:meta:global';
    return readThroughTtlCache(cacheKey, 5_000, async () => {
      let courseOptions = await getCourseOptionsFromReadModel(companyId);
      if (courseOptions === null) {
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
        }

        courseOptions = [];
        if (courseIds.size > 0) {
          const { data: courses, error } = await db
            .from('courses')
            .select('id, name')
            .in('id', Array.from(courseIds))
            .order('name');
          if (error) throw error;

          courseOptions = (courses || []).map((course) => ({
            id: course.id,
            name: course.name,
          }));
        }
      }

      // Add learner counts to courses
      courseOptions = await addLearnerCountsToCourses(courseOptions, companyId);

      // Get role options with counts
      const roleOptions = await getRoleOptionsWithCounts(companyId);

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

      return {
        company_name: companyName,
        course_options: courseOptions,
        role_options: roleOptions,
      };
    });
  }, { company_id: companyId ?? 'global' });
}
