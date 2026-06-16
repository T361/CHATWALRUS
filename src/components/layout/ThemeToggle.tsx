'use client';

import { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('cw-theme') as 'dark' | 'light' | null;
      if (saved) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setTheme(saved);
        document.documentElement.setAttribute('data-theme', saved);
      }
    } catch { /* */ }
  }, []);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try { localStorage.setItem('cw-theme', next); } catch { /* */ }
    document.documentElement.setAttribute('data-theme', next);
  }

  const isLight = theme === 'light';

  return (
    <button
      onClick={toggle}
      title={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.375rem',
        padding: '0.375rem 0.5rem',
        borderRadius: 'var(--radius)',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--text-muted)',
        fontSize: '0.75rem',
        fontWeight: 500,
        transition: 'all 120ms',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.color = 'var(--text)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
    >
      {isLight ? (
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" style={{ flexShrink: 0 }}>
          <path d="M17.293 13.293A8 8 0 0 1 6.707 2.707a8.001 8.001 0 1 0 10.586 10.586z"/>
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" style={{ flexShrink: 0 }}>
          <circle cx="10" cy="10" r="3.5"/>
          <path d="M10 1.5V3M10 17v1.5M1.5 10H3M17 10h1.5M4.1 4.1l1.05 1.05M14.85 14.85l1.05 1.05M4.1 15.9l1.05-1.05M14.85 5.15l1.05-1.05"/>
        </svg>
      )}
      <span className="nav-sign-out-label" style={{ display: 'none' }}>
        {isLight ? 'Dark' : 'Light'}
      </span>
    </button>
  );
}
