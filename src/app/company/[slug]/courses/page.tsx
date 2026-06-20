import CompanyShell from '@/components/layout/CompanyShell';
import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import Link from 'next/link';

type CourseRow = {
  id: string;
  name: string;
  total_lessons: number;
  enrollment_count: number;
  avg_progress: number;
  completion_count: number;
  role_distribution: Record<string, number>;
};

async function getCourseData(companyId: string) {
  const db = createAdminClient();

  // Get all courses with enrollments for this company
  const { data: enrollments, error } = await db
    .from('enrollments')
    .select('course_id, learner_id, progress_percent, completed_at, courses(id, name, total_lessons), learners(title)')
    .eq('company_id', companyId)
    .eq('is_active', true);

  if (error) throw error;

  // Aggregate by course
  const courseMap = new Map<string, CourseRow>();

  for (const enroll of (enrollments || []) as Array<{
    course_id: string;
    learner_id: string;
    progress_percent: number;
    completed_at: string | null;
    courses: { id: string; name: string; total_lessons: number }[] | null;
    learners: { title: string | null }[] | null;
  }>) {
    const courseData = enroll.courses?.[0];
    if (!courseData) continue;

    if (!courseMap.has(enroll.course_id)) {
      courseMap.set(enroll.course_id, {
        id: courseData.id,
        name: courseData.name,
        total_lessons: courseData.total_lessons,
        enrollment_count: 0,
        avg_progress: 0,
        completion_count: 0,
        role_distribution: {},
      });
    }

    const course = courseMap.get(enroll.course_id)!;
    course.enrollment_count++;
    course.avg_progress += Number(enroll.progress_percent || 0);
    if (enroll.completed_at) course.completion_count++;

    const role = enroll.learners?.[0]?.title || 'Unassigned';
    course.role_distribution[role] = (course.role_distribution[role] || 0) + 1;
  }

  // Calculate averages
  const courses = Array.from(courseMap.values()).map(course => ({
    ...course,
    avg_progress: course.enrollment_count > 0 ? course.avg_progress / course.enrollment_count : 0,
  }));

  return courses;
}

