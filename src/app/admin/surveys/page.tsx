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

export default function SurveysPage() {
  const [surveys, setSurveys] = useState<SurveyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [avgRating, setAvgRating] = useState(0);
  const [totalResponses, setTotalResponses] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/surveys');
        if (res.ok) {
          const data = await res.json();
          setSurveys(data.surveys || []);
          setAvgRating(data.average_rating || 0);
          setTotalResponses(data.total_responses || 0);
        }
      } catch { /* empty */ }
      setLoading(false);
    }
    load();
  }, []);

  const filtered = surveys.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (s.feedback_text || '').toLowerCase().includes(q) ||
      (s.company_name || '').toLowerCase().includes(q) ||
      (s.learner_name || '').toLowerCase().includes(q) ||
      (s.course_name || '').toLowerCase().includes(q)
    );
  });

  const satisfactionRate = totalResponses > 0
    ? Math.round((surveys.filter((s) => (s.rating ?? 0) >= 4).length / totalResponses) * 100)
    : 0;

  return (
    <PageShell>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>Survey Analytics</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <div className="card">
          <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase' }}>Avg Rating</span>
          <p style={{ fontSize: '1.75rem', fontWeight: 700 }}>{avgRating.toFixed(1)}<span style={{ fontSize: '1rem', color: '#6b7280' }}>/5</span></p>
        </div>
        <div className="card">
          <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase' }}>Total Responses</span>
          <p style={{ fontSize: '1.75rem', fontWeight: 700 }}>{totalResponses}</p>
        </div>
        <div className="card">
          <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase' }}>Satisfaction Rate</span>
          <p style={{ fontSize: '1.75rem', fontWeight: 700 }}>{satisfactionRate}%</p>
        </div>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="Search feedback..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: '100%', maxWidth: '400px' }}
        />
      </div>

      {loading ? (
        <div className="empty-state card"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state card">
          <h3>No Survey Responses</h3>
          <p>Survey data will appear after syncing from Thinkific.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filtered.map((s) => (
            <div key={s.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{s.learner_name || 'Anonymous'}</span>
                  <span style={{ color: '#6b7280', fontSize: '0.75rem', marginLeft: '0.5rem' }}>{s.company_name || ''}</span>
                </div>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <span key={star} style={{ color: star <= (s.rating ?? 0) ? '#f59e0b' : '#e5e7eb' }}>★</span>
                  ))}
                </div>
              </div>
              {s.course_name && (
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                  Course: {s.course_name}
                </p>
              )}
              {s.feedback_text && (
                <p style={{ fontSize: '0.8125rem', color: '#374151' }}>{s.feedback_text}</p>
              )}
              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.75rem', color: '#9ca3af' }}>
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
