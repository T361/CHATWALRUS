interface CoursePerformanceItem {
  course_id: string;
  course_name: string;
  average_rating: number;
  response_count: number;
}

export default function CoursePerformanceList({ data }: { data: CoursePerformanceItem[] }) {
  if (data.length === 0) {
    return (
      <div className="card">
        <p className="section-title">Course Performance</p>
        <div className="empty-state" style={{ padding: '1rem' }}><p>No course performance data.</p></div>
      </div>
    );
  }

  return (
    <div className="card">
      <p className="section-title">Course Performance</p>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {data.map((item, i) => (
          <div
            key={item.course_id}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '0.625rem 0',
              borderBottom: i < data.length - 1 ? '1px solid var(--border-muted)' : 'none',
            }}
          >
            <div>
              <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{item.course_name}</span>
              <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                {item.response_count} responses
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <span className="tabular" style={{ fontWeight: 600, color: 'var(--warning)' }}>{item.average_rating.toFixed(1)}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="var(--warning)">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
