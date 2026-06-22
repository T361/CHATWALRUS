'use client';

import PageShell from '@/components/layout/PageShell';
import PasscodeTable from '@/components/admin/PasscodeTable';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Passcode } from '@/types/alert';
import { logClientTiming } from '@/lib/perf-client';

interface SettingsStatusResponse {
  auth: {
    authenticated: boolean;
    configured: boolean;
    role: string | null;
    expires_at: string | null;
  };
  integrations: {
    supabase: {
      configured: boolean;
      admin_configured: boolean;
      public_probe: { connected: boolean; status: number | null; message: string | null } | null;
      admin_probe:  { connected: boolean; status: number | null; message: string | null } | null;
    };
    thinkific: {
      configured: boolean;
      probe: { connected: boolean; status: number | null; message: string | null } | null;
    };
    zoom:  { configured: boolean };
  };
  data_health?: {
    learner_rollups: {
      relation_present: boolean;
      active_learners: number;
      rollup_rows: number;
      companies_with_active_learners: number;
      companies_with_rollup_rows: number;
      healthy: boolean;
      message: string | null;
    };
    weekly_rollups: {
      relation_present: boolean;
      active_companies: number;
      rollup_companies: number;
      week_start: string;
      healthy: boolean;
      message: string | null;
    };
  };
}

const syncButtons = [
  { type: 'core',           label: 'Import Core Data',         sub: 'Courses + Users + Enrollments — auto-creates all companies',                    endpoint: '/api/admin/sync/core' },
  { type: 'groups',         label: 'Sync Thinkific Groups',    sub: 'Canonical company list from Thinkific Groups + learner→company assignments',    endpoint: '/api/admin/sync/groups' },
  { type: 'orders',         label: 'Sync Orders',              sub: 'Enrollment purchase history from Thinkific',                                    endpoint: '/api/admin/sync/orders' },
  { type: 'start-dates',    label: 'Auto-detect Start Dates',  sub: 'Infers program start date from earliest enrollment per company',                endpoint: '/api/admin/sync/start-dates' },
  { type: 'progress',       label: 'Import Progress',          sub: 'Enrollment + completion data',                                                  endpoint: '/api/admin/sync/progress' },
  { type: 'assignments',    label: 'Import Assignments',        sub: 'Submissions from Thinkific',                                                   endpoint: '/api/admin/sync/assignments' },
{ type: 'zoom',           label: 'Sync Zoom Attendance',     sub: 'Meetings + webinars attendance — requires Zoom credentials',                    endpoint: '/api/admin/sync/zoom' },
  { type: 'lesson-progress',label: 'Sync Lesson Progress',     sub: 'Lesson-level completion from Thinkific (slow — runs incrementally)',             endpoint: '/api/admin/sync/lesson-progress' },
  { type: 'learners-rollups',label: 'Backfill Learner Rollups',sub: 'Populate learner directory rollups for already-synced learners',                 endpoint: '/api/admin/sync/learners-rollups' },
  { type: 'weekly-rollups', label: 'Backfill Weekly Rollups',  sub: 'Populate current-week weekly report rollups for active companies',               endpoint: '/api/admin/sync/weekly-rollups' },
  { type: 'snapshots',      label: 'Create Daily Snapshots',   sub: 'Progress snapshots for trend charts',                                           endpoint: '/api/admin/sync/snapshots' },
  { type: 'gamification',   label: 'Recalculate Points',       sub: 'Recalculate all learner points + badges from recorded activity',                endpoint: '/api/admin/sync/gamification' },
  { type: 'milestones',     label: 'Run Milestone Checks',     sub: 'Learner statuses + risk alerts',                                                endpoint: '/api/jobs/run-milestones' },
  { type: 'full',           label: 'Full Sync',                sub: 'Import all data from Thinkific',                                                endpoint: '/api/admin/sync/full' },
];

function StatusDot({ ok, dim }: { ok: boolean; dim?: boolean }) {
  const color = dim ? 'var(--text-muted)' : ok ? 'var(--success)' : 'var(--danger)';
  return (
    <span style={{
      width: 7, height: 7, borderRadius: '50%', background: color,
      display: 'inline-block', flexShrink: 0,
      boxShadow: dim ? 'none' : `0 0 6px ${color}`,
    }} />
  );
}

function IntegrationRow({ label, configured, connected, detail, message }: {
  label: string; configured: boolean; connected: boolean; detail: string; message?: string | null;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', padding: '0.625rem 0', borderBottom: '1px solid var(--border-muted)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <StatusDot ok={connected} dim={!configured} />
        <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ textAlign: 'right', maxWidth: '55%' }}>
        <span style={{ fontSize: '0.75rem', color: !configured ? 'var(--text-muted)' : connected ? 'var(--success)' : 'var(--warning)', display: 'block' }}>
          {!configured ? detail : connected ? `Connected · ${detail}` : `Not connected · ${detail}`}
        </span>
        {message && configured && !connected && (
          <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.125rem' }}>{message}</span>
        )}
      </div>
    </div>
  );
}

