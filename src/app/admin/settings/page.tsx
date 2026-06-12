'use client';

import PageShell from '@/components/layout/PageShell';
import { useState } from 'react';

export default function AdminSettingsPage() {
  const [syncStatus, setSyncStatus] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  async function runSync(type: string, endpoint: string) {
    setLoading((prev) => ({ ...prev, [type]: true }));
    setSyncStatus((prev) => ({ ...prev, [type]: 'Running...' }));

    try {
      const res = await fetch(endpoint, { method: 'POST' });
      const data = await res.json();
      
      let statusMessageText = '';
      if (data.status === 'success') {
        statusMessageText = `✅ Done (${data.records_processed ?? 0} records)`;
      } else if (data.status === 'skipped' || data.status === 'unavailable') {
        statusMessageText = `⏭️ Skipped (${data.message || 'Unavailable'})`;
      } else {
         statusMessageText = `❌ ${data.error || data.message || 'Failed'}`;
      }

      setSyncStatus((prev) => ({
        ...prev,
        [type]: statusMessageText,
      }));
    } catch (err) {
      setSyncStatus((prev) => ({ ...prev, [type]: `❌ ${err}` }));
    }

    setLoading((prev) => ({ ...prev, [type]: false }));
  }

  const syncButtons = [
    { type: 'core', label: 'Import Core Data (Courses + Users)', endpoint: '/api/admin/sync/core' },
    { type: 'progress', label: 'Import Progress', endpoint: '/api/admin/sync/progress' },
    { type: 'assignments', label: 'Import Assignments from Thinkific (Endpoint Pending)', endpoint: '/api/admin/sync/assignments' },
    { type: 'surveys', label: 'Import Surveys from Thinkific (Endpoint Pending)', endpoint: '/api/admin/sync/surveys' },
    { type: 'zoom', label: 'Sync Zoom Attendance', endpoint: '/api/admin/sync/zoom' },
    { type: 'full', label: 'Full Sync (All)', endpoint: '/api/admin/sync/full' },
  ];

  return (
    <PageShell>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>Admin Settings</h1>

      {/* Data Management */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem' }}>Data Management</h2>
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

      {/* Integration Status */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem' }}>Integration Status</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <IntegrationRow label="Supabase" envHint="NEXT_PUBLIC_SUPABASE_URL" />
          <IntegrationRow label="Thinkific" envHint="THINKIFIC_API_KEY" />
          <IntegrationRow label="Zoom" envHint="ZOOM_ACCOUNT_ID" />
          <IntegrationRow label="Slack" envHint="SLACK_BOT_TOKEN" />
        </div>
      </div>

      {/* Passcode Management Placeholder */}
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

function IntegrationRow({ label, envHint }: { label: string; envHint: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.375rem 0' }}>
      <span style={{ fontSize: '0.875rem' }}>{label}</span>
      <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
        Requires {envHint}
      </span>
    </div>
  );
}
