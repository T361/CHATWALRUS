import PageShell from '@/components/layout/PageShell';
import LearnerDirectory from '@/components/learners/LearnerDirectory';
import { Suspense } from 'react';
import { getLearnerDirectory, getLearnerDirectoryMeta } from '@/lib/learners/directory';

export const dynamic = 'force-dynamic';

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function GlobalLearnersPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;

  const filters = {
    q: firstValue(searchParams.q) || '',
    courseId: firstValue(searchParams.course_id) || '',
    status: firstValue(searchParams.status) || 'all',
    role: firstValue(searchParams.role) || 'all',
    sortBy: firstValue(searchParams.sort_by) || 'full_name',
    sortDir: (firstValue(searchParams.sort_dir) === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc',
    page: Number(firstValue(searchParams.page) || '1'),
    limit: Number(firstValue(searchParams.limit) || '25'),
  };

  const [initialData, initialMeta] = await Promise.all([
    getLearnerDirectory(filters),
    getLearnerDirectoryMeta(),
  ]);

  return (
    <PageShell>
      <Suspense fallback={
        <div className="card">
          <div className="empty-state"><span className="spinner" /><p>Loading learners...</p></div>
        </div>
      }>
        <LearnerDirectory
          endpoint="/api/learners"
          metadataEndpoint="/api/learners/meta"
          scope="global"
          initialData={initialData}
          initialMeta={initialMeta}
          headerAction={(
            <a href="/api/admin/learners/export/csv" className="btn btn-secondary btn-sm">
              ↓ Export CSV
            </a>
          )}
        />
      </Suspense>
    </PageShell>
  );
}
