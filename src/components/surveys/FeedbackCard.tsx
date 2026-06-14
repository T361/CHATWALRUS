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
  const r = rating ?? 0;
  return (
    <div className="card card-sm" style={{ borderLeft: '3px solid var(--border-accent)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.375rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{learnerName || 'Anonymous'}</span>
          {companyName && <span className="badge badge-not-started">{companyName}</span>}
        </div>
        <div style={{ display: 'flex', gap: '2px' }}>
          {[1, 2, 3, 4, 5].map((star) => (
            <svg key={star} width="13" height="13" viewBox="0 0 24 24" fill={star <= r ? 'var(--warning)' : 'var(--border)'}>
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          ))}
        </div>
      </div>
      {courseName && (
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.375rem' }}>{courseName}</p>
      )}
      {feedbackText && (
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{feedbackText}</p>
      )}
      <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
        {proficiencyLevel && <span>Level: {proficiencyLevel}</span>}
        {submittedAt && <span>{new Date(submittedAt).toLocaleDateString()}</span>}
      </div>
    </div>
  );
}
