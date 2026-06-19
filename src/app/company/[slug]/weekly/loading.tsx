import PageShell from '@/components/layout/PageShell';

export default function Loading() {
  return (
    <PageShell>
      <div className="page-header" style={{ marginTop: '0.75rem' }}>
        <div>
          <h1 className="page-title">Weekly Summary</h1>
          <p className="page-subtitle">Loading current report...</p>
        </div>
      </div>
      <div className="card">
        <div className="empty-state">
          <span className="spinner" />
          <p>Loading weekly report...</p>
        </div>
      </div>
    </PageShell>
  );
}
