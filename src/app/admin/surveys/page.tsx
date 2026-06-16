'use client';

import PageShell from '@/components/layout/PageShell';
import RatingDistributionChart from '@/components/surveys/RatingDistributionChart';
import RatingTrendChart from '@/components/surveys/RatingTrendChart';
import CoursePerformanceList from '@/components/surveys/CoursePerformanceList';
import FeedbackCard from '@/components/surveys/FeedbackCard';
import { useEffect, useState, useCallback } from 'react';

interface SurveyItem {
  id: string;
  rating: number | null;
  feedback_text: string | null;
  proficiency_level: string | null;
  submitted_at: string | null;
  company_id: string | null;
  company_name: string | null;
  learner_name: string | null;
  course_id: string | null;
  course_name: string | null;
}

interface RatingBucket { rating: number; count: number }
interface TrendPoint   { date: string; average_rating: number; count: number }
interface CoursePerf   { course_id: string; course_name: string; average_rating: number; response_count: number }
interface Company      { id: string; name: string }

interface SurveyData {
  surveys:             SurveyItem[];
  average_rating:      number;
  total_responses:     number;
  satisfaction_rate:   number;
  scale:               number;
  rating_distribution: RatingBucket[];
  rating_trend:        TrendPoint[];
  course_performance:  CoursePerf[];
  companies:           Company[];
}

const PROFICIENCY_OPTIONS = ['all', 'beginner', 'intermediate', 'advanced'];

