'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import ThemeToggle from './ThemeToggle';
import { useState } from 'react';

// ── Icons ──────────────────────────────────────────────────────────────────
function IconBuilding({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="2" y="3" width="16" height="14" rx="1.5"/>
      <path d="M7 17V10h6v7"/><path d="M2 8h16"/>
    </svg>
  );
}
function IconTrophy({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M10 14v3M7 17h6"/><path d="M4 3h12v5a6 6 0 0 1-12 0V3z"/>
      <path d="M4 5H2a2 2 0 0 0 2 2M16 5h2a2 2 0 0 1-2 2"/>
    </svg>
  );
}
function IconUsers({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="7" cy="7" r="3"/><path d="M1 17c0-3.314 2.686-5 6-5"/><circle cx="14" cy="8" r="2.5"/><path d="M12 17c0-2.761 2.015-4 4.5-4S21 14.239 21 17"/>
    </svg>
  );
}
function IconBook({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M3 4a1 1 0 0 1 1-1h4a3 3 0 0 1 3 3v10a2 2 0 0 0-2-2H4a1 1 0 0 1-1-1V4z"/>
      <path d="M17 4a1 1 0 0 0-1-1h-4a3 3 0 0 0-3 3v10a2 2 0 0 1 2-2h4a1 1 0 0 0 1-1V4z"/>
    </svg>
  );
}
function IconSettings({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="10" cy="10" r="2.5"/>
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.93 4.93l1.41 1.41M13.66 13.66l1.41 1.41M4.93 15.07l1.41-1.41M13.66 6.34l1.41-1.41"/>
    </svg>
  );
}
function IconSignOut({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M13 3h4a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-4"/>
      <path d="M8 15l5-5-5-5"/><path d="M2 10h11"/>
    </svg>
  );
}
function IconMenu({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" style={{ flexShrink: 0 }}>
      <path d="M3 5h14M3 10h14M3 15h14"/>
    </svg>
  );
}
function IconClose({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" style={{ flexShrink: 0 }}>
      <path d="M4 4l12 12M16 4L4 16"/>
    </svg>
  );
}

// ── Nav config ─────────────────────────────────────────────────────────────
const mainLinks = [
  { href: '/',               label: 'Companies',   icon: <IconBuilding />, exact: true },
  { href: '/learners',       label: 'Learners',    icon: <IconUsers /> },
  { href: '/courses',        label: 'Courses',     icon: <IconBook /> },
  { href: '/leaderboard',    label: 'Leaderboard', icon: <IconTrophy /> },
  { href: '/admin/settings', label: 'Settings',    icon: <IconSettings /> },
];

// ── Component ─────────────────────────────────────────────────────────────
export default function TopNav() {
  const pathname = usePathname();
  const router   = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [menuOpen, setMenuOpen]     = useState(false);

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    if (href.startsWith('/company/')) return pathname === href || pathname.startsWith(href + '/');
    return pathname.startsWith(href);
  }

  async function handleSignOut() {
    setSigningOut(true);
    setMenuOpen(false);
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    // Hard navigation ensures the settings page fully remounts with a fresh auth check
    window.location.assign('/admin/settings');
  }

  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 50 }}>
      <nav style={{
        height: 54,
        background: 'var(--bg-raised)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 1.25rem',
        gap: '0.25rem',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}>
        {/* Brand */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none', marginRight: '0.875rem', flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/chatwalrus_logo.jpeg"
            alt="ChatWalrus"
            style={{ display: 'block', width: 28, height: 28, borderRadius: 6, objectFit: 'contain', background: 'white', flexShrink: 0 }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
            <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text)', letterSpacing: '-0.02em' }}>ChatWalrus</span>
            <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' }}>CSM</span>
          </div>
        </Link>

        {/* Desktop separator */}
        <div className="nav-sep-desktop" style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 0.25rem', flexShrink: 0 }} />

        {/* Desktop main links */}
        <div className="nav-links-desktop" style={{ display: 'flex', gap: '4px', flex: 1 }}>
          {mainLinks.map(({ href, label, icon, exact }) => {
            const active = isActive(href, exact);
            return (
              <Link key={href} href={href} style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.5rem 0.875rem',
                borderRadius: 'var(--radius)',
                fontSize: '0.9375rem',
                fontWeight: active ? 700 : 500,
                color: active ? 'var(--text)' : 'var(--text-secondary)',
                background: active ? 'var(--surface)' : 'transparent',
                textDecoration: 'none',
                transition: 'all 120ms',
                whiteSpace: 'nowrap',
                opacity: active ? 1 : 0.85,
              }}
              onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = 'var(--surface-raised)'; e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.opacity = '1'; }}}
              onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.opacity = '0.85'; }}}
              >
                <span style={{ opacity: active ? 1 : 0.7 }}>{React.cloneElement(icon as React.ReactElement<{ size?: number }>, { size: 17 })}</span>
                {label}
              </Link>
            );
          })}
        </div>

        {/* Desktop right side */}
        <div className="nav-right-desktop" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
          <ThemeToggle />
          <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 0.125rem' }} />
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            title="Sign out"
            style={{
              display: 'flex', alignItems: 'center', gap: '0.375rem',
              padding: '0.375rem 0.625rem',
              borderRadius: 'var(--radius)',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '0.75rem',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 120ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.color = 'var(--text)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <IconSignOut />
            <span className="nav-sign-out-label">{signingOut ? 'Signing out…' : 'Sign out'}</span>
          </button>
        </div>

        {/* Mobile: spacer + right controls */}
        <div className="nav-mobile-right" style={{ display: 'none', alignItems: 'center', gap: '0.375rem', marginLeft: 'auto', flexShrink: 0 }}>
          <ThemeToggle />
          <button
            onClick={() => setMenuOpen((v) => !v)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 36, height: 36, borderRadius: 'var(--radius)',
              background: 'transparent', border: 'none',
              color: 'var(--text-secondary)', cursor: 'pointer',
            }}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          >
            {menuOpen ? <IconClose /> : <IconMenu />}
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      {menuOpen && (
        <div
          style={{
            position: 'fixed', inset: '54px 0 0 0', zIndex: 49,
            background: 'var(--bg-raised)',
            borderTop: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column',
            padding: '1rem',
            gap: '2px',
            overflowY: 'auto',
          }}
          className="nav-mobile-drawer"
        >
          {mainLinks.map(({ href, label, icon, exact }) => {
            const active = isActive(href, exact);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.875rem 1rem',
                  borderRadius: 'var(--radius)',
                  fontSize: '1rem',
                  fontWeight: active ? 700 : 500,
                  color: active ? 'var(--primary)' : 'var(--text)',
                  background: active ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'transparent',
                  textDecoration: 'none',
                  borderLeft: active ? '3px solid var(--primary)' : '3px solid transparent',
                }}
              >
                {React.cloneElement(icon as React.ReactElement<{ size?: number }>, { size: 20 })}
                {label}
              </Link>
            );
          })}

          <div style={{ height: 1, background: 'var(--border)', margin: '0.75rem 0' }} />

          <button
            onClick={handleSignOut}
            disabled={signingOut}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '0.875rem 1rem',
              borderRadius: 'var(--radius)',
              background: 'transparent', border: 'none',
              color: 'var(--text-secondary)', fontSize: '1rem', fontWeight: 500,
              cursor: 'pointer', textAlign: 'left',
            }}
          >
            <IconSignOut size={20} />
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}
    </header>
  );
}
