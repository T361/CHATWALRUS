import { createAdminClient } from '@/lib/supabase/admin';
import PageShell from '@/components/layout/PageShell';
import Link from 'next/link';
import { normalizeRole } from '@/lib/learners/directory';
import CompanyFilter from './CompanyFilter';
import { RoleFilter } from './RoleFilter';

export const dynamic = 'force-dynamic';

type GlobalCourseRow = {
  id: string;
  name: string;
  total_lessons: number;
  enrolled: number;
  avg_progress: number;
  completions: number;
  role_breakdown: Record<string, number>;
  company_count: number;
};

type Company = { id: string; name: string; slug: string };

async function getGlobalCourseData(companyId?: string): Promise<GlobalCourseRow[]> {
  const db = createAdminClient();

  const [coursesRes, enrollRes, learnersRes] = await Promise.all([
    db.from('courses').select('id, name, total_lessons').order('name'),
    companyId
      ? db.from('enrollments')
          .select('course_id, progress_percent, completed_at, learner_id, company_id')
          .eq('company_id', companyId)
          .eq('is_active', true)
      : db.from('enrollments')
          .select('course_id, progress_percent, completed_at, learner_id, company_id')
          .eq('is_active', true),
    companyId
      ? db.from('learners').select('id, title, department').eq('company_id', companyId).eq('is_active', true)
      : db.from('learners').select('id, title, department').eq('is_active', true),
  ]);

  if (coursesRes.error) throw coursesRes.error;
  if (!coursesRes.data?.length) return [];

  const learnerRoleMap = new Map<string, string>();
  for (const l of (learnersRes.data || []) as Array<{ id: string; title: string | null; department: string | null }>) {
    learnerRoleMap.set(l.id, normalizeRole(l.title, l.department));
  }

  type Stats = { count: number; progress: number; completions: number; roles: Map<string, number>; companies: Set<string> };
  const statsMap = new Map<string, Stats>();

  for (const e of (enrollRes.data || []) as Array<{ course_id: string; progress_percent: number; completed_at: string | null; learner_id: string; company_id: string }>) {
    const s = statsMap.get(e.course_id) || { count: 0, progress: 0, completions: 0, roles: new Map(), companies: new Set() };
    s.count++;
    s.progress += Number(e.progress_percent || 0);
    if (e.completed_at) s.completions++;
    if (e.company_id) s.companies.add(e.company_id);
    const role = learnerRoleMap.get(e.learner_id) || 'Other';
    s.roles.set(role, (s.roles.get(role) || 0) + 1);
    statsMap.set(e.course_id, s);
  }

  return coursesRes.data.map(course => {
    const s = statsMap.get(course.id);
    const role_breakdown: Record<string, number> = {};
    if (s) for (const [r, c] of s.roles.entries()) role_breakdown[r] = c;
    return {
      id: course.id,
      name: course.name,
      total_lessons: course.total_lessons || 0,
      enrolled: s?.count || 0,
      avg_progress: s ? Math.round(s.progress / s.count) : 0,
      completions: s?.completions || 0,
      role_breakdown,
      company_count: s?.companies.size || 0,
    };
  });
}

