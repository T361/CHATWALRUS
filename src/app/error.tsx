'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: '2rem',
    }}>
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <p style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚠️</p>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.5rem' }}>
          Something went wrong
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
          {error.message || 'An unexpected error occurred.'}
          {error.digest && (
            <span style={{ display: 'block', fontSize: '0.75rem', marginTop: '0.25rem', opacity: 0.6 }}>
              ID: {error.digest}
            </span>
          )}
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button
            className="btn btn-primary"
            onClick={reset}
          >
            Try again
          </button>
          <a className="btn btn-secondary" href="/">Go home</a>
        </div>
      </div>
    </div>
  );
}
