import Link from 'next/link';

interface CompanyCardProps {
  name: string;
  slug: string;
  learnerCount: number;
  startDate: string | null;
  avgProgress?: number;
  atRiskCount?: number;
}

export default function CompanyCard({
  name, slug, learnerCount, startDate, avgProgress, atRiskCount,
}: CompanyCardProps) {
  const progress = avgProgress ?? 0;

  return (
    <Link href={`/company/${slug}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
      <div className="card card-hover company-card">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <h3 className="company-card-name">{name}</h3>
          {atRiskCount !== undefined && atRiskCount > 0 && (
            <span className="badge badge-at-risk">{atRiskCount} at risk</span>
          )}
        </div>

        <div style={{ marginBottom: '0.875rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.375rem' }}>
            <span className="company-card-meta">{learnerCount} learners</span>
            {avgProgress !== undefined && (
              <span className="company-card-progress-label tabular">{progress.toFixed(0)}%</span>
            )}
          </div>
          {avgProgress !== undefined && (
            <div className="progress-track">
              <div
                className={`progress-fill${progress >= 70 ? ' progress-fill-success' : progress >= 40 ? '' : ' progress-fill-danger'}`}
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
          )}
        </div>

        {startDate && (
          <div className="company-card-meta">Started {startDate}</div>
        )}
      </div>
    </Link>
  );
}
