export default function Loading() {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-title">Learners</h1>
        <p className="page-subtitle">Loading learner directory...</p>
      </div>
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div className="empty-state">
          <span className="spinner" />
          <p>Loading learners...</p>
        </div>
      </div>
    </div>
  );
}
