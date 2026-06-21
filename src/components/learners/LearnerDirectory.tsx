'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
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

type LearnerDirectoryResponse = {
  learners: LearnerDirectoryApiRow[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
};

type LearnerDirectoryMeta = {
  course_options: CourseFilterOption[];
  role_options: RoleFilterOption[];
  company_name?: string;
};

type CourseFilterOption = {
  id: string;
  name: string;
  learner_count?: number;
};

type RoleFilterOption = {
  role: string;
  learner_count: number;
};

type LearnerDirectorySeed = {
  rows: Array<{
    learner_id: string;
    company_name: string | null;
    company_slug: string | null;
    full_name: string | null;
    email: string | null;
    department: string | null;
    title: string | null;
    avg_progress: number;
    status: LearnerStatus;
    courses_enrolled: number;
    last_active_at: string | null;
    live_sessions_last_30_days: number;
  }>;
  total: number;
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

function updateBrowserUrl(pathname: string, queryString: string, mode: 'push' | 'replace' = 'push') {
  const target = queryString ? `${pathname}?${queryString}` : pathname;
  const current = `${window.location.pathname}${window.location.search}`;
  if (current === target) return;

  if (mode === 'replace') {
    window.history.replaceState(null, '', target);
    return;
  }

  window.history.pushState(null, '', target);
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

function toInitialRows(initialData?: LearnerDirectorySeed): LearnerDirectoryApiRow[] {
  return (initialData?.rows || []).map((row) => ({
    id: row.learner_id,
    learner_id: row.learner_id,
    full_name: row.full_name || 'Unknown',
    email: row.email,
    department: row.department,
    title: row.title,
    avg_progress: row.avg_progress,
    progress_percent: row.avg_progress,
    status: row.status,
    courses_enrolled: row.courses_enrolled,
    last_active_at: row.last_active_at,
    live_sessions_last_30_days: row.live_sessions_last_30_days,
    company_name: row.company_name,
    company_slug: row.company_slug,
  }));
}

export default function LearnerDirectory({
  endpoint,
  metadataEndpoint,
  scope,
  companySlug,
  headerAction,
  initialData,
  initialMeta,
}: {
  endpoint: string;
  metadataEndpoint: string;
  scope: 'global' | 'company';
  companySlug?: string;
  headerAction?: ReactNode;
  initialData?: LearnerDirectorySeed;
  initialMeta?: LearnerDirectoryMeta;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const paramsString = searchParams.toString();
  const [rows, setRows] = useState<LearnerDirectoryApiRow[]>(() => toInitialRows(initialData));
  const [courseOptions, setCourseOptions] = useState<CourseFilterOption[]>(() => initialMeta?.course_options || []);
  const [roleOptions, setRoleOptions] = useState<RoleFilterOption[]>(() => initialMeta?.role_options || []);
  const [companyName, setCompanyName] = useState(initialMeta?.company_name || '');
  const [total, setTotal] = useState(initialData?.total || 0);
  const [loading, setLoading] = useState(!initialData);
  const [refreshing, setRefreshing] = useState(false);
  const [metaLoading, setMetaLoading] = useState(!initialMeta);
  const [error, setError] = useState<string | null>(null);
  const [localSearch, setLocalSearch] = useState(searchParams.get('q') || '');
  const requestIdRef = useRef(0);
  const rowsCountRef = useRef(rows.length);

  const page = Number(searchParams.get('page') || '1');
  const limit = Number(searchParams.get('limit') || '25');
  const qParam = searchParams.get('q') || '';
  const statusFilter = searchParams.get('status') || 'all';
  const courseFilter = searchParams.get('course_id') || '';
  const roleFilter = searchParams.get('role') || '';
  const sortBy = searchParams.get('sort_by') || 'full_name';
  const sortDir = searchParams.get('sort_dir') || 'asc';
  const currentRequestKey = JSON.stringify({ q: qParam, status: statusFilter, course_id: courseFilter, role: roleFilter, sort_by: sortBy, sort_dir: sortDir, page, limit });
  const initialRowsRequestKeyRef = useRef<string | null>(initialData ? currentRequestKey : null);
  const initialMetaEndpointRef = useRef<string | null>(initialMeta ? metadataEndpoint : null);

  useEffect(() => {
    rowsCountRef.current = rows.length;
  }, [rows.length]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLocalSearch(qParam);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [qParam]);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    const startedAt = performance.now();
    let cancelled = false;

    const run = async () => {
      if (initialRowsRequestKeyRef.current === currentRequestKey) {
        initialRowsRequestKeyRef.current = '__consumed__';
        return;
      }

      await Promise.resolve();
      if (cancelled || requestId !== requestIdRef.current) return;

      if (rowsCountRef.current > 0) setRefreshing(true);
      else setLoading(true);
      setError(null);

      fetch(`${endpoint}${paramsString ? `?${paramsString}` : ''}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      })
        .then(async (res) => {
          if (!res.ok) {
            const payload = await res.json().catch(() => ({}));
            throw new Error(payload.error || payload.message || 'Could not load learners.');
          }
          return res.json();
        })
        .then((data: LearnerDirectoryResponse) => {
          if (cancelled || requestId !== requestIdRef.current) return;
          setRows(data.learners || []);
          setTotal(data.total || 0);
          logClientTiming('learners.directory.fetch', performance.now() - startedAt, {
            scope,
            total_rows: data.total || 0,
            page: data.page || page,
          });
        })
        .catch((fetchError: unknown) => {
          if (cancelled || requestId !== requestIdRef.current) return;
          setError(fetchError instanceof Error ? fetchError.message : 'Could not load learners.');
        })
        .finally(() => {
          if (cancelled || requestId !== requestIdRef.current) return;
          setLoading(false);
          setRefreshing(false);
        });
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [currentRequestKey, endpoint, page, paramsString, qParam, scope]);

  useEffect(() => {
    if (initialMetaEndpointRef.current === metadataEndpoint) {
      initialMetaEndpointRef.current = '__consumed__';
      setMetaLoading(false);
      return;
    }

    setMetaLoading(true);
    setError(null);
    fetch(metadataEndpoint, {
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then(async (res) => {
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload.error || payload.message || 'Could not load learner filters.');
        }
        return res.json();
      })
      .then((data: LearnerDirectoryMeta) => {
        setCourseOptions(data.course_options || []);
        setRoleOptions(data.role_options || []);
        setCompanyName(data.company_name || '');
      })
      .catch((fetchError: unknown) => {
        setError(fetchError instanceof Error ? fetchError.message : 'Could not load learner filters.');
      })
      .finally(() => {
        setMetaLoading(false);
      });
  }, [metadataEndpoint]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const currentQ = searchParams.get('q') || '';
      if (localSearch === currentQ) return;
      const qs = buildQueryString(new URLSearchParams(paramsString), {
        q: localSearch.trim(),
        page: 1,
      });
      updateBrowserUrl(pathname, qs, 'replace');
    }, 300);

    return () => window.clearTimeout(timer);
  }, [localSearch, paramsString, pathname, searchParams]);

  function updateFilters(updates: Record<string, string | number | null | undefined>) {
    const qs = buildQueryString(new URLSearchParams(paramsString), updates);
    updateBrowserUrl(pathname, qs, 'push');
  }

  function toggleSort(column: string) {
    if (sortBy === column) {
      // Toggle direction
      updateFilters({ sort_dir: sortDir === 'asc' ? 'desc' : 'asc', page: 1 });
    } else {
      // New column, default to ascending
      updateFilters({ sort_by: column, sort_dir: 'asc', page: 1 });
    }
  }

  function SortableHeader({ column, children }: { column: string; children: React.ReactNode }) {
    const isSorted = sortBy === column;
    const isAsc = isSorted && sortDir === 'asc';
    const isDesc = isSorted && sortDir === 'desc';

    return (
      <th
        onClick={() => toggleSort(column)}
        title={`Click to sort by ${children} ${isSorted ? (sortDir === 'asc' ? '(descending)' : '(ascending)') : '(ascending)'}`}
        style={{
          cursor: 'pointer',
          userSelect: 'none',
          position: 'relative',
          transition: 'background 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--surface-raised)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = '';
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontWeight: isSorted ? 600 : 500 }}>
          {children}
          <span style={{
            fontSize: '0.875rem',
            color: isSorted ? 'var(--primary)' : 'var(--text-muted)',
            opacity: isSorted ? 1 : 0.5,
            fontWeight: 700,
          }}>
            {isAsc ? '↑' : isDesc ? '↓' : '↕'}
          </span>
        </div>
      </th>
    );
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
          placeholder="Search learner name or email..."
          value={localSearch}
          onChange={(event) => setLocalSearch(event.target.value)}
          style={{ flex: '1 1 200px', minWidth: 0 }}
        />
        <select
          value={courseFilter}
          onChange={(event) => updateFilters({ course_id: event.target.value || null, page: 1 })}
          style={{ flex: '1 1 180px', minWidth: 0 }}
          disabled={metaLoading}
        >
          <option value="">All Courses</option>
          {courseOptions.map((course) => (
            <option key={course.id} value={course.id}>
              {course.name}{course.learner_count !== undefined ? ` (${course.learner_count})` : ''}
            </option>
          ))}
        </select>
        {roleOptions.length > 0 && (
          <select
            value={roleFilter}
            onChange={(event) => updateFilters({ role: event.target.value || null, page: 1 })}
            style={{ flex: '1 1 140px', minWidth: 0 }}
            disabled={metaLoading}
          >
            <option value="">All Roles</option>
            {roleOptions.filter(r => r.learner_count > 0).map((r) => (
              <option key={r.role} value={r.role}>
                {r.role} ({r.learner_count})
              </option>
            ))}
          </select>
        )}
        <select
          value={statusFilter}
          onChange={(event) => updateFilters({ status: event.target.value, page: 1 })}
          style={{ flex: '1 1 150px', minWidth: 0 }}
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
          style={{ flex: '0 0 auto', minWidth: '100px' }}
        >
          <option value="25">25 / page</option>
          <option value="50">50 / page</option>
          <option value="100">100 / page</option>
        </select>
      </div>

      {loading ? (
        <TableSkeleton showCompany={showCompany} />
      ) : error ? (
        <div className="empty-state card">
          <h3>Could not load learners</h3>
          <p>{error}</p>
        </div>
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
                <SortableHeader column="full_name">Name</SortableHeader>
                {showCompany && <th>Company</th>}
                <SortableHeader column="title">Role</SortableHeader>
                <SortableHeader column="avg_progress">Progress</SortableHeader>
                <th>Status</th>
                <SortableHeader column="courses_enrolled">Courses</SortableHeader>
                <SortableHeader column="last_active_at">Last Active</SortableHeader>
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
