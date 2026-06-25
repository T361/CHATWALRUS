'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function EyeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 10s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7z"/><circle cx="10" cy="10" r="3"/>
    </svg>
  );
}
function EyeOffIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3l14 14M8.5 8.6A3 3 0 0 0 13 13.4"/><path d="M6 5.3C3.6 6.8 2 9 2 10s3 7 8 7c1.5 0 2.9-.4 4-1.1M10 3c5 0 8 6 8 7 0 .5-.4 1.5-1.1 2.6"/>
    </svg>
  );
}

type Mode = 'company' | 'admin';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode: Mode = searchParams.get('mode') === 'admin' ? 'admin' : 'company';

  const [mode, setMode]               = useState<Mode>(initialMode);
  const [passcode, setPasscode]       = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [loading, setLoading]         = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setPasscode('');
    setError(null);
  }

  async function login() {
    if (!passcode || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode, mode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Invalid passcode');
      } else {
        // API response includes a redirect field; honour any ?redirect= param too
        const redirectParam = searchParams.get('redirect');
        const destination   = redirectParam || data.redirect || (mode === 'admin' ? '/admin/settings' : '/');
        router.push(destination);
      }
    } catch {
      setError('Request failed — please try again');
    }
    setLoading(false);
  }

  const isCompany = mode === 'company';

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: '2rem',
    }}>
      <div className="card" style={{ width: '100%', maxWidth: '540px', padding: '3rem 3.5rem' }}>

        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: '2.25rem' }}>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--text)', margin: '0 0 0.5rem' }}>
            ChatWalrus
          </h1>
          <p style={{ fontSize: '0.9375rem', color: 'var(--text-muted)', margin: 0 }}>
            {isCompany ? 'CSM Dashboard' : 'Admin Dashboard'}
          </p>
        </div>

        {/* Mode tabs */}
        <div style={{
          display: 'flex', borderRadius: 10,
          border: '1px solid var(--border)', overflow: 'hidden',
          marginBottom: '2rem',
        }}>
          {([['company', 'Company'] as const, ['admin', 'Admin'] as const]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => switchMode(key)}
              style={{
                flex: 1, padding: '0.75rem 0.5rem',
                border: 'none', cursor: 'pointer',
                fontSize: '0.9375rem', fontWeight: 700,
                background: mode === key ? 'var(--primary)' : 'transparent',
                color: mode === key ? 'white' : 'var(--text-muted)',
                transition: 'all 150ms',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Passcode field */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{
            display: 'block', fontSize: '0.75rem', fontWeight: 700,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            color: 'var(--text-muted)', marginBottom: '0.625rem',
          }}>
            {isCompany ? 'Company Passcode' : 'Admin Passcode'}
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && login()}
              placeholder={isCompany ? 'Enter your company passcode' : 'Enter admin passcode'}
              autoFocus
              style={{ width: '100%', paddingRight: '2.75rem', fontSize: '1rem', padding: '0.75rem 2.75rem 0.75rem 0.875rem', height: 'auto' }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              style={{
                position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', padding: '0.25rem', lineHeight: 1, display: 'flex',
              }}
              aria-label={showPassword ? 'Hide' : 'Show'}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <p style={{ fontSize: '0.8125rem', color: 'var(--danger)', margin: '0 0 0.875rem' }}>
            {error}
          </p>
        )}

        {/* Submit */}
        <button
          className="btn btn-primary"
          disabled={loading || !passcode}
          onClick={login}
          style={{ width: '100%', padding: '0.875rem', fontSize: '1rem', fontWeight: 700, marginTop: '0.25rem' }}
        >
          {loading ? 'Verifying...' : 'Log In'}
        </button>

        {/* Hint */}
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '1.25rem' }}>
          {isCompany
            ? 'Use the passcode provided by your ChatWalrus admin'
            : 'Internal access only'}
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <span className="spinner" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
