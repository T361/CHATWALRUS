import PageShell from '@/components/layout/PageShell';

export default function Loading() {
  return (
    <PageShell>
      <div className="page-header">
        <div>
          <h1 className="page-title">Learners</h1>
          <p className="page-subtitle">Loading learner directory...</p>
        </div>
      </div>
      <div className="card">
        <div className="empty-state">
          <span className="spinner" />
          <p>Loading learners...</p>
        </div>
      </div>
    </PageShell>
  );
}
