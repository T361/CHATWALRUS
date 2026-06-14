'use client';

import PageShell from '@/components/layout/PageShell';
import { useEffect, useState } from 'react';

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
      public_probe: { connected: boolean; status: number | null; message: string | null };
      admin_probe:  { connected: boolean; status: number | null; message: string | null };
    };
    thinkific: {
      configured: boolean;
      probe: { connected: boolean; status: number | null; message: string | null };
    };
    zoom:  { configured: boolean };
    slack: { configured: boolean };
  };
}

const syncButtons = [
  { type: 'core',        label: 'Import Core Data',          sub: 'Courses + Users from Thinkific',    endpoint: '/api/admin/sync/core' },
  { type: 'progress',   label: 'Import Progress',            sub: 'Enrollment + completion data',      endpoint: '/api/admin/sync/progress' },
  { type: 'assignments',label: 'Import Assignments',         sub: 'Submissions from Thinkific',        endpoint: '/api/admin/sync/assignments' },
  { type: 'surveys',    label: 'Import Surveys',             sub: 'Ratings + feedback from Thinkific', endpoint: '/api/admin/sync/surveys' },
  { type: 'zoom',       label: 'Sync Zoom Attendance',       sub: 'Session attendance records',        endpoint: '/api/admin/sync/zoom' },
  { type: 'snapshots',  label: 'Create Daily Snapshots',     sub: 'Progress snapshots for trend charts', endpoint: '/api/admin/sync/snapshots' },
  { type: 'milestones', label: 'Run Milestone Checks',       sub: 'Learner statuses + risk alerts',    endpoint: '/api/jobs/run-milestones' },
  { type: 'full',       label: 'Full Sync',                  sub: 'Import all data from Thinkific',    endpoint: '/api/admin/sync/full' },
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
  const [syncStatus,    setSyncStatus]    = useState<Record<string, string>>({});
  const [loading,       setLoading]       = useState<Record<string, boolean>>({});
  const [settingsStatus,setSettingsStatus]= useState<SettingsStatusResponse | null>(null);
  const [statusError,   setStatusError]   = useState<string | null>(null);
  const [passcode,      setPasscode]      = useState('');
  const [authMessage,   setAuthMessage]   = useState<string | null>(null);
  const [authLoading,   setAuthLoading]   = useState(false);

  async function loadSettingsStatus() {
    try {
      const res = await fetch('/api/admin/settings/status', { credentials: 'same-origin', cache: 'no-store' });
      if (res.status === 401) { setSettingsStatus(null); return; }
      const data = (await res.json()) as SettingsStatusResponse;
      setSettingsStatus(data);
      setStatusError(null);
    } catch {
      setStatusError('Could not load integration status.');
    }
  }

  useEffect(() => { loadSettingsStatus(); }, []);

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
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });
      const data = await res.json();
      if (!res.ok) { setAuthMessage(data.error || 'Login failed'); }
      else { setAuthMessage('Session active'); setPasscode(''); await loadSettingsStatus(); }
    } catch { setAuthMessage('Login request failed'); }
    setAuthLoading(false);
  }

  async function logout() {
    setAuthLoading(true); setAuthMessage(null);
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
      setAuthMessage('Logged out');
      await loadSettingsStatus();
    } catch { setAuthMessage('Logout request failed'); }
    setAuthLoading(false);
  }

  const isAuthenticated = !!settingsStatus?.auth.authenticated;

  return (
    <PageShell>
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <h1 className="page-title">Settings</h1>
      </div>

      {/* Auth Card */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)' }}>Admin Access</h2>
          {isAuthenticated && <span className="badge badge-success">Active Session</span>}
        </div>

        {settingsStatus?.auth.configured === false ? (
          <p style={{ fontSize: '0.8125rem', color: 'var(--warning)' }}>
            Auth not configured — set APP_SESSION_SECRET and ADMIN_PASSCODE_SECRET.
          </p>
        ) : isAuthenticated ? (
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
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', minWidth: '240px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Admin Passcode</span>
              <input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && passcode && login()}
                placeholder="Enter passcode"
              />
            </label>
            <button className="btn btn-primary" disabled={authLoading || !passcode} onClick={login}>
              {authLoading ? 'Verifying...' : 'Log In'}
            </button>
          </div>
        )}

        {authMessage && (
          <p style={{ fontSize: '0.75rem', color: authMessage.includes('active') || authMessage.includes('Session') ? 'var(--success)' : 'var(--text-secondary)', marginTop: '0.75rem' }}>
            {authMessage}
          </p>
        )}
      </div>

      {/* Sync Card */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)' }}>Data Sync</h2>
          {!isAuthenticated && settingsStatus?.auth.configured !== false && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Login required to run syncs</span>
          )}
        </div>
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
        ) : !settingsStatus ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            <span className="spinner" />Loading...
          </div>
        ) : (
          <div>
            <IntegrationRow
              label="Supabase"
              configured={settingsStatus.integrations.supabase.configured}
              connected={settingsStatus.integrations.supabase.public_probe.connected && settingsStatus.integrations.supabase.admin_probe.connected}
              detail={settingsStatus.integrations.supabase.configured
                ? `Public: ${settingsStatus.integrations.supabase.public_probe.connected ? '✓' : '✗'}  Admin: ${settingsStatus.integrations.supabase.admin_probe.connected ? '✓' : '✗'}`
                : 'Missing NEXT_PUBLIC_SUPABASE_URL or ANON_KEY'}
              message={settingsStatus.integrations.supabase.admin_probe.message || settingsStatus.integrations.supabase.public_probe.message}
            />
            <IntegrationRow
              label="Thinkific"
              configured={settingsStatus.integrations.thinkific.configured}
              connected={settingsStatus.integrations.thinkific.probe.connected}
              detail={settingsStatus.integrations.thinkific.configured
                ? settingsStatus.integrations.thinkific.probe.connected ? 'Live API' : `API failed (${settingsStatus.integrations.thinkific.probe.status ?? 'no response'})`
                : 'Missing THINKIFIC_API_KEY or THINKIFIC_SUBDOMAIN'}
              message={settingsStatus.integrations.thinkific.probe.message}
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
          </div>
        )}
      </div>
    </PageShell>
  );
}
