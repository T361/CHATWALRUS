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
      const res = await fetch(`/api/alerts/${id}/${action}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewed_by: 'admin' }),
      });
      if (!res.ok) {
        console.error(`[AlertBanner] Failed to ${action} alert ${id}: ${res.status}`);
        return;
      }
      setDismissed((prev) => new Set([...prev, id]));
    } catch (err) {
      console.error(`[AlertBanner] Network error for alert ${id}:`, err);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
      {visible.map((alert) => {
        const isCritical = alert.severity === 'critical';
        return (
          <div
            key={alert.id}
            className="alert-row"
            style={{
              '--alert-accent': isCritical ? 'var(--danger)' : 'var(--warning)',
              '--alert-bg': isCritical ? 'var(--danger-bg)' : 'var(--warning-bg)',
              '--alert-border': isCritical ? 'rgba(248,113,113,0.2)' : 'rgba(245,158,11,0.2)',
            } as React.CSSProperties}
          >
            <span className="alert-dot" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="alert-title">{alert.title}</div>
              <div className="alert-message">{alert.message}</div>
            </div>
            <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }}>
              <button
                onClick={() => patch(alert.id, 'review')}
                disabled={loading === alert.id + 'review'}
                className="btn btn-ghost btn-xs"
              >
                {loading === alert.id + 'review' ? <span className="spinner" style={{ width: '0.75rem', height: '0.75rem' }} /> : 'Reviewed'}
              </button>
              <button
                onClick={() => patch(alert.id, 'action')}
                disabled={loading === alert.id + 'action'}
                className="btn btn-xs"
                style={{
                  background: isCritical ? 'rgba(248,113,113,0.12)' : 'rgba(245,158,11,0.12)',
                  color: isCritical ? 'var(--danger)' : 'var(--warning)',
                  border: `1px solid ${isCritical ? 'rgba(248,113,113,0.3)' : 'rgba(245,158,11,0.3)'}`,
                }}
              >
                {loading === alert.id + 'action' ? <span className="spinner" style={{ width: '0.75rem', height: '0.75rem' }} /> : 'Actioned'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
