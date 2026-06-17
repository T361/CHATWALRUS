import PageShell from '@/components/layout/PageShell';
import LearnerDirectory from '@/components/learners/LearnerDirectory';
import { Suspense } from 'react';

export default function GlobalLearnersPage() {
  return (
    <PageShell>
      <Suspense fallback={<div className="card"><div className="empty-state"><span className="spinner" /><p>Loading learners...</p></div></div>}>
        <LearnerDirectory endpoint="/api/learners" scope="global" />
      </Suspense>
    </PageShell>
  );
}
