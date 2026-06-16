'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'Companies' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/admin/surveys', label: 'Surveys' },
  { href: '/admin/settings', label: 'Settings' },
];

export default function Navbar() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  }

  return (
    <nav style={{
      background: 'var(--bg-raised)',
      borderBottom: '1px solid var(--border)',
      padding: '0 1.5rem',
      height: '52px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 50,
      backdropFilter: 'blur(12px)',
    }}>
      <Link href="/" className="nav-brand">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
          <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2Z" fill="var(--primary)" fillOpacity="0.15"/>
          <path d="M8 10C8 8.9 8.9 8 10 8H14C15.1 8 16 8.9 16 10V14C16 15.1 15.1 16 14 16H10C8.9 16 8 15.1 8 14V10Z" fill="var(--primary)"/>
          <circle cx="7" cy="12" r="1.5" fill="var(--cyan)"/>
          <circle cx="17" cy="12" r="1.5" fill="var(--cyan)"/>
        </svg>
        <span className="nav-brand-name">ChatWalrus</span>
        <span className="nav-brand-sub">CSM Dashboard</span>
      </Link>

      <div style={{ display: 'flex', gap: '0.125rem', alignItems: 'center' }}>
        {links.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`nav-link${isActive(href) ? ' nav-link-active' : ''}`}
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
