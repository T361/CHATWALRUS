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
  return (
    <Link href={`/company/${slug}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="card" style={{ cursor: 'pointer', transition: 'box-shadow 0.15s ease' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>{name}</h3>
        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8125rem', color: '#6b7280', flexWrap: 'wrap' }}>
          <span>{learnerCount} learners</span>
          {startDate && <span>Started {startDate}</span>}
          {avgProgress !== undefined && (
            <span>Avg: {avgProgress.toFixed(0)}%</span>
          )}
          {atRiskCount !== undefined && atRiskCount > 0 && (
            <span className="badge badge-at-risk">{atRiskCount} at risk</span>
          )}
        </div>
      </div>
    </Link>
  );
}
