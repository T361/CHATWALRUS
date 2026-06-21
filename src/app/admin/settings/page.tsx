'use client';

import PageShell from '@/components/layout/PageShell';
import PasscodeTable from '@/components/admin/PasscodeTable';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Passcode } from '@/types/alert';
import { logClientTiming } from '@/lib/perf-client';

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 10s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7z"/><circle cx="10" cy="10" r="3"/>
    </svg>
  );
}
function EyeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3l14 14M8.5 8.6A3 3 0 0 0 13 13.4"/><path d="M6 5.3C3.6 6.8 2 9 2 10s3 7 8 7c1.5 0 2.9-.4 4-1.1M10 3c5 0 8 6 8 7 0 .5-.4 1.5-1.1 2.6"/>
    </svg>
  );
}

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
    slack: { configured: boolean };
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
    surveys: {
      relation_present: boolean;
      stored_reviews: number;
      latest_sync_status: string | null;
      latest_records_processed: number;
      latest_completed_at: string | null;
      upstream_reviews_found: number;
      endpoint_errors: number;
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
  { type: 'surveys',        label: 'Import Survey Reviews',    sub: 'Thinkific course_reviews; may return zero if no upstream reviews exist',         endpoint: '/api/admin/sync/surveys' },
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
  const [passcode,      setPasscode]      = useState('');
  const [showPassword,  setShowPassword]  = useState(false);
  const [authMessage,   setAuthMessage]   = useState<string | null>(null);
  const [authLoading,   setAuthLoading]   = useState(false);
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
    if (settingsStatus?.auth.authenticated) {
      void loadIntegrationProbes();
      void loadPasscodes();
    }
    // intentionally only when auth flips to true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsStatus?.auth.authenticated]);

  async function runSync(type: string, endpoint: string) {
    if (!settingsStatus?.auth.authenticated) {
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

  async function login() {
    setAuthLoading(true); setAuthMessage(null);
    const startedAt = performance.now();
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });
      const data = await res.json();
      if (!res.ok) { setAuthMessage(data.error || 'Login failed'); }
      else {
        setPasscode('');
        logClientTiming('settings.login.submit', performance.now() - startedAt);
        const redirect = new URLSearchParams(window.location.search).get('redirect');
        if (redirect) {
          router.push(redirect);
        } else {
          // Stay on settings — load the full admin panel in place
          await loadSettingsStatus();
          void loadIntegrationProbes();
          void loadPasscodes();
        }
      }
    } catch { setAuthMessage('Login request failed'); }
    setAuthLoading(false);
  }

  async function logout() {
    setAuthLoading(true); setAuthMessage(null);
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
      // Immediately reflect logged-out state — no second status fetch needed
      setSettingsStatus(prev =>
        prev ? { ...prev, auth: { ...prev.auth, authenticated: false, role: null, expires_at: null } } : null
      );
      setPasscodes([]);
    } catch { setAuthMessage('Logout request failed'); }
    setAuthLoading(false);
  }

  const isAuthenticated = !!settingsStatus?.auth.authenticated;

  // While auth status is loading — show nothing (prevents flash of full admin panel)
  if (!statusLoaded) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="spinner" />
      </div>
    );
  }

  // Not authenticated — show only the centered login card
  if (!isAuthenticated) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)', padding: '1.5rem',
      }}>
        <div className="card" style={{ width: '100%', maxWidth: '360px', padding: '2rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h1 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--text)', margin: '0 0 0.375rem' }}>
              ChatWalrus
            </h1>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: 0 }}>Admin access</p>
          </div>

          {settingsStatus?.auth.configured === false ? (
            <p style={{ fontSize: '0.8125rem', color: 'var(--warning)' }}>
              Auth not configured — set APP_SESSION_SECRET and ADMIN_PASSCODE_SECRET.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && passcode && login()}
                  placeholder="Passcode"
                  style={{ width: '100%', paddingRight: '2.5rem' }}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  style={{
                    position: 'absolute', right: '0.625rem', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', padding: '0.25rem', lineHeight: 1, display: 'flex',
                  }}
                  aria-label={showPassword ? 'Hide' : 'Show'}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>

              {authMessage && (
                <p style={{ fontSize: '0.75rem', color: 'var(--danger)', margin: 0 }}>{authMessage}</p>
              )}

              <button
                className="btn btn-primary"
                disabled={authLoading || !passcode}
                onClick={login}
                style={{ width: '100%' }}
              >
                {authLoading ? 'Verifying...' : 'Sign In'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Authenticated — full admin panel
  return (
    <PageShell>
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <h1 className="page-title">Settings</h1>
      </div>

      {/* Auth Card — session info + logout */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <h2 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)' }}>Admin Access</h2>
          <span className="badge badge-success">Active Session</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            <p style={{ fontSize: '0.875rem', fontWeight: 500 }}>Logged in as admin</p>
            {settingsStatus?.auth.expires_at && (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.125rem' }}>
                Expires {new Date(settingsStatus.auth.expires_at).toLocaleString()}
              </p>
            )}
          </div>
          <button className="btn btn-secondary btn-sm" disabled={authLoading} onClick={logout}>
            {authLoading ? 'Working...' : 'Log Out'}
          </button>
        </div>
        {authMessage && (
          <p style={{ fontSize: '0.75rem', color: authMessage === 'Logged out' ? 'var(--warning)' : 'var(--danger)', marginTop: '0.75rem' }}>
            {authMessage}
          </p>
        )}
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
            <IntegrationRow
              label="Slack"
              configured={settingsStatus.integrations.slack.configured}
              connected={settingsStatus.integrations.slack.configured}
              detail={settingsStatus.integrations.slack.configured ? 'Bot token set' : 'Missing SLACK_BOT_TOKEN'}
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
            {settingsStatus.data_health?.surveys && (
              <IntegrationRow
                label="Survey Reviews"
                configured={settingsStatus.data_health.surveys.relation_present}
                connected={settingsStatus.data_health.surveys.healthy}
                detail={
                  settingsStatus.data_health.surveys.stored_reviews > 0
                    ? `${settingsStatus.data_health.surveys.stored_reviews} stored reviews`
                    : `${settingsStatus.data_health.surveys.upstream_reviews_found} upstream reviews · ${settingsStatus.data_health.surveys.endpoint_errors} endpoint errors`
                }
                message={settingsStatus.data_health.surveys.message}
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
