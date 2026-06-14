'use client';

import { useState } from 'react';
import type { Alert } from '@/types/company';

export default function AlertBanner({ alerts }: { alerts: Alert[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<string | null>(null);

  const visible = alerts.filter((a) => a.status === 'open' && !dismissed.has(a.id));
  if (visible.length === 0) return null;

  async function patch(id: string, action: 'review' | 'action') {
    setLoading(id + action);
    try {
      await fetch(`/api/alerts/${id}/${action}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewed_by: 'admin' }),
      });
      setDismissed((prev) => new Set([...prev, id]));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
      {visible.map((alert) => (
        <div
          key={alert.id}
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '0.375rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
            background: alert.severity === 'critical' ? '#fef2f2' : '#fffbeb',
            border: `1px solid ${alert.severity === 'critical' ? '#fecaca' : '#fde68a'}`,
          }}
        >
          <span style={{ fontSize: '1rem', marginTop: '2px' }}>
            {alert.severity === 'critical' ? '🔴' : '⚠️'}
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827' }}>
              {alert.title}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.125rem' }}>
              {alert.message}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
            <button
              onClick={() => patch(alert.id, 'review')}
              disabled={loading === alert.id + 'review'}
              style={{
                fontSize: '0.75rem',
                padding: '0.25rem 0.625rem',
                borderRadius: '0.25rem',
                border: '1px solid #d1d5db',
                background: '#fff',
                cursor: 'pointer',
                color: '#374151',
                opacity: loading === alert.id + 'review' ? 0.5 : 1,
              }}
            >
              {loading === alert.id + 'review' ? '...' : 'Reviewed'}
            </button>
            <button
              onClick={() => patch(alert.id, 'action')}
              disabled={loading === alert.id + 'action'}
              style={{
                fontSize: '0.75rem',
                padding: '0.25rem 0.625rem',
                borderRadius: '0.25rem',
                border: 'none',
                background: alert.severity === 'critical' ? '#dc2626' : '#d97706',
                cursor: 'pointer',
                color: '#fff',
                opacity: loading === alert.id + 'action' ? 0.5 : 1,
              }}
            >
              {loading === alert.id + 'action' ? '...' : 'Actioned'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
