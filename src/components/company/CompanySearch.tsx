'use client';

import { useState, useMemo } from 'react';
import CompanyCard from './CompanyCard';

interface Company {
  id: string;
  name: string;
  slug: string;
  start_date: string | null;
  is_active: boolean;
  learner_count?: number;
  avg_progress?: number | null;
  at_risk_count?: number;
}

type FilterState = 'all' | 'active' | 'inactive';

export default function CompanySearch({ companies }: { companies: Company[] }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterState>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return companies.filter((c) => {
      if (filter === 'active' && !c.is_active) return false;
      if (filter === 'inactive' && c.is_active) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || c.slug.includes(q);
    });
  }, [companies, query, filter]);

  const activeCount   = companies.filter((c) => c.is_active).length;
  const inactiveCount = companies.filter((c) => !c.is_active).length;

  return (
    <>
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 260px', minWidth: 0 }}>
          <svg
            style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            placeholder="Search companies…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: '100%', paddingLeft: '2.25rem', paddingRight: '0.75rem',
              height: '2.25rem', background: 'var(--surface-raised)', border: '1px solid var(--border)',
              borderRadius: '0.5rem', fontSize: '0.875rem', color: 'var(--text-primary)',
              outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.375rem', background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '0.25rem' }}>
          {(['all', 'active', 'inactive'] as FilterState[]).map((f) => {
            const label = f === 'all' ? `All (${companies.length})` : f === 'active' ? `Active (${activeCount})` : `Inactive (${inactiveCount})`;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: '0.25rem 0.625rem', borderRadius: '0.375rem', border: 'none',
                  fontSize: '0.75rem', fontWeight: filter === f ? 600 : 400, cursor: 'pointer',
                  background: filter === f ? 'var(--primary)' : 'transparent',
                  color: filter === f ? '#fff' : 'var(--text-secondary)',
                  transition: 'all 0.15s',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {query && (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          No companies match &ldquo;{query}&rdquo;
        </div>
      ) : (
        <div className="company-grid">
          {filtered.map((company) => (
            <CompanyCard
              key={company.id}
              name={company.name}
              slug={company.slug}
              learnerCount={company.learner_count ?? 0}
              startDate={company.start_date}
              avgProgress={company.avg_progress}
              atRiskCount={company.at_risk_count}
            />
          ))}
        </div>
      )}
    </>
  );
}
