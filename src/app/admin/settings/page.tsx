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
      public_probe: {
        connected: boolean;
        status: number | null;
        message: string | null;
      };
      admin_probe: {
        connected: boolean;
        status: number | null;
        message: string | null;
      };
    };
    thinkific: {
      configured: boolean;
      probe: {
        connected: boolean;
        status: number | null;
        message: string | null;
      };
    };
    zoom: {
      configured: boolean;
    };
    slack: {
      configured: boolean;
    };
  };
}

const syncButtons = [
  { type: 'core', label: 'Import Core Data (Courses + Users)', endpoint: '/api/admin/sync/core' },
  { type: 'progress', label: 'Import Progress', endpoint: '/api/admin/sync/progress' },
  { type: 'assignments', label: 'Import Assignments from Thinkific', endpoint: '/api/admin/sync/assignments' },
  { type: 'surveys', label: 'Import Surveys from Thinkific', endpoint: '/api/admin/sync/surveys' },
  { type: 'zoom', label: 'Sync Zoom Attendance', endpoint: '/api/admin/sync/zoom' },
  { type: 'full', label: 'Full Sync (All)', endpoint: '/api/admin/sync/full' },
];

export default function AdminSettingsPage() {
  const [syncStatus, setSyncStatus] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [settingsStatus, setSettingsStatus] = useState<SettingsStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [passcode, setPasscode] = useState('');
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  async function loadSettingsStatus() {
    try {
      const res = await fetch('/api/admin/settings/status', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const data = (await res.json()) as SettingsStatusResponse;
      setSettingsStatus(data);
      setStatusError(null);
    } catch {
      setStatusError('Could not load integration status.');
    }
  }

  useEffect(() => {
    loadSettingsStatus();
  }, []);

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

      let statusMessageText = '';
      if (res.status === 401) {
        statusMessageText = 'Login required';
      } else if (res.status === 503) {
        statusMessageText = data.error || 'Server-side configuration missing';
      } else if (data.status === 'success') {
        statusMessageText = `Done (${data.records_processed ?? 0} records)`;
      } else if (data.status === 'partial') {
        statusMessageText = `Partial (${data.records_processed ?? 0} records): ${data.message || 'See sync details'}`;
      } else if (data.status === 'skipped' || data.status === 'unavailable') {
        statusMessageText = `Skipped (${data.message || 'Unavailable'})`;
      } else {
        statusMessageText = data.error || data.message || 'Failed';
      }

      setSyncStatus((prev) => ({
        ...prev,
        [type]: statusMessageText,
      }));

      if (res.status === 401) {
        await loadSettingsStatus();
      }
    } catch (err) {
      setSyncStatus((prev) => ({ ...prev, [type]: `Request failed: ${String(err)}` }));
    }

    setLoading((prev) => ({ ...prev, [type]: false }));
  }

  async function login() {
    setAuthLoading(true);
    setAuthMessage(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ passcode }),
      });
      const data = await res.json();

      if (!res.ok) {
        setAuthMessage(data.error || 'Login failed');
      } else {
        setAuthMessage('Admin session active');
        setPasscode('');
        await loadSettingsStatus();
      }
    } catch {
      setAuthMessage('Login request failed');
    }

    setAuthLoading(false);
  }

  async function logout() {
    setAuthLoading(true);
    setAuthMessage(null);

    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });
      setAuthMessage('Logged out');
      await loadSettingsStatus();
    } catch {
      setAuthMessage('Logout request failed');
    }

    setAuthLoading(false);
  }

  const isAuthenticated = !!settingsStatus?.auth.authenticated;

  return (
    <PageShell>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>Admin Settings</h1>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem' }}>Admin Access</h2>

        {settingsStatus?.auth.configured === false ? (
          <p style={{ fontSize: '0.875rem', color: '#92400e' }}>
            Admin auth is not configured. Set `APP_SESSION_SECRET` and `ADMIN_PASSCODE_SECRET`.
          </p>
        ) : isAuthenticated ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
            <div>
              <p style={{ fontSize: '0.875rem', fontWeight: 500 }}>Logged in as admin</p>
              {settingsStatus?.auth.expires_at && (
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.125rem' }}>
                  Session expires at {new Date(settingsStatus.auth.expires_at).toLocaleString()}
                </p>
              )}
            </div>
            <button
              className="btn btn-primary"
              disabled={authLoading}
              onClick={logout}
              style={{ opacity: authLoading ? 0.6 : 1 }}
            >
              {authLoading ? 'Working...' : 'Log Out'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'end', gap: '0.75rem', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', minWidth: '260px' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Admin passcode</span>
              <input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Enter admin passcode"
                style={{
                  border: '1px solid #d1d5db',
                  borderRadius: '0.5rem',
                  padding: '0.625rem 0.75rem',
                  fontSize: '0.875rem',
                  background: 'white',
                }}
              />
            </label>
            <button
              className="btn btn-primary"
              disabled={authLoading || !passcode}
              onClick={login}
              style={{ opacity: authLoading || !passcode ? 0.6 : 1 }}
            >
              {authLoading ? 'Working...' : 'Log In'}
            </button>
          </div>
        )}

        {authMessage && (
          <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.75rem' }}>
            {authMessage}
          </p>
        )}
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem' }}>Data Management</h2>
        {!isAuthenticated && settingsStatus?.auth.configured !== false && (
          <p style={{ fontSize: '0.8125rem', color: '#92400e', marginBottom: '1rem' }}>
            Log in above to run protected sync actions from this page.
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {syncButtons.map((btn) => (
            <div key={btn.type} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #f3f4f6' }}>
              <div>
                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{btn.label}</span>
                {syncStatus[btn.type] && (
                  <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.125rem' }}>
                    {syncStatus[btn.type]}
                  </p>
                )}
              </div>
              <button
                className="btn btn-primary"
                disabled={loading[btn.type]}
                onClick={() => runSync(btn.type, btn.endpoint)}
                style={{ opacity: loading[btn.type] ? 0.6 : 1 }}
              >
                {loading[btn.type] ? 'Syncing...' : 'Run'}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem' }}>Integration Status</h2>
        {statusError ? (
          <p style={{ fontSize: '0.875rem', color: '#92400e' }}>{statusError}</p>
        ) : !settingsStatus ? (
          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>Loading integration status...</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <IntegrationRow
              label="Supabase"
              configured={settingsStatus.integrations.supabase.configured}
              connected={
                settingsStatus.integrations.supabase.public_probe.connected &&
                settingsStatus.integrations.supabase.admin_probe.connected
              }
              detail={
                settingsStatus.integrations.supabase.configured
                  ? [
                      `Public probe: ${
                        settingsStatus.integrations.supabase.public_probe.connected
                          ? 'connected'
                          : settingsStatus.integrations.supabase.public_probe.status
                            ? `failed (${settingsStatus.integrations.supabase.public_probe.status})`
                            : 'not reachable'
                      }`,
                      `Admin probe: ${
                        settingsStatus.integrations.supabase.admin_probe.connected
                          ? 'connected'
                          : settingsStatus.integrations.supabase.admin_probe.status
                            ? `failed (${settingsStatus.integrations.supabase.admin_probe.status})`
                            : 'not reachable'
                      }`,
                    ].join(' • ')
                  : 'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY'
              }
              message={
                settingsStatus.integrations.supabase.admin_probe.message ||
                settingsStatus.integrations.supabase.public_probe.message
              }
            />
            <IntegrationRow
              label="Thinkific"
              configured={settingsStatus.integrations.thinkific.configured}
              connected={settingsStatus.integrations.thinkific.probe.connected}
              detail={
                settingsStatus.integrations.thinkific.configured
                  ? settingsStatus.integrations.thinkific.probe.connected
                    ? 'Live API connected'
                    : settingsStatus.integrations.thinkific.probe.status
                      ? `Live API failed (${settingsStatus.integrations.thinkific.probe.status})`
                      : 'Live API not reachable'
                  : 'Missing THINKIFIC_API_KEY or THINKIFIC_SUBDOMAIN'
              }
              message={settingsStatus.integrations.thinkific.probe.message}
            />
            <IntegrationRow
              label="Zoom"
              configured={settingsStatus.integrations.zoom.configured}
              connected={settingsStatus.integrations.zoom.configured}
              detail={
                settingsStatus.integrations.zoom.configured
                  ? 'Configured'
                  : 'Missing ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, or ZOOM_CLIENT_SECRET'
              }
            />
            <IntegrationRow
              label="Slack"
              configured={settingsStatus.integrations.slack.configured}
              connected={settingsStatus.integrations.slack.configured}
              detail={
                settingsStatus.integrations.slack.configured
                  ? 'Configured'
                  : 'Missing SLACK_BOT_TOKEN'
              }
            />
          </div>
        )}
      </div>

      <div className="card">
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem' }}>Passcode Management</h2>
        <p style={{ fontSize: '0.8125rem', color: '#6b7280' }}>
          Passcode management allows you to create and manage access codes for CSMs and admins.
          This feature will be available once the authentication layer is connected.
        </p>
      </div>
    </PageShell>
  );
}

function IntegrationRow({
  label,
  configured,
  connected,
  detail,
  message,
}: {
  label: string;
  configured: boolean;
  connected: boolean;
  detail: string;
  message?: string | null;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '0.375rem 0' }}>
      <span style={{ fontSize: '0.875rem' }}>{label}</span>
      <div style={{ textAlign: 'right' }}>
        <span
          style={{
            fontSize: '0.75rem',
            color: !configured ? '#9ca3af' : connected ? '#166534' : '#92400e',
            display: 'block',
          }}
        >
          {!configured
            ? detail
            : connected
              ? `Configured and connected: ${detail}`
              : `Configured but not connected: ${detail}`}
        </span>
        {message && configured && !connected && (
          <span style={{ fontSize: '0.75rem', color: '#9ca3af', display: 'block', marginTop: '0.125rem' }}>
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
