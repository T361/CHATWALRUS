import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import CompanyShell from '@/components/layout/CompanyShell';
import Link from 'next/link';
import { normalizeRole } from '@/lib/learners/directory';

type CourseRow = {
  id: string;
  name: string;
  total_lessons: number;
  company_enrollment: number;
  company_avg_progress: number;
  company_completions: number;
  total_enrollments_all_companies: number;
  role_breakdown: Record<string, number>;
};

async function getCourseData(companyId: string): Promise<CourseRow[]> {
  const db = createAdminClient();

  // Get all courses from Thinkific
  const { data: allCourses, error: coursesError } = await db
    .from('courses')
    .select('id, name, total_lessons')
    .order('name');

  if (coursesError) throw coursesError;
  if (!allCourses || allCourses.length === 0) return [];

  // Get enrollments for this company (with learner title/department for role breakdown)
  const [enrollRes, allEnrollRes, learnerRoleRes] = await Promise.all([
    db.from('enrollments')
      .select('course_id, progress_percent, completed_at, learner_id')
      .eq('company_id', companyId)
      .eq('is_active', true),
    db.from('enrollments')
      .select('course_id')
      .eq('is_active', true),
    db.from('learners')
      .select('id, title, department')
      .eq('company_id', companyId)
      .eq('is_active', true),
  ]);

  if (enrollRes.error) throw enrollRes.error;
  if (allEnrollRes.error) throw allEnrollRes.error;

  // Build learner role lookup
  const learnerRoleMap = new Map<string, string>();
  for (const l of (learnerRoleRes.data || []) as Array<{ id: string; title: string | null; department: string | null }>) {
    learnerRoleMap.set(l.id, normalizeRole(l.title, l.department));
  }

  // Aggregate company enrollment stats + role breakdown per course
  type CourseStats = { count: number; progress: number; completions: number; roles: Map<string, number> };
  const companyStats = new Map<string, CourseStats>();
  for (const enroll of (enrollRes.data || []) as Array<{
    course_id: string; progress_percent: number; completed_at: string | null; learner_id: string;
  }>) {
    const stats = companyStats.get(enroll.course_id) || { count: 0, progress: 0, completions: 0, roles: new Map() };
    stats.count++;
    stats.progress += Number(enroll.progress_percent || 0);
    if (enroll.completed_at) stats.completions++;
    const role = learnerRoleMap.get(enroll.learner_id) || 'Other';
    stats.roles.set(role, (stats.roles.get(role) || 0) + 1);
    companyStats.set(enroll.course_id, stats);
  }

  // Count total enrollments per course across all companies
  const totalEnrollments = new Map<string, number>();
  for (const enroll of (allEnrollRes.data || []) as Array<{ course_id: string }>) {
    totalEnrollments.set(enroll.course_id, (totalEnrollments.get(enroll.course_id) || 0) + 1);
  }

  // Build course rows
  return allCourses.map(course => {
    const stats = companyStats.get(course.id);
    const roleBreakdown: Record<string, number> = {};
    if (stats) {
      for (const [role, count] of stats.roles.entries()) {
        roleBreakdown[role] = count;
      }
    }
    return {
      id: course.id,
      name: course.name,
      total_lessons: course.total_lessons || 0,
      company_enrollment: stats?.count || 0,
      company_avg_progress: stats ? Math.round(stats.progress / stats.count) : 0,
      company_completions: stats?.completions || 0,
      total_enrollments_all_companies: totalEnrollments.get(course.id) || 0,
      role_breakdown: roleBreakdown,
    };
  });
}

