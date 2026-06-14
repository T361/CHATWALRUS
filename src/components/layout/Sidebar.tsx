'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Icons as inline SVG snippets
function IconBuilding() {
  return (
    <svg className="sidebar-link-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="3" width="16" height="14" rx="1.5" />
      <path d="M7 17V10h6v7" />
      <path d="M2 8h16" />
    </svg>
  );
}
function IconChart() {
  return (
    <svg className="sidebar-link-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="11" width="3" height="6" rx="1" />
      <rect x="8.5" y="7" width="3" height="10" rx="1" />
      <rect x="14" y="4" width="3" height="13" rx="1" />
    </svg>
  );
}
function IconSettings() {
  return (
    <svg className="sidebar-link-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42" />
    </svg>
  );
}
function IconUsers() {
  return (
    <svg className="sidebar-link-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="7" cy="7" r="3" />
      <path d="M1 17c0-3.314 2.686-5 6-5" />
      <circle cx="14" cy="8" r="2.5" />
      <path d="M12 17c0-2.761 2.015-4 4.5-4S21 14.239 21 17" />
    </svg>
  );
}
function IconClipboard() {
  return (
    <svg className="sidebar-link-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="4" y="3" width="12" height="15" rx="1.5" />
      <path d="M8 3a2 2 0 0 1 4 0" />
      <path d="M7 9h6M7 13h4" />
    </svg>
  );
}
function IconDownload() {
  return (
    <svg className="sidebar-link-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M10 3v10M6 9l4 4 4-4" />
      <path d="M3 15h14" />
    </svg>
  );
}
function IconGrid() {
  return (
    <svg className="sidebar-link-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="2" width="7" height="7" rx="1" />
      <rect x="11" y="2" width="7" height="7" rx="1" />
      <rect x="2" y="11" width="7" height="7" rx="1" />
      <rect x="11" y="11" width="7" height="7" rx="1" />
    </svg>
  );
}

const globalLinks = [
  { href: '/',               label: 'Companies', icon: <IconBuilding />, exact: true },
  { href: '/admin/surveys',  label: 'Surveys',   icon: <IconChart /> },
  { href: '/admin/settings', label: 'Settings',  icon: <IconSettings /> },
];

const companySubLinks = (slug: string) => [
  { href: `/company/${slug}`,             label: 'Overview',    icon: <IconGrid /> },
  { href: `/company/${slug}/learners`,    label: 'Learners',    icon: <IconUsers /> },
  { href: `/company/${slug}/assessments`, label: 'Assessments', icon: <IconClipboard /> },
  { href: `/company/${slug}/export`,      label: 'Export',      icon: <IconDownload /> },
];

export default function Sidebar() {
  const pathname = usePathname();

  const companyMatch = pathname.match(/^\/company\/([^/]+)/);
  const companySlug  = companyMatch?.[1] ?? null;

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    // For company sub-pages, be more precise
    if (href.startsWith('/company/')) return pathname === href || pathname.startsWith(href + '/');
    return pathname.startsWith(href);
  }

  return (
    <aside className="sidebar">
      {/* Logo */}
      <Link href="/" className="sidebar-logo">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
          <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2Z" fill="var(--primary)" fillOpacity="0.15" />
          <path d="M8 10C8 8.9 8.9 8 10 8H14C15.1 8 16 8.9 16 10V14C16 15.1 15.1 16 14 16H10C8.9 16 8 15.1 8 14V10Z" fill="var(--primary)" />
          <circle cx="7" cy="12" r="1.5" fill="var(--cyan)" />
          <circle cx="17" cy="12" r="1.5" fill="var(--cyan)" />
        </svg>
        <span className="sidebar-logo-name">ChatWalrus</span>
      </Link>

      {/* Navigation */}
      <nav className="sidebar-nav">
        <span className="sidebar-section">Workspace</span>
        {globalLinks.map(({ href, label, icon, exact }) => (
          <Link
            key={href}
            href={href}
            className={`sidebar-link${isActive(href, exact) ? ' sidebar-link-active' : ''}`}
          >
            {icon}
            <span>{label}</span>
          </Link>
        ))}

        {/* Company context sub-nav */}
        {companySlug && (
          <>
            <div className="sidebar-divider" />
            <div className="sidebar-context">
              <span className="sidebar-context-label">Company</span>
            </div>
            {companySubLinks(companySlug).map(({ href, label, icon }) => (
              <Link
                key={href}
                href={href}
                className={`sidebar-link${isActive(href) ? ' sidebar-link-active' : ''}`}
              >
                {icon}
                <span>{label}</span>
              </Link>
            ))}
          </>
        )}
      </nav>
    </aside>
  );
}
