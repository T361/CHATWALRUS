import type { Alert } from '@/types/company';

export default function AlertBanner({ alerts }: { alerts: Alert[] }) {
  const openAlerts = alerts.filter((a) => a.status === 'open');
  if (openAlerts.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
      {openAlerts.map((alert) => (
        <div
          key={alert.id}
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '0.375rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            background: alert.severity === 'critical' ? '#fef2f2' : '#fffbeb',
            border: `1px solid ${alert.severity === 'critical' ? '#fecaca' : '#fde68a'}`,
          }}
        >
          <span style={{ fontSize: '1rem' }}>
            {alert.severity === 'critical' ? '🔴' : '⚠️'}
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827' }}>
              {alert.title}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
              {alert.message}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
