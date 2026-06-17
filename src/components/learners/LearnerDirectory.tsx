'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import LearnerStatusBadge from './LearnerStatusBadge';
import { logClientTiming } from '@/lib/perf-client';
import type { LearnerStatus } from '@/types/learner';

type LearnerDirectoryApiRow = {
  id?: string;
  learner_id?: string;
  full_name: string;
  email: string | null;
  department: string | null;
  title: string | null;
  progress_percent?: number;
  avg_progress?: number;
  status: LearnerStatus;
  courses_enrolled: number;
  last_active_at: string | null;
  live_sessions_last_30_days: number;
  company_name?: string | null;
  company_slug?: string | null;
};

type CourseOption = {
  id: string;
  name: string;
};

type LearnerDirectoryResponse = {
  learners: LearnerDirectoryApiRow[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
  course_options: CourseOption[];
  company_name?: string;
};

function buildQueryString(
  current: URLSearchParams,
  updates: Record<string, string | number | null | undefined>,
) {
  const next = new URLSearchParams(current.toString());
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === undefined || value === '' || value === 'all') {
      next.delete(key);
    } else {
      next.set(key, String(value));
    }
  }
  return next.toString();
}

function TableSkeleton({ showCompany }: { showCompany: boolean }) {
  return (
    <div className="card card-flush" style={{ overflow: 'hidden' }}>
      <div style={{ display: 'grid', gap: '0.625rem', padding: '1rem' }}>
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            style={{
              display: 'grid',
              gridTemplateColumns: showCompany ? '2fr 1.4fr 1fr 1fr 0.9fr 0.9fr 0.8fr' : '2fr 1fr 1fr 1fr 0.9fr 0.9fr',
              gap: '0.75rem',
              alignItems: 'center',
            }}
          >
            {Array.from({ length: showCompany ? 7 : 6 }).map((__, cellIndex) => (
              <div
                key={cellIndex}
                style={{
                  height: 14,
                  borderRadius: 9999,
                  background: 'linear-gradient(90deg, var(--surface-raised), var(--surface), var(--surface-raised))',
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LearnerDirectory({
  endpoint,
  scope,
  companySlug,
  headerAction,
}: {
  endpoint: string;
  scope: 'global' | 'company';
  companySlug?: string;
  headerAction?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<LearnerDirectoryApiRow[]>([]);
  const [courseOptions, setCourseOptions] = useState<CourseOption[]>([]);
  const [companyName, setCompanyName] = useState('');
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [localSearch, setLocalSearch] = useState(searchParams.get('q') || '');
  const requestIdRef = useRef(0);
  const hasLoadedOnceRef = useRef(false);

  const page = Number(searchParams.get('page') || '1');
  const limit = Number(searchParams.get('limit') || '25');
  const qParam = searchParams.get('q') || '';
  const statusFilter = searchParams.get('status') || 'all';
  const courseFilter = searchParams.get('course_id') || '';

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLocalSearch(qParam);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [qParam]);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    const startedAt = performance.now();
    const paramsString = searchParams.toString();

    if (hasLoadedOnceRef.current) setRefreshing(true);
    else setLoading(true);

    fetch(`${endpoint}${paramsString ? `?${paramsString}` : ''}`, {
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then((res) => res.json())
      .then((data: LearnerDirectoryResponse) => {
        if (requestId !== requestIdRef.current) return;
        setRows(data.learners || []);
        setCourseOptions(data.course_options || []);
        setTotal(data.total || 0);
        if (data.company_name) setCompanyName(data.company_name);
        logClientTiming('learners.directory.fetch', performance.now() - startedAt, {
          scope,
          total_rows: data.total || 0,
          page: data.page || page,
        });
      })
      .catch(() => {})
      .finally(() => {
        if (requestId !== requestIdRef.current) return;
        hasLoadedOnceRef.current = true;
        setLoading(false);
        setRefreshing(false);
      });
  }, [endpoint, page, qParam, scope, searchParams]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const currentQ = searchParams.get('q') || '';
      if (localSearch === currentQ) return;
      const qs = buildQueryString(searchParams, {
        q: localSearch.trim(),
        page: 1,
      });
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [localSearch, pathname, router, searchParams]);

  function updateFilters(updates: Record<string, string | number | null | undefined>) {
    const qs = buildQueryString(searchParams, updates);
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  const showCompany = scope === 'global';
  const totalPages = Math.max(Math.ceil(total / Math.max(limit, 1)), 1);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">{scope === 'global' ? 'All Learners' : 'Learners'}</h1>
          <p className="page-subtitle">
            {scope === 'global'
              ? 'Search and filter learners across every company'
              : `${companyName || 'Company'} learner directory with server-side filters`}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {headerAction}
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
            {total} learner{total !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.625rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder={scope === 'global' ? 'Search learner name or email...' : 'Search learner name or email...'}
          value={localSearch}
          onChange={(event) => setLocalSearch(event.target.value)}
          style={{ flex: 1, minWidth: '220px' }}
        />
        <select
          value={courseFilter}
          onChange={(event) => updateFilters({ course_id: event.target.value || null, page: 1 })}
          style={{ minWidth: '220px' }}
        >
          <option value="">All Courses</option>
          {courseOptions.map((course) => (
            <option key={course.id} value={course.id}>{course.name}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(event) => updateFilters({ status: event.target.value, page: 1 })}
          style={{ minWidth: '170px' }}
        >
          <option value="all">All Statuses</option>
          <option value="not_started">Not Started</option>
          <option value="at_risk">At Risk</option>
          <option value="slightly_behind">Slightly Behind</option>
          <option value="on_track">On Track</option>
          <option value="high_engagement">High Engagement</option>
        </select>
        <select
          value={String(limit)}
          onChange={(event) => updateFilters({ limit: Number(event.target.value), page: 1 })}
          style={{ minWidth: '110px' }}
        >
          <option value="25">25 / page</option>
          <option value="50">50 / page</option>
          <option value="100">100 / page</option>
        </select>
      </div>

      {loading ? (
        <TableSkeleton showCompany={showCompany} />
      ) : rows.length === 0 ? (
        <div className="empty-state card">
          <h3>No Learners Found</h3>
          <p>Adjust filters or sync data from Thinkific.</p>
        </div>
      ) : (
        <div className="card card-flush" style={{ overflow: 'auto', position: 'relative' }}>
          {refreshing && (
            <div style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(10, 15, 25, 0.08)',
              pointerEvents: 'none',
              zIndex: 1,
            }} />
          )}
          <table>
            <thead>
              <tr>
                <th>Name</th>
                {showCompany && <th>Company</th>}
                <th>Role</th>
                <th>Progress</th>
                <th>Status</th>
                <th>Courses</th>
                <th>Last Active</th>
                <th style={{ textAlign: 'center' }}>Sessions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const learnerId = row.id || row.learner_id || '';
                const progress = Math.min(100, row.progress_percent ?? row.avg_progress ?? 0);
                const progressColor = progress >= 70 ? 'var(--on-track)' : progress >= 40 ? 'var(--primary)' : 'var(--at-risk)';
                const destinationSlug = showCompany ? row.company_slug : companySlug;
                const href = destinationSlug ? `/company/${destinationSlug}/learners/${learnerId}` : undefined;

                return (
                  <tr key={learnerId}>
                    <td>
                      <div>
                        {href ? (
                          <Link href={href} style={{ color: 'var(--primary)', fontWeight: 500, fontSize: '0.875rem' }}>
                            {row.full_name || 'Unknown'}
                          </Link>
                        ) : (
                          <span style={{ color: 'var(--text)', fontWeight: 500, fontSize: '0.875rem' }}>
                            {row.full_name || 'Unknown'}
                          </span>
                        )}
                        <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '1px' }}>{row.email || '—'}</p>
                      </div>
                    </td>
                    {showCompany && (
                      <td style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
                        {row.company_slug ? (
                          <Link href={`/company/${row.company_slug}`} style={{ color: 'var(--primary)' }}>
                            {row.company_name || '—'}
                          </Link>
                        ) : row.company_name || '—'}
                      </td>
                    )}
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>{row.title || row.department || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: 56, height: 4, background: 'var(--border)', borderRadius: '9999px', overflow: 'hidden', flexShrink: 0 }}>
                          <div style={{ width: `${progress}%`, height: '100%', background: progressColor, borderRadius: '9999px' }} />
                        </div>
                        <span className="tabular" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {progress.toFixed(0)}%
                        </span>
                      </div>
                    </td>
                    <td><LearnerStatusBadge status={row.status} /></td>
                    <td className="tabular" style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{row.courses_enrolled}</td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {row.last_active_at ? new Date(row.last_active_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="tabular" style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                      {row.live_sessions_last_30_days}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Page {page} of {totalPages}
        </span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className="btn btn-secondary btn-sm"
            disabled={page <= 1}
            onClick={() => updateFilters({ page: Math.max(page - 1, 1) })}
          >
            ← Previous
          </button>
          <button
            className="btn btn-secondary btn-sm"
            disabled={page >= totalPages}
            onClick={() => updateFilters({ page: page + 1 })}
          >
            Next →
          </button>
        </div>
      </div>
    </>
  );
}
