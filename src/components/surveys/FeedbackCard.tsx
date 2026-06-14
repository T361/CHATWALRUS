interface FeedbackCardProps {
  learnerName: string | null;
  companyName: string | null;
  courseName: string | null;
  rating: number | null;
  feedbackText: string | null;
  proficiencyLevel: string | null;
  submittedAt: string | null;
  scale?: number;
}

function RatingPill({ rating, scale }: { rating: number; scale: number }) {
  const pct = rating / scale;
  const color = pct >= 0.8 ? 'var(--on-track)' : pct >= 0.6 ? 'var(--warning)' : 'var(--at-risk)';
  return (
    <span className="tabular" style={{
      fontSize: '0.8125rem', fontWeight: 700, color,
      background: `color-mix(in srgb, ${color} 12%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      borderRadius: 6, padding: '0.1rem 0.4rem',
    }}>
      {rating}/{scale}
    </span>
  );
}

export default function FeedbackCard({
  learnerName, companyName, courseName, rating, feedbackText, proficiencyLevel, submittedAt, scale = 10,
}: FeedbackCardProps) {
  return (
    <div className="card card-sm" style={{ borderLeft: '3px solid var(--border-accent)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.375rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{learnerName || 'Anonymous'}</span>
          {companyName && <span className="badge badge-not-started">{companyName}</span>}
          {proficiencyLevel && (
            <span className="badge" style={{ background: 'var(--primary-glow)', color: 'var(--primary)', border: '1px solid var(--border-accent)', textTransform: 'capitalize' }}>
              {proficiencyLevel}
            </span>
          )}
        </div>
        {rating !== null && <RatingPill rating={rating} scale={scale} />}
      </div>
      {courseName && (
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.375rem' }}>{courseName}</p>
      )}
      {feedbackText && (
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{feedbackText}</p>
      )}
      {submittedAt && (
        <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
          {new Date(submittedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
        </p>
      )}
    </div>
  );
}