function SortLink({
  field,
  label,
  sortBy,
  sortDir,
  companyId,
  filter,
  role,
}: {
  field: string;
  label: string;
  sortBy: string;
  sortDir: string;
  companyId: string;
  filter: string;
  role: string;
}) {
  const isActive = sortBy === field;
  const nextDir = isActive && sortDir === 'asc' ? 'desc' : 'asc';
  const params = new URLSearchParams({ sort_by: field, sort_dir: nextDir, filter });
  if (companyId) params.set('company_id', companyId);
  if (role) params.set('role', role);
  return (
    <Link
      href={`/courses?${params.toString()}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
        color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
        fontWeight: isActive ? 700 : 600,
        textDecoration: 'none', fontSize: '0.8125rem', whiteSpace: 'nowrap',
      }}
    >
      {label}
      {isActive ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
    </Link>
  );
}

export default async function GlobalCoursesPage(props: {
  searchParams: Promise<{ sort_by?: string; sort_dir?: string; filter?: string; company_id?: string; role?: string }>;
}) {
  const searchParams = await props.searchParams;
  const db = createAdminClient();

  const sortBy  = searchParams.sort_by  || 'enrolled';
  const sortDir = searchParams.sort_dir || 'desc';
  const filter  = searchParams.filter   || 'all';
  const companyId = searchParams.company_id || '';
  const role = searchParams.role || '';

  const [courses, companiesRes] = await Promise.all([
    getGlobalCourseData(companyId || undefined),
    db.from('companies').select('id, name, slug').eq('is_active', true).order('name'),
  ]);

  const companies: Company[] = (companiesRes.data || []) as Company[];
  const selectedCompany = companies.find(c => c.id === companyId);

  // Apply filter then role filter
  let filtered = filter === 'enrolled' ? courses.filter(c => c.enrolled > 0) : courses;
  if (role) {
    filtered = filtered.filter(c => (c.role_breakdown[role] || 0) > 0);
  }

  const sorted = [...filtered].sort((a, b) => {
    let aVal: string | number = 0, bVal: string | number = 0;
    switch (sortBy) {
      case 'name':        aVal = a.name;         bVal = b.name;         break;
      case 'enrolled':    aVal = a.enrolled;     bVal = b.enrolled;     break;
      case 'progress':    aVal = a.avg_progress; bVal = b.avg_progress; break;
      case 'completed':   aVal = a.completions;  bVal = b.completions;  break;
      case 'companies':   aVal = a.company_count;bVal = b.company_count;break;
    }
    if (typeof aVal === 'string') return sortDir === 'asc' ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
    return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
  });

  const enrolledCount = courses.filter(c => c.enrolled > 0).length;
  const totalEnrolled = courses.reduce((s, c) => s + c.enrolled, 0);

  // Collect all unique roles present across all courses, sorted alphabetically
  const allRoles = Array.from(
    new Set(courses.flatMap(c => Object.keys(c.role_breakdown)))
  ).sort();

  function filterLink(f: string) {
    const p = new URLSearchParams({ sort_by: sortBy, sort_dir: sortDir, filter: f });
    if (companyId) p.set('company_id', companyId);
    if (role) p.set('role', role);
    return `/courses?${p.toString()}`;
  }

  const sortLinkProps = { sortBy, sortDir, companyId, filter, role };

  return (
    <PageShell>
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title">All Courses</h1>
          <p className="page-subtitle">
            {courses.length} courses · {totalEnrolled} total enrollments
            {selectedCompany ? ` · filtered to ${selectedCompany.name}` : ' across all companies'}
          </p>
        </div>
      </div>

      {/* Filters row */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {/* Company filter */}
        <CompanyFilter companies={companies} companyId={companyId} />

        <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

        {/* Enrolled filter */}
        <Link href={filterLink('all')} className={filter === 'all' ? 'btn btn-primary btn-xs' : 'btn btn-secondary btn-xs'}>
          All ({courses.length})
        </Link>
        <Link href={filterLink('enrolled')} className={filter === 'enrolled' ? 'btn btn-primary btn-xs' : 'btn btn-secondary btn-xs'}>
          Has Enrollments ({enrolledCount})
        </Link>
      </div>

      {/* Table */}
      {sorted.length === 0 ? (
        <div className="empty-state card"><p>No courses found.</p></div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ fontWeight: 700, cursor: 'pointer', background: sortBy === 'name' ? 'var(--surface)' : undefined }}>
                    <SortLink field="name" label="Course Name" {...sortLinkProps} />
                  </th>
                  <th style={{ width: 90, fontWeight: 700, cursor: 'pointer', background: sortBy === 'enrolled' ? 'var(--surface)' : undefined }}>
                    <SortLink field="enrolled" label="Enrolled" {...sortLinkProps} />
                  </th>
                  <th style={{ width: 140, fontWeight: 700, cursor: 'pointer', background: sortBy === 'progress' ? 'var(--surface)' : undefined }}>
                    <SortLink field="progress" label="Avg Progress" {...sortLinkProps} />
                  </th>
                  <th style={{ width: 110, fontWeight: 700, cursor: 'pointer', background: sortBy === 'completed' ? 'var(--surface)' : undefined }}>
                    <SortLink field="completed" label="Completed" {...sortLinkProps} />
                  </th>
                  <th style={{ fontWeight: 700, minWidth: 140 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                      <span>Roles</span>
                      <RoleFilter role={role} roles={allRoles} />
                    </div>
                  </th>
                  {!companyId && (
                    <th style={{ width: 100, fontWeight: 700, cursor: 'pointer', background: sortBy === 'companies' ? 'var(--surface)' : undefined }}>
                      <SortLink field="companies" label="Companies" {...sortLinkProps} />
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {sorted.map(course => {
                  const dim = course.enrolled === 0;
                  const roleCount = role ? (course.role_breakdown[role] || 0) : null;
                  return (
                    <tr key={course.id} style={{ opacity: dim ? 0.45 : 1 }}>
                      <td style={{ fontWeight: 500 }}>{course.name}</td>
                      <td>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          minWidth: 28, padding: '0.125rem 0.5rem', borderRadius: 9999,
                          background: course.enrolled > 0 ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'var(--surface)',
                          color: course.enrolled > 0 ? 'var(--primary)' : 'var(--text-muted)',
                          fontWeight: 700, fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums',
                        }}>
                          {course.enrolled}
                        </span>
                      </td>
                      <td>
                        {course.enrolled > 0 ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ flex: 1, height: 5, background: 'var(--surface)', borderRadius: 3, overflow: 'hidden', minWidth: 60 }}>
                              <div style={{ width: `${course.avg_progress}%`, height: '100%', background: 'var(--primary)', borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: 32, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                              {course.avg_progress}%
                            </span>
                          </div>
                        ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td>
                        {course.enrolled > 0 ? (
                          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {course.completions}
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}> / {course.enrolled}</span>
                          </span>
                        ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td>
                        {role ? (
                          /* Specific role selected — show count for that role */
                          roleCount !== null && roleCount > 0 ? (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                              padding: '0.125rem 0.5rem', borderRadius: 9999,
                              background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
                              color: 'var(--primary)', fontWeight: 700,
                              fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums',
                            }}>
                              {roleCount}
                            </span>
                          ) : <span style={{ color: 'var(--text-muted)' }}>—</span>
                        ) : (
                          /* All roles — show total enrolled count */
                          course.enrolled > 0 ? (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center',
                              padding: '0.125rem 0.5rem', borderRadius: 9999,
                              background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
                              color: 'var(--primary)', fontWeight: 700,
                              fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums',
                            }}>
                              {course.enrolled}
                            </span>
                          ) : <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      {!companyId && (
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums' }}>
                          {course.company_count > 0 ? course.company_count : '—'}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </PageShell>
  );
}
