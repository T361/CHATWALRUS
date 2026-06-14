'use client';

import PageShell from '@/components/layout/PageShell';
import { useEffect, useState } from 'react';

interface SurveyItem {
  id: string;
  rating: number | null;
  feedback_text: string | null;
  proficiency_level: string | null;
  submitted_at: string | null;
  company_name: string | null;
  learner_name: string | null;
  course_name: string | null;
}

function StarRating({ rating }: { rating: number | null }) {
  const r = rating ?? 0;
  return (
    <div style={{ display: 'flex', gap: '2px' }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <svg key={star} width="14" height="14" viewBox="0 0 24 24" fill={star <= r ? 'var(--warning)' : 'var(--border)'}>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
      ))}
    </div>
  );
}

export default function SurveysPage() {
  const [surveys,        setSurveys]       = useState<SurveyItem[]>([]);
  const [loading,        setLoading]       = useState(true);
  const [error,          setError]         = useState<string | null>(null);
  const [search,         setSearch]        = useState('');
  const [avgRating,      setAvgRating]     = useState(0);
  const [totalResponses, setTotalResponses]= useState(0);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/surveys');
        if (res.ok) {
          const data = await res.json();
          setSurveys(data.surveys || []);
          setAvgRating(data.average_rating || 0);
          setTotalResponses(data.total_responses || 0);
          setError(null);
        } else {
          const data = await res.json().catch(() => ({}));
          setError(data.error || 'Could not load survey data.');
        }
      } catch { setError('Could not load survey data.'); }
      setLoading(false);
    }
    load();
  }, []);

  const filtered = surveys.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (s.feedback_text || '').toLowerCase().includes(q) ||
      (s.company_name  || '').toLowerCase().includes(q) ||
      (s.learner_name  || '').toLowerCase().includes(q) ||
      (s.course_name   || '').toLowerCase().includes(q)
    );
  });

  const satisfactionRate = totalResponses > 0
    ? Math.round((surveys.filter((s) => (s.rating ?? 0) >= 4).length / totalResponses) * 100)
    : 0;

  return (
    <PageShell>
      <div className="page-header">
        <h1 className="page-title">Survey Analytics</h1>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '1.5rem' }}>
        <div className="card card-sm kpi-card">
          <span className="kpi-label">Avg Rating</span>
          <span className="kpi-value tabular" style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem' }}>
            {avgRating.toFixed(1)}<span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 400 }}>/5</span>
          </span>
        </div>
        <div className="card card-sm kpi-card">
          <span className="kpi-label">Responses</span>
          <span className="kpi-value tabular">{totalResponses}</span>
        </div>
        <div className="card card-sm kpi-card">
          <span className="kpi-label">Satisfaction</span>
          <span className="kpi-value tabular" style={{ color: satisfactionRate >= 70 ? 'var(--success)' : satisfactionRate >= 50 ? 'var(--warning)' : 'var(--danger)' }}>
            {satisfactionRate}%
          </span>
        </div>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="Search feedback, company, learner..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: '100%', maxWidth: '420px' }}
        />
      </div>

      {loading ? (
        <div className="empty-state card">
          <span className="spinner" />
          <p>Loading surveys...</p>
        </div>
      ) : error ? (
        <div className="empty-state card">
          <h3>Survey Data Unavailable</h3>
          <p>{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state card">
          <h3>No Survey Responses</h3>
          <p>Survey data will appear after syncing from Thinkific.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {filtered.map((s) => (
            <div key={s.id} className="card card-sm" style={{ borderLeft: '3px solid var(--border-accent)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.375rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{s.learner_name || 'Anonymous'}</span>
                  {s.company_name && (
                    <span className="badge badge-not-started">{s.company_name}</span>
                  )}
                </div>
                <StarRating rating={s.rating} />
              </div>

              {s.course_name && (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.375rem' }}>
                  {s.course_name}
                </p>
              )}
              {s.feedback_text && (
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {s.feedback_text}
                </p>
              )}
              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                {s.proficiency_level && <span>Level: {s.proficiency_level}</span>}
                {s.submitted_at && <span>{new Date(s.submitted_at).toLocaleDateString()}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
