'use client';

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
function IconSurvey({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="4" y="2" width="12" height="16" rx="1.5"/>
      <path d="M7 7h6M7 10h6M7 13h4"/>
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

// Subnav icons
function IconGrid()      { return <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="7" height="7" rx="1"/><rect x="11" y="2" width="7" height="7" rx="1"/><rect x="2" y="11" width="7" height="7" rx="1"/><rect x="11" y="11" width="7" height="7" rx="1"/></svg>; }
function IconUsers()     { return <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="7" cy="7" r="3"/><path d="M1 17c0-3.314 2.686-5 6-5"/><circle cx="14" cy="8" r="2.5"/><path d="M12 17c0-2.761 2.015-4 4.5-4S21 14.239 21 17"/></svg>; }
function IconChart()     { return <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="3" height="6" rx="1"/><rect x="8.5" y="7" width="3" height="10" rx="1"/><rect x="14" y="4" width="3" height="13" rx="1"/></svg>; }
function IconClipboard() { return <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="12" height="15" rx="1.5"/><path d="M8 3a2 2 0 0 1 4 0"/><path d="M7 9h6M7 13h4"/></svg>; }
function IconNote()      { return <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h12v9l-4 4H4V4z"/><path d="M12 4v9h4"/></svg>; }
function IconCalendar()  { return <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="16" height="14" rx="1.5"/><path d="M6 2v4M14 2v4M2 9h16"/></svg>; }
function IconCog()       { return <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="2.5"/><path d="M10 3v1.5M10 15.5V17M3 10h1.5M15.5 10H17M4.93 4.93l1.06 1.06M14.01 14.01l1.06 1.06M4.93 15.07l1.06-1.06M14.01 5.99l1.06-1.06"/></svg>; }
function IconDownload()  { return <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3v10M6 9l4 4 4-4"/><path d="M3 15h14"/></svg>; }
function IconTrophySm()  { return <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 12v3M7 15h6"/><path d="M4 3h12v4a6 6 0 0 1-12 0V3z"/><path d="M4 5H2.5a1.5 1.5 0 0 0 1.5 1.5M16 5h1.5a1.5 1.5 0 0 1-1.5 1.5"/></svg>; }

// ── Nav config ─────────────────────────────────────────────────────────────
const mainLinks = [
  { href: '/',               label: 'Companies',   icon: <IconBuilding />, exact: true },
  { href: '/leaderboard',    label: 'Leaderboard', icon: <IconTrophy /> },
  { href: '/admin/surveys',  label: 'Surveys',     icon: <IconSurvey /> },
  { href: '/admin/settings', label: 'Settings',    icon: <IconSettings /> },
];

const companySubLinks = (slug: string) => [
  { href: `/company/${slug}`,               label: 'Overview',      icon: <IconGrid />,      exact: true },
  { href: `/company/${slug}/learners`,      label: 'Learners',      icon: <IconUsers /> },
  { href: `/company/${slug}/leaderboard`,   label: 'Leaderboard',   icon: <IconTrophySm /> },
  { href: `/company/${slug}/assessments`,   label: 'Assessments',   icon: <IconChart /> },
  { href: `/company/${slug}/interventions`, label: 'Interventions', icon: <IconNote /> },
  { href: `/company/${slug}/weekly`,        label: 'Weekly Report', icon: <IconCalendar /> },
  { href: `/company/${slug}/settings`,      label: 'Settings',      icon: <IconCog /> },
  { href: `/company/${slug}/export`,        label: 'Export',        icon: <IconDownload /> },
];

// ── Component ─────────────────────────────────────────────────────────────
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
      {/* ── Primary nav ─────────────────────────────────────────────────── */}
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
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: 'linear-gradient(135deg, rgba(59,130,246,0.2) 0%, rgba(6,182,212,0.1) 100%)',
            border: '1px solid rgba(59,130,246,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M8 10C8 8.9 8.9 8 10 8H14C15.1 8 16 8.9 16 10V14C16 15.1 15.1 16 14 16H10C8.9 16 8 15.1 8 14V10Z" fill="var(--primary)"/>
              <circle cx="6" cy="12" r="1.5" fill="var(--cyan)"/>
              <circle cx="18" cy="12" r="1.5" fill="var(--cyan)"/>
            </svg>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
            <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text)', letterSpacing: '-0.02em' }}>ChatWalrus</span>
            <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' }}>CSM</span>
          </div>
        </Link>

        {/* Separator */}
        <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 0.25rem', flexShrink: 0 }} />

        {/* Main links */}
        <div style={{ display: 'flex', gap: '2px', flex: 1 }}>
          {mainLinks.map(({ href, label, icon, exact }) => {
            const active = isActive(href, exact);
            return (
              <Link key={href} href={href} style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.375rem 0.625rem',
                borderRadius: 'var(--radius)',
                fontSize: '0.8125rem',
                fontWeight: active ? 600 : 450,
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
                <span style={{ opacity: active ? 1 : 0.7 }}>{icon}</span>
                {label}
              </Link>
            );
          })}
        </div>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
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
            <span style={{ display: 'none' }} className="nav-sign-out-label">{signingOut ? 'Signing out…' : 'Sign out'}</span>
          </button>
        </div>
      </nav>

      {/* ── Company context subnav ─────────────────────────────────────── */}
      {companySlug && (
        <nav style={{
          height: 38,
          background: 'var(--bg)',
          borderBottom: '1px solid var(--border-muted)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 1.25rem',
          gap: '2px',
          overflowX: 'auto',
          scrollbarWidth: 'none',
        }}>
          {companySubLinks(companySlug).map(({ href, label, icon, exact }) => {
            const active = isActive(href, exact);
            return (
              <Link key={href} href={href} style={{
                display: 'flex', alignItems: 'center', gap: '0.3rem',
                padding: '0.1875rem 0.5rem',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.75rem',
                fontWeight: active ? 600 : 400,
                color: active ? 'var(--text)' : 'var(--text-muted)',
                background: active ? 'var(--surface)' : 'transparent',
                textDecoration: 'none',
                transition: 'all 120ms',
                whiteSpace: 'nowrap',
                borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
              }}
              onMouseEnter={(e) => { if (!active) { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'var(--surface-raised)'; }}}
              onMouseLeave={(e) => { if (!active) { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}}
              >
                <span style={{ opacity: active ? 1 : 0.6 }}>{icon}</span>
                {label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
