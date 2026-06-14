import CompanyCard from './CompanyCard';

interface CompanyItem {
  id: string;
  name: string;
  slug: string;
  start_date: string | null;
  learner_count?: number;
  avg_progress?: number;
  at_risk_count?: number;
}

export default function CompanyGrid({ companies }: { companies: CompanyItem[] }) {
  if (companies.length === 0) {
    return (
      <div className="empty-state card">
        <h3>No Companies Found</h3>
        <p>Sync data from Thinkific or add companies in admin settings.</p>
      </div>
    );
  }

  return (
    <div className="company-grid">
      {companies.map((c) => (
        <CompanyCard
          key={c.id}
          name={c.name}
          slug={c.slug}
          learnerCount={c.learner_count ?? 0}
          startDate={c.start_date}
          avgProgress={c.avg_progress}
          atRiskCount={c.at_risk_count}
        />
      ))}
    </div>
  );
}
