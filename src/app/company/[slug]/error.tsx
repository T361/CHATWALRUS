'use client';

export default function CompanyError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      padding: '2rem',
    }}>
      <div style={{ maxWidth: 380, textAlign: 'center' }}>
        <p style={{ fontSize: '1.75rem', marginBottom: '0.75rem' }}>⚠️</p>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.5rem' }}>
          Failed to load
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
          {error.message || 'This page ran into an error.'}
        </p>
        <button className="btn btn-primary btn-sm" onClick={reset}>
          Retry
        </button>
      </div>
    </div>
  );
}
