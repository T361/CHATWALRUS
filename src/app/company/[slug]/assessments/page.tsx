'use client';

import CompanyShell from '@/components/layout/CompanyShell';
import Link from 'next/link';
import { useEffect, useState, use } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

interface QuizRow {
  id: string;
  score: number | null;
  passed: boolean | null;
  attempted_at: string | null;
  courses?: { name: string } | null;
  learners?: { full_name: string } | null;
}

interface AssignmentRow {
  id: string;
  submitted: boolean | null;
  score: number | null;
  submitted_at: string | null;
  courses?: { name: string } | null;
  learners?: { full_name: string } | null;
}

function DarkTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.5rem 0.75rem', fontSize: '0.8125rem' }}>
      <p style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ fontWeight: 600, color: 'var(--primary)' }}>{p.name}: {p.value}%</p>
      ))}
    </div>
  );
}

function QuizCourseChart({ quizzes }: { quizzes: QuizRow[] }) {
  const courseMap = new Map<string, { sum: number; count: number; passed: number }>();
  for (const q of quizzes) {
    if (q.score === null) continue;
    const name = q.courses?.name ?? 'Unknown';
    const ex = courseMap.get(name) ?? { sum: 0, count: 0, passed: 0 };
    ex.sum += q.score;
    ex.count += 1;
    if (q.passed) ex.passed += 1;
    courseMap.set(name, ex);
  }
  const data = Array.from(courseMap.entries()).map(([name, { sum, count, passed }]) => ({
    name: name.length > 20 ? name.slice(0, 18) + '…' : name,
    avgScore: Math.round(sum / count),
    passRate: Math.round((passed / count) * 100),
  }));

  if (data.length === 0) return null;

  return (
    <div className="card" style={{ marginBottom: '1.25rem' }}>
      <p className="section-title" style={{ marginBottom: '0.875rem' }}>Quiz Performance by Course</p>
      <ResponsiveContainer width="100%" height={Math.max(180, data.length * 40)}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} unit="%" />
          <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
          <Tooltip content={<DarkTooltip />} cursor={{ fill: 'var(--surface)' }} />
          <Bar dataKey="avgScore" name="Avg Score" fill="var(--primary)" radius={[0, 3, 3, 0]} />
          <Bar dataKey="passRate" name="Pass Rate" fill="var(--on-track)" radius={[0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="card card-sm kpi-card">
      <span className="kpi-label">{label}</span>
      <span className="kpi-value tabular" style={color ? { color } : {}}>{value}</span>
    </div>
  );
}

function median(arr: number[]) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

type Tab = 'overview' | 'quizzes' | 'assignments';

export default function AssessmentsPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = use(props.params);
  const [quizzes,     setQuizzes]     = useState<QuizRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [tab,         setTab]         = useState<Tab>('overview');
  const [companyName, setCompanyName] = useState<string>('');

  useEffect(() => {
    async function load() {
      try {
        const [assessRes, compRes] = await Promise.all([
          fetch(`/api/companies/${slug}/assessments`),
          fetch(`/api/companies/${slug}`),
        ]);
        if (assessRes.ok) {
          const d = await assessRes.json();
          setQuizzes(d.quizzes || []);
          setAssignments(d.assignments || []);
        } else {
          setError('Could not load assessments.');
        }
        if (compRes.ok) {
          const c = await compRes.json();
          setCompanyName(c.company?.name || '');
        }
      } catch { setError('Could not load assessments.'); }
      setLoading(false);
    }
    load();
  }, [slug]);

  // Computed metrics
  const quizScores     = quizzes.filter((q) => q.score !== null).map((q) => q.score as number);
  const medianQuiz     = median(quizScores);
  const passed         = quizzes.filter((q) => q.passed === true).length;
  const passRate       = quizzes.length > 0 ? Math.round((passed / quizzes.length) * 100) : null;
  const submitted      = assignments.filter((a) => a.submitted === true).length;
  const subRate        = assignments.length > 0 ? Math.round((submitted / assignments.length) * 100) : null;
  const uniqueCourses  = new Set([
    ...quizzes.map((q) => q.courses?.name).filter(Boolean),
    ...assignments.map((a) => a.courses?.name).filter(Boolean),
  ]).size;

  const tabStyle = (t: Tab) => ({
    padding: '0.375rem 0.875rem',
    borderRadius: 6,
    border: 'none',
    fontSize: '0.8125rem',
    fontWeight: 500,
    cursor: 'pointer',
    background: tab === t ? 'var(--primary)' : 'transparent',
    color: tab === t ? '#fff' : 'var(--text-secondary)',
    transition: 'all 0.15s ease',
  } as React.CSSProperties);

  return (
    <CompanyShell slug={slug} companyName={companyName}>
      <div className="page-header" style={{ marginBottom: '1.25rem' }}>
        <h1 className="page-title">Assessments</h1>
        <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--surface)', padding: '0.25rem', borderRadius: 8, border: '1px solid var(--border)' }}>
          <button style={tabStyle('overview')}    onClick={() => setTab('overview')}>Overview</button>
          <button style={tabStyle('quizzes')}     onClick={() => setTab('quizzes')}>Quizzes ({quizzes.length})</button>
          <button style={tabStyle('assignments')} onClick={() => setTab('assignments')}>Assignments ({assignments.length})</button>
        </div>
      </div>

      {loading ? (
        <div className="empty-state card" style={{ minHeight: 240 }}>
          <span className="spinner" />
          <p>Loading assessments...</p>
        </div>
      ) : error ? (
        <div className="empty-state card"><h3>Error</h3><p>{error}</p></div>
      ) : (
        <>
          {/* Overview Tab */}
          {tab === 'overview' && (
            <>
              <div className="kpi-grid" style={{ marginBottom: '1.5rem' }}>
                <KpiCard label="Courses Tracked"     value={uniqueCourses} />
                <KpiCard label="Total Quiz Attempts"  value={quizzes.length} />
                <KpiCard label="Quiz Pass Rate"       value={passRate !== null ? `${passRate}%` : '—'} color={passRate !== null ? (passRate >= 70 ? 'var(--on-track)' : passRate >= 50 ? 'var(--warning)' : 'var(--at-risk)') : undefined} />
                <KpiCard label="Median Quiz Score"    value={medianQuiz !== null ? `${medianQuiz.toFixed(0)}%` : '—'} />
                <KpiCard label="Assignments Tracked"  value={assignments.length} />
                <KpiCard label="Submission Rate"      value={subRate !== null ? `${subRate}%` : '—'} color={subRate !== null ? (subRate >= 80 ? 'var(--on-track)' : subRate >= 60 ? 'var(--warning)' : 'var(--at-risk)') : undefined} />
              </div>

              <QuizCourseChart quizzes={quizzes} />

              {/* Quick split summary */}
              <div className="grid-2">
                <div className="card">
                  <p className="section-title">Quiz Summary</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                    {[
                      { label: 'Total attempts', value: quizzes.length },
                      { label: 'Passed',         value: passed, color: 'var(--on-track)' },
                      { label: 'Failed',         value: quizzes.length - passed, color: 'var(--at-risk)' },
                      { label: 'Pass rate',      value: passRate !== null ? `${passRate}%` : '—' },
                    ].map(({ label, value, color }) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{label}</span>
                        <span className="tabular" style={{ fontWeight: 600, color: color || 'var(--text)' }}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="card">
                  <p className="section-title">Assignment Summary</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                    {[
                      { label: 'Total tracked',    value: assignments.length },
                      { label: 'Submitted',        value: submitted, color: 'var(--on-track)' },
                      { label: 'Pending',          value: assignments.length - submitted, color: 'var(--warning)' },
                      { label: 'Submission rate',  value: subRate !== null ? `${subRate}%` : '—' },
                    ].map(({ label, value, color }) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{label}</span>
                        <span className="tabular" style={{ fontWeight: 600, color: color || 'var(--text)' }}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Quizzes Tab */}
          {tab === 'quizzes' && (
            <>
              <QuizCourseChart quizzes={quizzes} />
              <div className="card card-flush" style={{ overflow: 'auto' }}>
                {quizzes.length === 0 ? (
                  <div className="empty-state"><p>No quiz data available.</p></div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Learner</th>
                        <th>Course</th>
                        <th>Score</th>
                        <th>Result</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quizzes.map((q) => (
                        <tr key={q.id}>
                          <td style={{ fontWeight: 500, fontSize: '0.875rem' }}>{q.learners?.full_name ?? '—'}</td>
                          <td style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>{q.courses?.name ?? '—'}</td>
                          <td className="tabular" style={{ fontSize: '0.875rem' }}>
                            {q.score !== null ? (
                              <span style={{ color: q.score >= 70 ? 'var(--on-track)' : 'var(--at-risk)', fontWeight: 600 }}>
                                {q.score}%
                              </span>
                            ) : '—'}
                          </td>
                          <td>
                            {q.passed === true
                              ? <span className="badge badge-success">Pass</span>
                              : q.passed === false
                                ? <span className="badge badge-danger">Fail</span>
                                : <span className="badge badge-not-started">—</span>}
                          </td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                            {q.attempted_at ? new Date(q.attempted_at).toLocaleDateString() : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

          {/* Assignments Tab */}
          {tab === 'assignments' && (
            <div className="card card-flush" style={{ overflow: 'auto' }}>
              {assignments.length === 0 ? (
                <div className="empty-state"><p>No assignment data available.</p></div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Learner</th>
                      <th>Course</th>
                      <th>Status</th>
                      <th>Score</th>
                      <th>Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map((a) => (
                      <tr key={a.id}>
                        <td style={{ fontWeight: 500, fontSize: '0.875rem' }}>{a.learners?.full_name ?? '—'}</td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>{a.courses?.name ?? '—'}</td>
                        <td>
                          {a.submitted
                            ? <span className="badge badge-success">Submitted</span>
                            : <span className="badge badge-not-started">Pending</span>}
                        </td>
                        <td className="tabular" style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                          {a.score !== null ? a.score : '—'}
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                          {a.submitted_at ? new Date(a.submitted_at).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </CompanyShell>
  );
}
