'use client';

interface SurveyFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  companyFilter?: string;
  onCompanyFilterChange?: (value: string) => void;
  companies?: Array<{ id: string; name: string }>;
  proficiencyFilter?: string;
  onProficiencyFilterChange?: (value: string) => void;
}

export default function SurveyFilters({
  search, onSearchChange,
  companyFilter, onCompanyFilterChange, companies,
  proficiencyFilter, onProficiencyFilterChange,
}: SurveyFiltersProps) {
  return (
    <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
      <input
        type="text"
        placeholder="Search feedback..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        style={{ flex: 1, minWidth: '200px' }}
      />
      {companies && companies.length > 0 && onCompanyFilterChange && (
        <select value={companyFilter || 'all'} onChange={(e) => onCompanyFilterChange(e.target.value)}>
          <option value="all">All Companies</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      )}
      {onProficiencyFilterChange && (
        <select value={proficiencyFilter || 'all'} onChange={(e) => onProficiencyFilterChange(e.target.value)}>
          <option value="all">All Levels</option>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>
      )}
    </div>
  );
}