function SortLink({
  field,
  label,
  sortBy,
  sortDir,
  slug,
  filter,
}: {
  field: string;
  label: string;
  sortBy: string;
  sortDir: string;
  slug: string;
  filter: string;
}) {
  const isActive = sortBy === field;
  const nextDir = isActive && sortDir === 'asc' ? 'desc' : 'asc';
  return (
    <Link
      href={`/company/${slug}/courses?filter=${filter}&sort_by=${field}&sort_dir=${nextDir}`}
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

export default async function CoursesPage(props: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort_by?: string; sort_dir?: string; filter?: 'enrolled' | 'all' }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const db = createAdminClient();

  const { data: company } = await db
    .from('companies')
    .select('id, name, slug')
    .eq('slug', params.slug)
    .maybeSingle();

  if (!company) notFound();

  const courses = await getCourseData(company.id);

  // Filter
  const filter = searchParams.filter || 'all';
  const filteredCourses = filter === 'enrolled'
    ? courses.filter(c => c.company_enrollment > 0)
    : courses;

  // Sort
  const sortBy = searchParams.sort_by || 'name';
  const sortDir = searchParams.sort_dir || 'asc';
  const sorted = [...filteredCourses].sort((a, b) => {
    let aVal: number | string = 0;
    let bVal: number | string = 0;

    switch (sortBy) {
      case 'name':
        aVal = a.name;
        bVal = b.name;
        break;
      case 'enrollment':
        aVal = a.company_enrollment;
        bVal = b.company_enrollment;
        break;
      case 'progress':
        aVal = a.company_avg_progress;
        bVal = b.company_avg_progress;
        break;
      case 'completed':
        aVal = a.company_completions;
        bVal = b.company_completions;
        break;
      case 'all_companies':
        aVal = a.total_enrollments_all_companies;
        bVal = b.total_enrollments_all_companies;
        break;
      default:
        return 0;
    }

    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
  });

  const sortLinkProps = { sortBy, sortDir, slug: params.slug, filter };

  return (
    <CompanyShell slug={params.slug}>
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title">ChatWalrus Course Catalog</h1>
          <p className="page-subtitle">
            All ChatWalrus courses from Thinkific - {company.name} enrollment status
          </p>
        </div>
      </div>

      {/* Filters */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <a
          href={`/company/${params.slug}/courses?filter=all&sort_by=${sortBy}&sort_dir=${sortDir}`}
          className={filter === 'all' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
        >
          All Courses ({courses.length})
        </a>
        <a
          href={`/company/${params.slug}/courses?filter=enrolled&sort_by=${sortBy}&sort_dir=${sortDir}`}
          className={filter === 'enrolled' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
        >
          Enrolled Only ({courses.filter(c => c.company_enrollment > 0).length})
        </a>
      </div>

      {/* Courses Table */}
      {sorted.length === 0 ? (
        <div className="empty-state card">
          <p>No courses found.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ fontWeight: 700, cursor: 'pointer', background: sortBy === 'name' ? 'var(--surface)' : undefined }}>
                    <SortLink field="name" label="Course Name" {...sortLinkProps} />
                  </th>
                  <th style={{ fontWeight: 700 }}>Lessons</th>
                  <th style={{ fontWeight: 700, cursor: 'pointer', background: sortBy === 'enrollment' ? 'var(--surface)' : undefined }}>
                    <SortLink field="enrollment" label="Enrolled" {...sortLinkProps} />
                  </th>
                  <th style={{ fontWeight: 700, cursor: 'pointer', background: sortBy === 'progress' ? 'var(--surface)' : undefined }}>
                    <SortLink field="progress" label="Avg Progress" {...sortLinkProps} />
                  </th>
                  <th style={{ fontWeight: 700, cursor: 'pointer', background: sortBy === 'completed' ? 'var(--surface)' : undefined }}>
                    <SortLink field="completed" label="Completed" {...sortLinkProps} />
                  </th>
                  <th style={{ fontWeight: 700 }}>Roles</th>
                  <th style={{ fontWeight: 700, cursor: 'pointer', background: sortBy === 'all_companies' ? 'var(--surface)' : undefined }}>
                    <SortLink field="all_companies" label="All Companies" {...sortLinkProps} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(course => {
                  const roleEntries = Object.entries(course.role_breakdown)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3);
                  return (
                  <tr key={course.id}>
                    <td style={{ fontWeight: 500 }}>{course.name}</td>
                    <td>{course.total_lessons}</td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          background: course.company_enrollment > 0 ? 'var(--primary-glow)' : 'var(--surface)',
                          color: course.company_enrollment > 0 ? 'var(--primary)' : 'var(--text-muted)',
                        }}
                      >
                        {course.company_enrollment}
                      </span>
                    </td>
                    <td>
                      {course.company_enrollment > 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ flex: 1, height: '6px', background: 'var(--surface)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${course.company_avg_progress}%`, height: '100%', background: 'var(--primary)' }} />
                          </div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: '35px' }}>
                            {course.company_avg_progress}%
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td>
                      {course.company_enrollment > 0 ? (
                        <span>
                          {course.company_completions}
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}> / {course.company_enrollment}</span>
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td>
                      {roleEntries.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                          {roleEntries.map(([role, count]) => (
                            <span key={role} style={{
                              display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                              padding: '0.125rem 0.375rem',
                              borderRadius: '9999px',
                              background: 'var(--surface-raised)',
                              border: '1px solid var(--border-muted)',
                              fontSize: '0.6875rem',
                              fontWeight: 500,
                              color: 'var(--text-secondary)',
                              whiteSpace: 'nowrap',
                            }}>
                              {role}
                              <span style={{ fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{count}</span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                      {course.total_enrollments_all_companies.toLocaleString()}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </CompanyShell>
  );
}
