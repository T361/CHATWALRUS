export default function SurveysLoading() {
  return (
    <div>
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div style={{ height: '2rem', width: '150px', background: 'var(--surface)', borderRadius: 'var(--radius-sm)', animation: 'pulse 1.5s ease-in-out infinite' }} />
      </div>

      <div style={{ display: 'flex', gap: '1.5rem' }}>
        {/* Sidebar Skeleton */}
        <div style={{ width: '200px', flexShrink: 0 }}>
          <div className="card" style={{ padding: '1rem' }}>
            <div style={{ height: '1rem', width: '100%', background: 'var(--surface)', borderRadius: 'var(--radius-sm)', marginBottom: '0.75rem', animation: 'pulse 1.5s ease-in-out infinite' }} />
            <div style={{ height: '2rem', width: '100%', background: 'var(--surface)', borderRadius: 'var(--radius-sm)', animation: 'pulse 1.5s ease-in-out infinite' }} />
          </div>
        </div>

        {/* Main Content Skeleton */}
        <div style={{ flex: 1 }}>
          {/* KPI Cards */}
          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '1.5rem' }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="card" style={{ padding: '1rem' }}>
                <div style={{ height: '2rem', width: '100%', background: 'var(--surface)', borderRadius: 'var(--radius-sm)', animation: 'pulse 1.5s ease-in-out infinite' }} />
              </div>
            ))}
          </div>

          {/* Chart Skeleton */}
          <div className="card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
            <div style={{ height: '250px', width: '100%', background: 'var(--surface)', borderRadius: 'var(--radius-sm)', animation: 'pulse 1.5s ease-in-out infinite' }} />
          </div>

          {/* List Skeleton */}
          <div className="card" style={{ padding: '1rem' }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} style={{ height: '3rem', background: 'var(--surface)', borderRadius: 'var(--radius-sm)', marginBottom: '0.75rem', animation: 'pulse 1.5s ease-in-out infinite' }} />
            ))}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
