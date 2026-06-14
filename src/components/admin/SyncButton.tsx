'use client';

import { useState } from 'react';

interface SyncButtonProps {
  label: string;
  endpoint: string;
}

export default function SyncButton({ label, endpoint }: SyncButtonProps) {
  const [loading, setLoading] = useState(false);
  const [status,  setStatus]  = useState<string | null>(null);

  async function handleSync() {
    setLoading(true);
    setStatus('Running...');
    try {
      const res = await fetch(endpoint, { method: 'POST', credentials: 'same-origin' });
      const data = await res.json();
      if      (data.status === 'success')  setStatus(`Done · ${data.records_processed ?? 0} records`);
      else if (data.status === 'partial')  setStatus(`Partial · ${data.records_processed ?? 0} records`);
      else if (data.status === 'skipped')  setStatus(`Skipped · ${data.message || 'Unavailable'}`);
      else                                 setStatus(data.error || data.message || 'Failed');
    } catch (err) { setStatus(String(err)); }
    setLoading(false);
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0.75rem 0', borderBottom: '1px solid var(--border-muted)',
    }}>
      <div>
        <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{label}</span>
        {status && <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.125rem' }}>{status}</p>}
      </div>
      <button className="btn btn-secondary btn-sm" disabled={loading} onClick={handleSync}>
        {loading ? <><span className="spinner" />Syncing</> : 'Run'}
      </button>
    </div>
  );
}