export default function AdminSettingsPage() {
  const router = useRouter();
  const [syncStatus,    setSyncStatus]    = useState<Record<string, string>>({});
  const [loading,       setLoading]       = useState<Record<string, boolean>>({});
  const [settingsStatus,setSettingsStatus]= useState<SettingsStatusResponse | null>(null);
  const [statusError,   setStatusError]   = useState<string | null>(null);
  const [statusLoaded,  setStatusLoaded]  = useState(false);
  const [passcodes,     setPasscodes]     = useState<Passcode[]>([]);
  const [companiesMap,  setCompaniesMap]  = useState<Record<string, string>>({});
  const [passcodesLoading, setPasscodesLoading] = useState(false);
  const [probesLoading, setProbesLoading] = useState(false);

  async function loadSettingsStatus(includeProbes = false) {
    const startedAt = performance.now();
    try {
      const res = await fetch(`/api/admin/settings/status${includeProbes ? '?include_probes=1' : ''}`, { credentials: 'same-origin', cache: 'no-store' });
      if (res.status === 401) { setSettingsStatus(null); setStatusLoaded(true); return; }
      const data = (await res.json()) as SettingsStatusResponse;
      setSettingsStatus(data);
      setStatusError(null);
      logClientTiming('settings.status.load', performance.now() - startedAt, { include_probes: includeProbes });
    } catch {
      setStatusError('Could not load integration status.');
    }
    setStatusLoaded(true);
  }

  async function loadIntegrationProbes() {
    setProbesLoading(true);
    await loadSettingsStatus(true);
    setProbesLoading(false);
  }

  async function loadPasscodes() {
    setPasscodesLoading(true);
    try {
      const [pcRes, coRes] = await Promise.all([
        fetch('/api/admin/passcodes', { credentials: 'same-origin' }),
        fetch('/api/companies', { credentials: 'same-origin' }),
      ]);
      if (pcRes.ok) {
        const d = await pcRes.json();
        setPasscodes(d.passcodes || []);
      }
      if (coRes.ok) {
        const d = await coRes.json();
        const map: Record<string, string> = {};
        for (const c of (d.companies || [])) map[c.id] = c.name;
        setCompaniesMap(map);
      }
    } catch { /* swallow */ }
    setPasscodesLoading(false);
  }

  useEffect(() => {
    loadSettingsStatus();
  }, []);

  useEffect(() => {
    if (settingsStatus?.auth.role === 'admin') {
      void loadIntegrationProbes();
      void loadPasscodes();
    }
    // intentionally only when auth flips to true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsStatus?.auth.authenticated]);

  async function runSync(type: string, endpoint: string) {
    if (settingsStatus?.auth.role !== 'admin') {
      setSyncStatus((prev) => ({ ...prev, [type]: 'Login required' }));
      return;
    }
    setLoading((prev) => ({ ...prev, [type]: true }));
    setSyncStatus((prev) => ({ ...prev, [type]: 'Running...' }));
    try {
      const res = await fetch(endpoint, { method: 'POST', credentials: 'same-origin' });
      const data = await res.json();
      let msg = '';
      if      (res.status === 401)                       msg = 'Login required';
      else if (res.status === 503)                       msg = data.error || 'Server config missing';
      else if (type === 'weekly-rollups' && data.status === 'success') msg = `Done · ${data.rollup_companies ?? 0}/${data.active_companies ?? 0} companies`;
      else if (data.status === 'success')                msg = `Done · ${data.records_processed ?? 0} records`;
      else if (data.status === 'partial')                msg = `Partial · ${data.records_processed ?? 0} records`;
      else if (data.status === 'skipped' || data.status === 'unavailable') msg = `Skipped · ${data.message || 'Unavailable'}`;
      else                                               msg = data.error || data.message || 'Failed';
      setSyncStatus((prev) => ({ ...prev, [type]: msg }));
      if (res.status === 401) await loadSettingsStatus();
    } catch (err) {
      setSyncStatus((prev) => ({ ...prev, [type]: `Request failed: ${String(err)}` }));
    }
    setLoading((prev) => ({ ...prev, [type]: false }));
  }

  const isAdmin = settingsStatus?.auth.role === 'admin';

  // While auth status is loading — show spinner, then redirect if not authenticated
  if (!statusLoaded) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="spinner" />
      </div>
    );
  }

  // Not an admin — send to the admin login page
  if (!isAdmin) {
    router.replace('/login?mode=admin&redirect=/admin/settings');
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="spinner" />
      </div>
    );
  }

  // Admin authenticated — full admin panel
  return (
    <PageShell>
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <h1 className="page-title">Settings</h1>
      </div>

      {/* Sync Card */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)', marginBottom: '1rem' }}>Data Sync</h2>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {syncButtons.map((btn, i) => (
            <div
              key={btn.type}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
                padding: '0.75rem 0',
                borderBottom: i < syncButtons.length - 1 ? '1px solid var(--border-muted)' : 'none',
              }}
            >
              <div>
                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{btn.label}</span>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.125rem' }}>
                  {syncStatus[btn.type] || btn.sub}
                </p>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                disabled={loading[btn.type]}
                onClick={() => runSync(btn.type, btn.endpoint)}
                style={{ flexShrink: 0 }}
              >
                {loading[btn.type] ? <><span className="spinner" />Syncing</> : 'Run'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Integration Status */}
      <div className="card">
        <h2 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.75rem' }}>Integration Status</h2>
        {statusError ? (
          <p style={{ fontSize: '0.875rem', color: 'var(--danger)' }}>{statusError}</p>
        ) : (
          <div>
            <IntegrationRow
              label="Supabase"
              configured={settingsStatus.integrations.supabase.configured}
              connected={!!settingsStatus.integrations.supabase.public_probe?.connected && !!settingsStatus.integrations.supabase.admin_probe?.connected}
              detail={settingsStatus.integrations.supabase.configured
                ? settingsStatus.integrations.supabase.public_probe && settingsStatus.integrations.supabase.admin_probe
                  ? `Public: ${settingsStatus.integrations.supabase.public_probe.connected ? '✓' : '✗'}  Admin: ${settingsStatus.integrations.supabase.admin_probe.connected ? '✓' : '✗'}`
                  : 'Probe pending'
                : 'Missing NEXT_PUBLIC_SUPABASE_URL or ANON_KEY'}
              message={settingsStatus.integrations.supabase.admin_probe?.message || settingsStatus.integrations.supabase.public_probe?.message}
            />
            <IntegrationRow
              label="Thinkific"
              configured={settingsStatus.integrations.thinkific.configured}
              connected={!!settingsStatus.integrations.thinkific.probe?.connected}
              detail={settingsStatus.integrations.thinkific.configured
                ? settingsStatus.integrations.thinkific.probe
                  ? settingsStatus.integrations.thinkific.probe.connected ? 'Live API' : `API failed (${settingsStatus.integrations.thinkific.probe.status ?? 'no response'})`
                  : 'Probe pending'
                : 'Missing THINKIFIC_API_KEY or THINKIFIC_SUBDOMAIN'}
              message={settingsStatus.integrations.thinkific.probe?.message}
            />
            <IntegrationRow
              label="Zoom"
              configured={settingsStatus.integrations.zoom.configured}
              connected={settingsStatus.integrations.zoom.configured}
              detail={settingsStatus.integrations.zoom.configured ? 'Credentials set' : 'Missing ZOOM_ACCOUNT_ID, CLIENT_ID, CLIENT_SECRET'}
            />
            {settingsStatus.data_health?.learner_rollups && (
              <IntegrationRow
                label="Learner Rollups"
                configured={settingsStatus.data_health.learner_rollups.relation_present}
                connected={settingsStatus.data_health.learner_rollups.healthy}
                detail={
                  settingsStatus.data_health.learner_rollups.relation_present
                    ? `${settingsStatus.data_health.learner_rollups.rollup_rows}/${settingsStatus.data_health.learner_rollups.active_learners} learner rows · ${settingsStatus.data_health.learner_rollups.companies_with_rollup_rows}/${settingsStatus.data_health.learner_rollups.companies_with_active_learners} companies`
                    : 'Rollup table missing'
                }
                message={settingsStatus.data_health.learner_rollups.message}
              />
            )}
            {settingsStatus.data_health?.weekly_rollups && (
              <IntegrationRow
                label="Weekly Rollups"
                configured={settingsStatus.data_health.weekly_rollups.relation_present}
                connected={settingsStatus.data_health.weekly_rollups.healthy}
                detail={
                  settingsStatus.data_health.weekly_rollups.relation_present
                    ? `${settingsStatus.data_health.weekly_rollups.rollup_companies}/${settingsStatus.data_health.weekly_rollups.active_companies} companies · week ${settingsStatus.data_health.weekly_rollups.week_start}`
                    : 'Rollup table missing'
                }
                message={settingsStatus.data_health.weekly_rollups.message}
              />
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
              <button className="btn btn-secondary btn-sm" onClick={loadIntegrationProbes} disabled={probesLoading}>
                {probesLoading ? <><span className="spinner" />Checking</> : 'Refresh connection checks'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Passcode Management */}
      <div className="card" style={{ marginTop: '1rem' }}>
        <div style={{ marginBottom: '0.75rem' }}>
          <h2 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)' }}>Company Passcode Management</h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Create passcodes that give companies access to their own dashboard. Each passcode is scoped to a single company and only allows access to that company&apos;s data.
          </p>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.125rem', fontStyle: 'italic' }}>
            Note: Admin login uses the server-side ADMIN_PASSCODE_SECRET environment variable, not this table.
          </p>
        </div>
        <PasscodeTable passcodes={passcodes} companies={companiesMap} onRefresh={loadPasscodes} />
      </div>
    </PageShell>
  );
}
