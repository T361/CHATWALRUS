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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/chatwalrus_logo.jpeg"
          alt="ChatWalrus"
          width={28}
          height={28}
          style={{ flexShrink: 0, borderRadius: '4px' }}
          loading="eager"
        />
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
