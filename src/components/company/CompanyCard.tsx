import Link from 'next/link';

interface CompanyCardProps {
  name: string;
  slug: string;
  learnerCount: number;
  startDate: string | null;
  avgProgress?: number | null;
  atRiskCount?: number;
}

export default function CompanyCard({ name, slug, learnerCount, startDate, avgProgress, atRiskCount }: CompanyCardProps) {
  const progress = avgProgress ?? 0;
  const progressColor = progress >= 70 ? 'var(--primary)' : progress >= 40 ? 'var(--primary)' : 'var(--text-muted)';

  return (
    <Link href={`/company/${slug}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
      <div className="card card-hover company-card" style={{ padding: '1.125rem 1.25rem', height: '100%' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.875rem' }}>
          <h3 className="company-card-name" style={{ lineHeight: 1.25 }}>{name}</h3>
        </div>

        {/* Progress */}
        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.375rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {learnerCount} learner{learnerCount !== 1 ? 's' : ''}
            </span>
            {avgProgress !== undefined && (
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: progressColor, fontVariantNumeric: 'tabular-nums' }}>
                {progress.toFixed(0)}%
              </span>
            )}
          </div>
          <div style={{ height: 3, background: 'var(--border)', borderRadius: 9999, overflow: 'hidden' }}>
            {avgProgress !== undefined && (
              <div style={{
                height: '100%', borderRadius: 9999,
                width: `${Math.min(progress, 100)}%`,
                background: progressColor,
                transition: 'width 0.4s cubic-bezier(0.16,1,0.3,1)',
              }} />
            )}
          </div>
        </div>

        {/* Footer */}
        {startDate && (
          <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: 'auto' }}>
            Started {startDate}
          </p>
        )}
      </div>
    </Link>
  );
}
