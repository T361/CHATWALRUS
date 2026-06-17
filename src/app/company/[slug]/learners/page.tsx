import CompanyShell from '@/components/layout/CompanyShell';
import LearnerDirectory from '@/components/learners/LearnerDirectory';
import Link from 'next/link';
import { Suspense } from 'react';

export default async function LearnersPage(
  props: { params: Promise<{ slug: string }> },
) {
  const { slug } = await props.params;
  return (
    <CompanyShell slug={slug}>
      <Suspense fallback={<div className="card"><div className="empty-state"><span className="spinner" /><p>Loading learners...</p></div></div>}>
        <LearnerDirectory
          endpoint={`/api/companies/${slug}/learners`}
          scope="company"
          companySlug={slug}
          headerAction={(
            <Link href={`/api/companies/${slug}/export/csv`} className="btn btn-secondary btn-sm">
              ↓ Export CSV
            </Link>
          )}
        />
      </Suspense>
    </CompanyShell>
  );
}
