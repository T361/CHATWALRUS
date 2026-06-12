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
        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>Course Performance</h3>
        <div className="empty-state" style={{ padding: '1rem' }}><p>No course performance data.</p></div>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem' }}>Course Performance</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {data.map((item) => (
          <div
            key={item.course_id}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '0.5rem 0', borderBottom: '1px solid #f3f4f6',
            }}
          >
            <div>
              <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{item.course_name}</span>
              <span style={{ fontSize: '0.75rem', color: '#9ca3af', marginLeft: '0.5rem' }}>
                ({item.response_count} responses)
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <span style={{ fontWeight: 600, color: '#f59e0b' }}>{item.average_rating.toFixed(1)}</span>
              <span style={{ color: '#f59e0b' }}>★</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
