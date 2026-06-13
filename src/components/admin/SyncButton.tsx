'use client';

import { useState } from 'react';

interface SyncButtonProps {
  label: string;
  endpoint: string;
}

export default function SyncButton({ label, endpoint }: SyncButtonProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function handleSync() {
    setLoading(true);
    setStatus('Running...');

    try {
      const res = await fetch(endpoint, { method: 'POST', credentials: 'same-origin' });
      const data = await res.json();
      if (data.status === 'success') {
        setStatus(`✅ Done (${data.records_processed ?? 0} records)`);
      } else if (data.status === 'partial') {
        setStatus(`Partial (${data.records_processed ?? 0} records): ${data.message || 'See sync details'}`);
      } else if (data.status === 'skipped') {
        setStatus(`Skipped (${data.message || 'Unavailable'})`);
      } else {
        setStatus(`${data.error || data.message || 'Failed'}`);
      }
    } catch (err) {
      setStatus(`${err}`);
    }

    setLoading(false);
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0.5rem 0', borderBottom: '1px solid #f3f4f6',
    }}>
      <div>
        <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{label}</span>
        {status && (
          <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.125rem' }}>{status}</p>
        )}
      </div>
      <button
        className="btn btn-primary"
        disabled={loading}
        onClick={handleSync}
        style={{ opacity: loading ? 0.6 : 1 }}
      >
        {loading ? 'Syncing...' : 'Run'}
      </button>
    </div>
  );
}