export default async function CoursesPage(props: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ role?: string; sort_by?: string; sort_dir?: string }>;
}) {
  const { slug } = await props.params;
  const { role: roleFilter = 'all', sort_by = 'name', sort_dir = 'asc' } = await props.searchParams;

  const db = createAdminClient();
  if (!db) {
    return (
      <CompanyShell slug={slug}>
        <div className="card" style={{ background: 'var(--warning-bg)', borderColor: 'rgba(245,158,11,0.25)' }}>
          <p style={{ color: 'var(--warning)' }}>Database not connected.</p>
        </div>
      </CompanyShell>
    );
  }

  const { data: company } = await db
    .from('companies')
    .select('id, name')
    .eq('slug', slug)
    .single();

  if (!company) notFound();

  let courses = await getCourseData(company.id);

  // Filter by role
  if (roleFilter && roleFilter !== 'all') {
    courses = courses.filter(course => course.role_distribution[roleFilter] > 0);
  }

  // Sort
  const sortDir = sort_dir === 'desc' ? -1 : 1;
  courses.sort((a, b) => {
    let comparison = 0;
    if (sort_by === 'enrollment_count') {
      comparison = a.enrollment_count - b.enrollment_count;
    } else if (sort_by === 'avg_progress') {
      comparison = a.avg_progress - b.avg_progress;
    } else if (sort_by === 'completion_count') {
      comparison = a.completion_count - b.completion_count;
    } else {
      // Default: sort by name
      comparison = a.name.localeCompare(b.name);
    }
    return comparison * sortDir;
  });

  // Get unique roles
  const allRoles = new Set<string>();
  courses.forEach(course => {
    Object.keys(course.role_distribution).forEach(role => allRoles.add(role));
  });
  const roleOptions = Array.from(allRoles).sort();

  return (
    <CompanyShell slug={slug} companyName={company.name}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Courses</h1>
          <p className="page-subtitle">
            {company.name} course catalog with enrollment and role distribution
          </p>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.625rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <Link
          href={`/company/${slug}/courses?role=all${sort_by !== 'name' ? `&sort_by=${sort_by}` : ''}${sort_dir !== 'asc' ? `&sort_dir=${sort_dir}` : ''}`}
          className={roleFilter === 'all' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
        >
          All Roles ({courses.length})
        </Link>
        {roleOptions.map(role => {
          const count = courses.filter(c => c.role_distribution[role] > 0).length;
          return (
            <Link
              key={role}
              href={`/company/${slug}/courses?role=${encodeURIComponent(role)}${sort_by !== 'name' ? `&sort_by=${sort_by}` : ''}${sort_dir !== 'asc' ? `&sort_dir=${sort_dir}` : ''}`}
              className={roleFilter === role ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            >
              {role} ({count})
            </Link>
          );
        })}
      </div>

      {/* Sort Controls */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Sort by:</span>
        <Link
          href={`/company/${slug}/courses?${roleFilter !== 'all' ? `role=${roleFilter}&` : ''}sort_by=name&sort_dir=${sort_by === 'name' && sort_dir === 'asc' ? 'desc' : 'asc'}`}
          className="btn btn-secondary btn-sm"
        >
          Name {sort_by === 'name' && (sort_dir === 'asc' ? '↑' : '↓')}
        </Link>
        <Link
          href={`/company/${slug}/courses?${roleFilter !== 'all' ? `role=${roleFilter}&` : ''}sort_by=enrollment_count&sort_dir=${sort_by === 'enrollment_count' && sort_dir === 'asc' ? 'desc' : 'asc'}`}
          className="btn btn-secondary btn-sm"
        >
          Enrolled {sort_by === 'enrollment_count' && (sort_dir === 'asc' ? '↑' : '↓')}
        </Link>
        <Link
          href={`/company/${slug}/courses?${roleFilter !== 'all' ? `role=${roleFilter}&` : ''}sort_by=avg_progress&sort_dir=${sort_by === 'avg_progress' && sort_dir === 'asc' ? 'desc' : 'asc'}`}
          className="btn btn-secondary btn-sm"
        >
          Progress {sort_by === 'avg_progress' && (sort_dir === 'asc' ? '↑' : '↓')}
        </Link>
        <Link
          href={`/company/${slug}/courses?${roleFilter !== 'all' ? `role=${roleFilter}&` : ''}sort_by=completion_count&sort_dir=${sort_by === 'completion_count' && sort_dir === 'asc' ? 'desc' : 'asc'}`}
          className="btn btn-secondary btn-sm"
        >
          Completed {sort_by === 'completion_count' && (sort_dir === 'asc' ? '↑' : '↓')}
        </Link>
      </div>

      {/* Courses Grid */}
      {courses.length === 0 ? (
        <div className="empty-state card">
          <h3>No Courses Found</h3>
          <p>No courses match the selected filters.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {courses.map(course => {
            const completionRate = course.enrollment_count > 0
              ? Math.round((course.completion_count / course.enrollment_count) * 100)
              : 0;

            return (
              <div key={course.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                      {course.name}
                    </h3>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {course.total_lessons} lessons
                    </p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                      ENROLLED
                    </p>
                    <p style={{ fontSize: '1.5rem', fontWeight: 600 }}>
                      {course.enrollment_count}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                      AVG PROGRESS
                    </p>
                    <p style={{ fontSize: '1.5rem', fontWeight: 600 }}>
                      {course.avg_progress.toFixed(0)}%
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                      COMPLETED
                    </p>
                    <p style={{ fontSize: '1.5rem', fontWeight: 600 }}>
                      {course.completion_count} <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>({completionRate}%)</span>
                    </p>
                  </div>
                </div>

                {/* Role Distribution */}
                <div>
                  <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                    ROLE DISTRIBUTION
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {Object.entries(course.role_distribution)
                      .sort(([, a], [, b]) => b - a)
                      .map(([role, count]) => (
                        <span
                          key={role}
                          className="badge"
                          style={{
                            background: 'var(--surface-raised)',
                            color: 'var(--text)',
                            padding: '0.25rem 0.5rem',
                          }}
                        >
                          {role}: {count}
                        </span>
                      ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </CompanyShell>
  );
}
