interface FeedbackCardProps {
  learnerName: string | null;
  companyName: string | null;
  courseName: string | null;
  rating: number | null;
  feedbackText: string | null;
  proficiencyLevel: string | null;
  submittedAt: string | null;
}

export default function FeedbackCard({
  learnerName, companyName, courseName, rating, feedbackText, proficiencyLevel, submittedAt,
}: FeedbackCardProps) {
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
        <div>
          <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{learnerName || 'Anonymous'}</span>
          {companyName && (
            <span style={{ color: '#6b7280', fontSize: '0.75rem', marginLeft: '0.5rem' }}>{companyName}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.125rem' }}>
          {[1, 2, 3, 4, 5].map((star) => (
            <span key={star} style={{ color: star <= (rating ?? 0) ? '#f59e0b' : '#e5e7eb', fontSize: '0.875rem' }}>★</span>
          ))}
        </div>
      </div>
      {courseName && (
        <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Course: {courseName}</p>
      )}
      {feedbackText && (
        <p style={{ fontSize: '0.8125rem', color: '#374151' }}>{feedbackText}</p>
      )}
      <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.75rem', color: '#9ca3af' }}>
        {proficiencyLevel && <span>Level: {proficiencyLevel}</span>}
        {submittedAt && <span>{new Date(submittedAt).toLocaleDateString()}</span>}
      </div>
    </div>
  );
}