export default function SurveysPage() {
  const [data,            setData]           = useState<SurveyData | null>(null);
  const [loading,         setLoading]        = useState(true);
  const [error,           setError]          = useState<string | null>(null);
  const [companyFilter,   setCompanyFilter]  = useState('all');
  const [profFilter,      setProfFilter]     = useState('all');
  const [search,          setSearch]         = useState('');
  const [feedbackPage,    setFeedbackPage]   = useState(0);

  const FEEDBACK_PER_PAGE = 10;

  const load = useCallback(async (cid: string, prof: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (cid  !== 'all') params.set('company_id', cid);
      if (prof !== 'all') params.set('proficiency_level', prof);
      const res = await fetch(`/api/surveys?${params.toString()}`);
      if (res.ok) {
        setData(await res.json());
        setError(null);
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Could not load survey data.');
      }
    } catch { setError('Could not load survey data.'); }
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(companyFilter, profFilter); }, [load, companyFilter, profFilter]);

  function handleCompanyChange(val: string) { setCompanyFilter(val); setFeedbackPage(0); }
  function handleProfChange(val: string)    { setProfFilter(val);    setFeedbackPage(0); }

  const filteredFeedback = (data?.surveys || []).filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (s.feedback_text  || '').toLowerCase().includes(q) ||
      (s.learner_name   || '').toLowerCase().includes(q) ||
      (s.company_name   || '').toLowerCase().includes(q) ||
      (s.course_name    || '').toLowerCase().includes(q)
    );
  });

  const paginatedFeedback = filteredFeedback.slice(
    feedbackPage * FEEDBACK_PER_PAGE,
    (feedbackPage + 1) * FEEDBACK_PER_PAGE
  );
  const totalFeedbackPages = Math.ceil(filteredFeedback.length / FEEDBACK_PER_PAGE);

  const scale      = data?.scale ?? 10;
  const avgRating  = data?.average_rating ?? 0;
  const totalResp  = data?.total_responses ?? 0;
  const satRate    = data?.satisfaction_rate ?? 0;

  const satColor = satRate >= 70 ? 'var(--on-track)' : satRate >= 50 ? 'var(--warning)' : 'var(--at-risk)';

  return (
    <PageShell>
      {/* Page header */}
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title">Survey Analytics</h1>
          <p className="page-subtitle">Learner satisfaction and feedback across all programs</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
        {/* LEFT: filter panel */}
        <div style={{
          width: 200, flexShrink: 0,
          display: 'flex', flexDirection: 'column', gap: '1.25rem',
        }}>
          <div className="card card-sm">
            <p className="section-title" style={{ marginBottom: '0.625rem' }}>Company</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <button
                onClick={() => handleCompanyChange('all')}
                style={{
                  textAlign: 'left', padding: '0.3125rem 0.5rem', borderRadius: 4, border: 'none',
                  background: companyFilter === 'all' ? 'var(--primary-glow)' : 'transparent',
                  color: companyFilter === 'all' ? 'var(--primary)' : 'var(--text-secondary)',
                  fontSize: '0.8125rem', cursor: 'pointer', fontWeight: companyFilter === 'all' ? 600 : 400,
                }}
              >
                All Companies
              </button>
              {(data?.companies || []).map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleCompanyChange(c.id)}
                  style={{
                    textAlign: 'left', padding: '0.3125rem 0.5rem', borderRadius: 4, border: 'none',
                    background: companyFilter === c.id ? 'var(--primary-glow)' : 'transparent',
                    color: companyFilter === c.id ? 'var(--primary)' : 'var(--text-secondary)',
                    fontSize: '0.8125rem', cursor: 'pointer', fontWeight: companyFilter === c.id ? 600 : 400,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}
                  title={c.name}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div className="card card-sm">
            <p className="section-title" style={{ marginBottom: '0.625rem' }}>Proficiency</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {PROFICIENCY_OPTIONS.map((p) => (
                <button
                  key={p}
                  onClick={() => handleProfChange(p)}
                  style={{
                    textAlign: 'left', padding: '0.3125rem 0.5rem', borderRadius: 4, border: 'none',
                    background: profFilter === p ? 'var(--primary-glow)' : 'transparent',
                    color: profFilter === p ? 'var(--primary)' : 'var(--text-secondary)',
                    fontSize: '0.8125rem', cursor: 'pointer', fontWeight: profFilter === p ? 600 : 400,
                    textTransform: 'capitalize',
                  }}
                >
                  {p === 'all' ? 'All Levels' : p}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: main content */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.875rem' }}>
            <div className="card card-sm kpi-card">
              <span className="kpi-label">Avg Rating</span>
              <span className="kpi-value tabular" style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem' }}>
                {loading ? '—' : avgRating.toFixed(1)}
                <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 400 }}>/{scale}</span>
              </span>
            </div>
            <div className="card card-sm kpi-card">
              <span className="kpi-label">Total Responses</span>
              <span className="kpi-value tabular">{loading ? '—' : totalResp.toLocaleString()}</span>
            </div>
            <div className="card card-sm kpi-card">
              <span className="kpi-label">Satisfaction Rate</span>
              <span className="kpi-value tabular" style={{ color: loading ? 'var(--text)' : satColor }}>
                {loading ? '—' : `${satRate}%`}
              </span>
            </div>
          </div>

          {loading ? (
            <div className="empty-state card" style={{ minHeight: 300 }}>
              <span className="spinner" />
              <p>Loading analytics...</p>
            </div>
          ) : error ? (
            <div className="empty-state card">
              <h3>Survey Data Unavailable</h3>
              <p>{error}</p>
            </div>
          ) : (
            <>
              {/* Charts row */}
              <div className="grid-2">
                <RatingDistributionChart
                  data={data?.rating_distribution ?? []}
                  scale={scale}
                />
                <RatingTrendChart
                  data={data?.rating_trend ?? []}
                  scale={scale}
                />
              </div>

              {/* Course performance */}
              {(data?.course_performance?.length ?? 0) > 0 && (
                <CoursePerformanceList data={data!.course_performance} />
              )}

              {/* Feedback list */}
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.875rem 1rem', borderBottom: '1px solid var(--border)' }}>
                  <p className="section-title" style={{ marginBottom: 0 }}>
                    Student Feedback
                    <span style={{ marginLeft: '0.5rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                      ({filteredFeedback.length})
                    </span>
                  </p>
                  <input
                    type="text"
                    placeholder="Search feedback..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setFeedbackPage(0); }}
                    style={{ width: 220, fontSize: '0.8125rem' }}
                  />
                </div>

                {filteredFeedback.length === 0 ? (
                  <div className="empty-state" style={{ padding: '2rem' }}>
                    <p>No feedback matches your filters.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', padding: '0.875rem 1rem' }}>
                    {paginatedFeedback.map((s) => (
                      <FeedbackCard
                        key={s.id}
                        learnerName={s.learner_name}
                        companyName={s.company_name}
                        courseName={s.course_name}
                        rating={s.rating}
                        feedbackText={s.feedback_text}
                        proficiencyLevel={s.proficiency_level}
                        submittedAt={s.submitted_at}
                        scale={scale}
                      />
                    ))}

                    {totalFeedbackPages > 1 && (
                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', paddingTop: '0.5rem' }}>
                        <button
                          className="btn btn-sm"
                          disabled={feedbackPage === 0}
                          onClick={() => setFeedbackPage((p) => p - 1)}
                          style={{ opacity: feedbackPage === 0 ? 0.4 : 1 }}
                        >
                          ← Prev
                        </button>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {feedbackPage + 1} / {totalFeedbackPages}
                        </span>
                        <button
                          className="btn btn-sm"
                          disabled={feedbackPage >= totalFeedbackPages - 1}
                          onClick={() => setFeedbackPage((p) => p + 1)}
                          style={{ opacity: feedbackPage >= totalFeedbackPages - 1 ? 0.4 : 1 }}
                        >
                          Next →
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </PageShell>
  );
}
