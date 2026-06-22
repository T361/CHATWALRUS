import CompanyShell from '@/components/layout/CompanyShell';
import LearnerDirectory from '@/components/learners/LearnerDirectory';
import { Suspense } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLearnerDirectory, getLearnerDirectoryMeta } from '@/lib/learners/directory';

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LearnersPage(
  props: {
    params: Promise<{ slug: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
  },
) {
  const { slug } = await props.params;
  const searchParams = await props.searchParams;
  const db = createAdminClient();
  const { data: company } = await db
    .from('companies')
    .select('id, name')
    .eq('slug', slug)
    .single();

  if (!company) {
    return (
      <CompanyShell slug={slug}>
        <div className="empty-state card"><h3>Company not found</h3></div>
      </CompanyShell>
    );
  }

  const filters = {
    companyId: company.id,
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
    getLearnerDirectoryMeta(company.id),
  ]);

  return (
    <CompanyShell slug={slug} companyName={company.name}>
      <Suspense fallback={<div className="card"><div className="empty-state"><span className="spinner" /><p>Loading learners...</p></div></div>}>
        <LearnerDirectory
          endpoint={`/api/companies/${slug}/learners`}
          metadataEndpoint={`/api/companies/${slug}/learners/meta`}
          scope="company"
          companySlug={slug}
          initialData={initialData}
          initialMeta={initialMeta}
          headerAction={(
            <a href={`/api/companies/${slug}/export/csv`} className="btn btn-secondary btn-sm">
              ↓ Export CSV
            </a>
          )}
        />
      </Suspense>
    </CompanyShell>
  );
}
