'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useContext } from 'react';
import ThemeToggle from './ThemeToggle';
import { broadcastLogout } from './AuthSync';
import { AdminCompanyContext } from './AdminCompanyContext';

const NAV_ITEMS = [
  { key: '',              label: 'Overview',      exact: true },
  { key: 'learners',      label: 'Learners' },
  { key: 'courses',       label: 'Courses' },
  { key: 'leaderboard',   label: 'Leaderboard' },
  { key: 'assessments',   label: 'Assessments' },
  { key: 'sessions',      label: 'Sessions' },
  { key: 'interventions', label: 'Interventions' },
  { key: 'weekly',        label: 'Weekly' },
  { key: 'settings',      label: 'Settings' },
  { key: 'export',        label: 'Export' },
];

const ADMIN_LINKS = [
  { href: '/',               label: 'Companies',   exact: true },
  { href: '/learners',       label: 'Learners',    exact: false },
  { href: '/courses',        label: 'Courses',     exact: false },
  { href: '/leaderboard',    label: 'Leaderboard', exact: false },
  { href: '/admin/settings', label: 'Settings',    exact: false },
];

function slugToName(slug: string) {
  return slug.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function IconSignOut({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M13 3h4a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-4"/>
      <path d="M8 15l5-5-5-5"/><path d="M2 10h11"/>
    </svg>
  );
}


export default function CompanyTopNav({
  slug,
  companyName,
}: {
  slug: string;
  companyName?: string;
}) {
  const pathname = usePathname();
  const isAdmin = useContext(AdminCompanyContext);
  const [signingOut, setSigningOut] = useState(false);

  const displayName = companyName || slugToName(slug);

  function companyHref(key: string) {
    return key ? `/company/${slug}/${key}` : `/company/${slug}`;
  }

  function isCompanyNavActive(key: string, exact?: boolean) {
    const h = companyHref(key);
    if (exact) return pathname === h;
    return pathname === h || pathname.startsWith(h + '/');
  }

  function isAdminNavActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  }

  async function handleSignOut() {
    setSigningOut(true);
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    broadcastLogout();
    window.location.assign('/login');
  }

  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 50 }}>
      <nav style={{
        height: 54,
        background: 'var(--bg-raised)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 1rem',
        gap: '0.75rem',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        overflow: 'hidden',
      }}>

        {/* Brand */}
        <Link
          href={isAdmin ? '/' : `/company/${slug}`}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none', flexShrink: 0 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/chatwalrus_logo.jpeg"
            alt="ChatWalrus"
            style={{ display: 'block', width: 28, height: 28, borderRadius: 6, objectFit: 'contain', background: 'var(--primary)', flexShrink: 0 }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.background = 'var(--primary)'; (e.currentTarget as HTMLImageElement).style.opacity = '0.001'; }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
            <span style={{ fontWeight: 700, fontSize: '0.8125rem', color: 'var(--text)', letterSpacing: '-0.01em' }}>
              {isAdmin ? 'ChatWalrus' : displayName}
            </span>
            <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {isAdmin ? 'Admin' : 'CSM'}
            </span>
          </div>
        </Link>

        {/* Separator */}
        <div style={{ width: 1, height: 18, background: 'var(--border)', flexShrink: 0 }} />

        {/* Nav links — scrollable */}
        <div style={{
          display: 'flex',
          flex: 1,
          overflowX: 'auto',
          gap: '2px',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          alignItems: 'center',
        }}>
          <div className="company-top-nav-links" style={{ display: 'flex', gap: '2px', alignItems: 'center', flexWrap: 'nowrap' }}>
            {isAdmin ? (
              /* Admin: show global admin links */
              ADMIN_LINKS.map(({ href: adminHref, label, exact }) => {
                const active = isAdminNavActive(adminHref, exact);
                return (
                  <Link
                    key={adminHref}
                    href={adminHref}
                    style={{
                      display: 'inline-flex', alignItems: 'center',
                      padding: '0.375rem 0.75rem',
                      borderRadius: 'var(--radius)',
                      fontSize: '0.875rem',
                      fontWeight: active ? 700 : 500,
                      color: active ? 'var(--text)' : 'var(--text-secondary)',
                      background: active ? 'var(--surface)' : 'transparent',
                      textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
                      transition: 'all 120ms', opacity: active ? 1 : 0.85,
                    }}
                    onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = 'var(--surface-raised)'; e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.opacity = '1'; }}}
                    onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.opacity = '0.85'; }}}
                  >
                    {label}
                  </Link>
                );
              })
            ) : (
              /* Company user: show company-specific links */
              NAV_ITEMS.map(({ key, label, exact }) => {
                const active = isCompanyNavActive(key, exact);
                return (
                  <Link
                    key={key}
                    href={companyHref(key)}
                    style={{
                      display: 'inline-flex', alignItems: 'center',
                      padding: '0.375rem 0.75rem',
                      borderRadius: 'var(--radius)',
                      fontSize: '0.875rem',
                      fontWeight: active ? 700 : 500,
                      color: active ? 'var(--text)' : 'var(--text-secondary)',
                      background: active ? 'var(--surface)' : 'transparent',
                      textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
                      transition: 'all 120ms', opacity: active ? 1 : 0.85,
                    }}
                    onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = 'var(--surface-raised)'; e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.opacity = '1'; }}}
                    onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.opacity = '0.85'; }}}
                  >
                    {label}
                  </Link>
                );
              })
            )}
          </div>
        </div>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
          <ThemeToggle />
          <div style={{ width: 1, height: 18, background: 'var(--border)' }} />
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            title="Sign out"
            style={{
              display: 'flex', alignItems: 'center', gap: '0.375rem',
              padding: '0.375rem 0.625rem', borderRadius: 'var(--radius)',
              background: 'transparent', border: 'none', color: 'var(--text-muted)',
              fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer', transition: 'all 120ms', whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.color = 'var(--text)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <IconSignOut />
            <span className="company-nav-signout-label">
              {signingOut ? 'Signing out…' : 'Sign out'}
            </span>
          </button>
        </div>
      </nav>

      <style>{`
        .company-top-nav-links::-webkit-scrollbar { display: none; }
        @media (min-width: 640px) { .company-nav-signout-label { display: inline !important; } }
      `}</style>
    </header>
  );
}
