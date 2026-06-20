import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';

type CourseRow = {
  id: string;
  name: string;
  total_lessons: number;
  company_enrollment: number;
  company_avg_progress: number;
  company_completions: number;
  total_enrollments_all_companies: number;
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

  // Get enrollments for this company
  const { data: companyEnrollments, error: companyError } = await db
    .from('enrollments')
    .select('course_id, progress_percent, completed_at')
    .eq('company_id', companyId)
    .eq('is_active', true);

  if (companyError) throw companyError;

  // Get total enrollments across all companies for context
  const { data: allEnrollments, error: allError } = await db
    .from('enrollments')
    .select('course_id')
    .eq('is_active', true);

  if (allError) throw allError;

  // Aggregate company enrollment stats
  const companyStats = new Map<string, { count: number; progress: number; completions: number }>();
  for (const enroll of (companyEnrollments || []) as Array<{
    course_id: string;
    progress_percent: number;
    completed_at: string | null;
  }>) {
    const stats = companyStats.get(enroll.course_id) || { count: 0, progress: 0, completions: 0 };
    stats.count++;
    stats.progress += Number(enroll.progress_percent || 0);
    if (enroll.completed_at) stats.completions++;
    companyStats.set(enroll.course_id, stats);
  }

  // Count total enrollments per course
  const totalEnrollments = new Map<string, number>();
  for (const enroll of (allEnrollments || []) as Array<{ course_id: string }>) {
    totalEnrollments.set(enroll.course_id, (totalEnrollments.get(enroll.course_id) || 0) + 1);
  }

  // Build course rows
  return allCourses.map(course => {
    const stats = companyStats.get(course.id);
    return {
      id: course.id,
      name: course.name,
      total_lessons: course.total_lessons || 0,
      company_enrollment: stats?.count || 0,
      company_avg_progress: stats ? Math.round(stats.progress / stats.count) : 0,
      company_completions: stats?.completions || 0,
      total_enrollments_all_companies: totalEnrollments.get(course.id) || 0,
    };
  });
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
      default:
        return 0;
    }

    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
  });

  return (
    <div style={{ padding: '2rem' }}>
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title">ChatWalrus Course Catalog</h1>
          <p className="page-subtitle">
            {company.name} enrollment status across all ChatWalrus courses from Thinkific
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

      {/* Sort Controls */}
      <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', fontSize: '0.875rem' }}>
        <span style={{ color: 'var(--text-muted)' }}>Sort by:</span>
        {[
          { key: 'name', label: 'Name' },
          { key: 'enrollment', label: 'Your Enrollment' },
          { key: 'progress', label: 'Your Progress' },
          { key: 'completed', label: 'Completions' },
        ].map(({ key, label }) => {
          const isActive = sortBy === key;
          const nextDir = isActive && sortDir === 'asc' ? 'desc' : 'asc';
          return (
            <a
              key={key}
              href={`/company/${params.slug}/courses?filter=${filter}&sort_by=${key}&sort_dir=${nextDir}`}
              style={{
                padding: '0.25rem 0.5rem',
                borderRadius: '4px',
                background: isActive ? 'var(--primary-glow)' : 'transparent',
                color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                textDecoration: 'none',
                fontWeight: isActive ? 600 : 400,
              }}
            >
              {label} {isActive && (sortDir === 'asc' ? '↑' : '↓')}
            </a>
          );
        })}
      </div>

      {/* Courses Table */}
      {sorted.length === 0 ? (
        <div className="empty-state card">
          <p>No courses found.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Course Name</th>
                <th>Lessons</th>
                <th>Your Enrollment</th>
                <th>Your Avg Progress</th>
                <th>Your Completions</th>
                <th>Total Enrolled (All Companies)</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(course => (
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
                        <div
                          style={{
                            flex: 1,
                            height: '6px',
                            background: 'var(--surface)',
                            borderRadius: '3px',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${course.company_avg_progress}%`,
                              height: '100%',
                              background: 'var(--primary)',
                            }}
                          />
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
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                          {' '}
                          / {course.company_enrollment}
                        </span>
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>—</span>
                    )}
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                    {course.total_enrollments_all_companies.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
