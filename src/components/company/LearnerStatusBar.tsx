interface StatusSegment {
  label: string;
  count: number;
  color: string;
}

interface LearnerStatusBarProps {
  highEngagement: number;
  onTrack: number;
  slightlyBehind: number;
  atRisk: number;
  notStarted: number;
}

export default function LearnerStatusBar({
  highEngagement, onTrack, slightlyBehind, atRisk, notStarted,
}: LearnerStatusBarProps) {
  const total = highEngagement + onTrack + slightlyBehind + atRisk + notStarted;
  if (total === 0) return null;

  const segments: StatusSegment[] = [
    { label: 'High Engagement', count: highEngagement, color: 'var(--high-engagement)' },
    { label: 'On Track',        count: onTrack,        color: 'var(--on-track)' },
    { label: 'Slightly Behind', count: slightlyBehind, color: 'var(--slightly-behind)' },
    { label: 'At Risk',         count: atRisk,         color: 'var(--at-risk)' },
    { label: 'Not Started',     count: notStarted,     color: 'var(--not-started)' },
  ].filter((s) => s.count > 0);

  return (
    <div className="card" style={{ marginBottom: '1.25rem' }}>
      <p className="section-title" style={{ marginBottom: '0.875rem' }}>Learner Progress Status</p>

      {/* Stacked bar */}
      <div style={{ height: 12, borderRadius: 9999, overflow: 'hidden', display: 'flex', marginBottom: '0.875rem' }}>
        {segments.map((s) => (
          <div
            key={s.label}
            title={`${s.label}: ${s.count}`}
            style={{
              width: `${(s.count / total) * 100}%`,
              background: s.color,
              transition: 'width 0.3s ease',
            }}
          />
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
        {segments.map((s) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: s.color, flexShrink: 0,
              boxShadow: `0 0 5px ${s.color}`,
            }} />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {s.label}
            </span>
            <span className="tabular" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text)' }}>
              {s.count}
            </span>
            <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
              ({Math.round((s.count / total) * 100)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
