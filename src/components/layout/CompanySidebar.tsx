'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

function IconGrid()     { return <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="7" height="7" rx="1"/><rect x="11" y="2" width="7" height="7" rx="1"/><rect x="2" y="11" width="7" height="7" rx="1"/><rect x="11" y="11" width="7" height="7" rx="1"/></svg>; }
function IconUsers()    { return <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="7" cy="7" r="3"/><path d="M1 17c0-3.314 2.686-5 6-5"/><circle cx="14" cy="8" r="2.5"/><path d="M12 17c0-2.761 2.015-4 4.5-4S21 14.239 21 17"/></svg>; }
function IconTrophy()   { return <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 12v3M7 15h6"/><path d="M4 3h12v4a6 6 0 0 1-12 0V3z"/><path d="M4 5H2.5a1.5 1.5 0 0 0 1.5 1.5M16 5h1.5a1.5 1.5 0 0 1-1.5 1.5"/></svg>; }
function IconChart()    { return <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="3" height="6" rx="1"/><rect x="8.5" y="7" width="3" height="10" rx="1"/><rect x="14" y="4" width="3" height="13" rx="1"/></svg>; }
function IconNote()     { return <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h12v9l-4 4H4V4z"/><path d="M12 4v9h4"/></svg>; }
function IconCalendar() { return <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="16" height="14" rx="1.5"/><path d="M6 2v4M14 2v4M2 9h16"/></svg>; }
function IconCog()      { return <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="2.5"/><path d="M10 3v1.5M10 15.5V17M3 10h1.5M15.5 10H17M4.93 4.93l1.06 1.06M14.01 14.01l1.06 1.06M4.93 15.07l1.06-1.06M14.01 5.99l1.06-1.06"/></svg>; }
function IconDownload() { return <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3v10M6 9l4 4 4-4"/><path d="M3 15h14"/></svg>; }
function IconVideo()    { return <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="4" width="10" height="12" rx="1.5"/><path d="M12.5 8l5-3v10l-5-3z"/></svg>; }
function IconArrow()    { return <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13 3H3v14h14v-10"/><path d="M8 12L17 3"/><path d="M13 3h4v4"/></svg>; }

export default function CompanySidebar({ slug, companyName }: { slug: string; companyName?: string }) {
  const pathname = usePathname();

  const navItems = [
    { href: `/company/${slug}`,               label: 'Overview',      icon: <IconGrid />,     exact: true },
    { href: `/company/${slug}/learners`,      label: 'Learners',      icon: <IconUsers /> },
    { href: `/company/${slug}/leaderboard`,   label: 'Leaderboard',   icon: <IconTrophy /> },
    { href: `/company/${slug}/assessments`,   label: 'Assessments',   icon: <IconChart /> },
    { href: `/company/${slug}/sessions`,      label: 'Sessions',      icon: <IconVideo /> },
    { href: `/company/${slug}/interventions`, label: 'Interventions', icon: <IconNote /> },
    { href: `/company/${slug}/weekly`,        label: 'Weekly Report', icon: <IconCalendar /> },
    { href: `/company/${slug}/settings`,      label: 'Settings',      icon: <IconCog /> },
    { href: `/company/${slug}/export`,        label: 'Export',        icon: <IconDownload /> },
  ];

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + '/');
  }

  return (
    <aside style={{
      width: 200,
      flexShrink: 0,
      borderRight: '1px solid var(--border)',
      background: 'var(--bg-raised)',
      display: 'flex',
      flexDirection: 'column',
      padding: '1rem 0.625rem',
      gap: '2px',
      position: 'sticky',
      top: 54,
      height: 'calc(100vh - 54px)',
      overflowY: 'auto',
    }}>
      {/* Company name + back link */}
      <Link
        href="/"
        style={{
          display: 'flex', alignItems: 'center', gap: '0.375rem',
          padding: '0.375rem 0.5rem',
          borderRadius: 'var(--radius-sm)',
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
          textDecoration: 'none',
          marginBottom: '0.25rem',
          transition: 'color 120ms',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
      >
        <IconArrow />
        All Companies
      </Link>

      {companyName && (
        <div style={{
          padding: '0.375rem 0.5rem',
          fontSize: '0.8125rem',
          fontWeight: 700,
          color: 'var(--text)',
          marginBottom: '0.375rem',
          borderBottom: '1px solid var(--border-muted)',
          paddingBottom: '0.625rem',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {companyName}
        </div>
      )}

      {navItems.map(({ href, label, icon, exact }) => {
        const active = isActive(href, exact);
        return (
          <Link
            key={href}
            href={href}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.5rem 0.625rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.875rem',
              fontWeight: active ? 600 : 450,
              color: active ? 'var(--primary)' : 'var(--text-secondary)',
              background: active ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'transparent',
              textDecoration: 'none',
              transition: 'all 120ms',
              borderLeft: active ? '2px solid var(--primary)' : '2px solid transparent',
            }}
            onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = 'var(--surface-raised)'; e.currentTarget.style.color = 'var(--text)'; } }}
            onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; } }}
          >
            <span style={{ opacity: active ? 1 : 0.65, flexShrink: 0 }}>{icon}</span>
            {label}
          </Link>
        );
      })}
    </aside>
  );
}
