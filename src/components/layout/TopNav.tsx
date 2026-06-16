'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import ThemeToggle from './ThemeToggle';
import { useState } from 'react';

const mainLinks = [
  { href: '/',               label: 'Companies',    exact: true },
  { href: '/leaderboard',    label: 'Leaderboard' },
  { href: '/admin/surveys',  label: 'Surveys' },
  { href: '/admin/settings', label: 'Settings' },
];

const companySubLinks = (slug: string) => [
  { href: `/company/${slug}`,                label: 'Overview',       exact: true },
  { href: `/company/${slug}/learners`,       label: 'Learners' },
  { href: `/company/${slug}/leaderboard`,    label: 'Leaderboard' },
  { href: `/company/${slug}/assessments`,    label: 'Assessments' },
  { href: `/company/${slug}/interventions`,  label: 'Interventions' },
  { href: `/company/${slug}/weekly`,         label: 'Weekly Report' },
  { href: `/company/${slug}/settings`,       label: 'Settings' },
  { href: `/company/${slug}/export`,         label: 'Export' },
];

export default function TopNav() {
  const pathname = usePathname();
  const router   = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const companyMatch = pathname.match(/^\/company\/([^/]+)/);
  const companySlug  = companyMatch?.[1] ?? null;

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    if (href.startsWith('/company/')) return pathname === href || pathname.startsWith(href + '/');
    return pathname.startsWith(href);
  }

  async function handleSignOut() {
    setSigningOut(true);
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    router.push('/admin/settings');
  }

  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 50 }}>
      {/* ── Primary nav ── */}
      <nav style={{
        height: 52,
        background: 'var(--bg-raised)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 1.5rem',
        gap: '0.25rem',
        backdropFilter: 'blur(12px)',
      }}>
        {/* Brand */}
        <Link href="/" style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          textDecoration: 'none', marginRight: '1.25rem', flexShrink: 0,
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2Z"
              fill="var(--primary)" fillOpacity="0.15" />
            <path d="M8 10C8 8.9 8.9 8 10 8H14C15.1 8 16 8.9 16 10V14C16 15.1 15.1 16 14 16H10C8.9 16 8 15.1 8 14V10Z"
              fill="var(--primary)" />
            <circle cx="7" cy="12" r="1.5" fill="var(--cyan)" />
            <circle cx="17" cy="12" r="1.5" fill="var(--cyan)" />
          </svg>
          <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text)', letterSpacing: '-0.015em' }}>
            ChatWalrus
          </span>
          <span style={{
            color: 'var(--text-muted)', fontSize: '0.6875rem', fontWeight: 400,
            paddingLeft: '0.5rem', borderLeft: '1px solid var(--border)', marginLeft: '0.25rem',
          }}>
            CSM
          </span>
        </Link>

        {/* Main links */}
        <div style={{ display: 'flex', gap: '0.125rem', flex: 1 }}>
          {mainLinks.map(({ href, label, exact }) => (
            <Link
              key={href}
              href={href}
              style={{
                padding: '0.375rem 0.75rem',
                borderRadius: 'var(--radius)',
                fontSize: '0.8125rem',
                fontWeight: isActive(href, exact) ? 600 : 500,
                color: isActive(href, exact) ? 'var(--text)' : 'var(--text-secondary)',
                background: isActive(href, exact) ? 'var(--surface)' : 'transparent',
                textDecoration: 'none',
                transition: 'all 120ms',
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          <ThemeToggle />
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            style={{
              padding: '0.375rem 0.625rem',
              borderRadius: 'var(--radius)',
              background: 'none',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
              fontSize: '0.75rem',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '0.375rem',
              transition: 'all 120ms',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--text)';
              e.currentTarget.style.borderColor = 'var(--border-accent)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-muted)';
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
          >
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M13 3h4a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-4" />
              <path d="M8 15l5-5-5-5" />
              <path d="M2 10h11" />
            </svg>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </nav>

      {/* ── Company context subnav ── */}
      {companySlug && (
        <nav style={{
          height: 40,
          background: 'var(--bg)',
          borderBottom: '1px solid var(--border-muted)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 1.5rem',
          gap: '0.125rem',
          overflowX: 'auto',
        }}>
          {companySubLinks(companySlug).map(({ href, label, exact }) => (
            <Link
              key={href}
              href={href}
              style={{
                padding: '0.25rem 0.625rem',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.75rem',
                fontWeight: isActive(href, exact) ? 600 : 400,
                color: isActive(href, exact) ? 'var(--text)' : 'var(--text-secondary)',
                background: isActive(href, exact) ? 'var(--surface)' : 'transparent',
                textDecoration: 'none',
                transition: 'all 120ms',
                whiteSpace: 'nowrap',
                borderBottom: isActive(href, exact) ? '2px solid var(--primary)' : '2px solid transparent',
              }}
            >
              {label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
