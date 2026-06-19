import PageShell from '@/components/layout/PageShell';
import LearnerDirectory from '@/components/learners/LearnerDirectory';
import { Suspense } from 'react';

function LearnersFallback() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">All Learners</h1>
          <p className="page-subtitle">Search and filter learners across every company</p>
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Loading...</div>
      </div>
      <div className="card">
        <div className="empty-state">
          <span className="spinner" />
          <p>Loading learner directory...</p>
        </div>
      </div>
    </>
  );
}

export default function GlobalLearnersPage() {
  return (
    <PageShell>
      <Suspense fallback={<LearnersFallback />}>
        <LearnerDirectory
          endpoint="/api/learners"
          metadataEndpoint="/api/learners/meta"
          scope="global"
        />
      </Suspense>
    </PageShell>
  );
}
