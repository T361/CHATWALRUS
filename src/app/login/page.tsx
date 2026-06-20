'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [passcode, setPasscode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  async function login() {
    setAuthLoading(true);
    setAuthMessage(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });

      const data = await res.json();

      if (!res.ok) {
        setAuthMessage(data.error || 'Login failed');
      } else {
        setPasscode('');
        // Redirect to the intended destination or homepage
        const redirect = searchParams.get('redirect') || (data.redirect || '/');
        router.push(redirect);
      }
    } catch {
      setAuthMessage('Login request failed');
    }

    setAuthLoading(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && passcode) {
      void login();
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        padding: '1.5rem',
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: '400px',
          width: '100%',
          padding: '2rem',
          textAlign: 'center',
        }}
      >
        {/* Logo */}
        <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'center' }}>
          <Image
            src="/chatwalrus_logo.jpeg"
            alt="ChatWalrus"
            width={56}
            height={56}
            style={{ borderRadius: '8px' }}
          />
        </div>

        {/* Title */}
        <h1
          style={{
            fontSize: '1.25rem',
            fontWeight: 600,
            marginBottom: '0.5rem',
            color: 'var(--text)',
          }}
        >
          ChatWalrus
        </h1>
        <p
          style={{
            fontSize: '0.875rem',
            color: 'var(--text-muted)',
            marginBottom: '2rem',
          }}
        >
          CSM Dashboard
        </p>

        {/* Passcode Input */}
        <div style={{ textAlign: 'left', marginBottom: '1rem' }}>
          <label
            htmlFor="passcode"
            style={{
              display: 'block',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: '0.5rem',
            }}
          >
            Passcode
          </label>
          <input
            id="passcode"
            type={showPassword ? 'text' : 'password'}
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter your passcode"
            autoFocus
            style={{
              width: '100%',
              fontSize: '0.875rem',
            }}
          />

          {/* Show Password Toggle */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              marginTop: '0.5rem',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(e) => setShowPassword(e.target.checked)}
              style={{
                width: 13,
                height: 13,
                cursor: 'pointer',
                accentColor: 'var(--primary)',
              }}
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Show password
            </span>
          </label>
        </div>

        {/* Login Button */}
        <button
          className="btn btn-primary"
          disabled={authLoading || !passcode}
          onClick={login}
          style={{ width: '100%', marginTop: '0.5rem' }}
        >
          {authLoading ? 'Verifying...' : 'Log In'}
        </button>

        {/* Error Message */}
        {authMessage && (
          <p
            style={{
              fontSize: '0.75rem',
              color: 'var(--danger)',
              marginTop: '1rem',
              textAlign: 'center',
            }}
          >
            {authMessage}
          </p>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}
