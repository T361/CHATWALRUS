'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'Companies' },
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
      background: 'white',
      borderBottom: '1px solid #e5e7eb',
      padding: '0 1.5rem',
      height: '56px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 50,
    }}>
      <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ fontSize: '1.25rem' }}>🐋</span>
        <span style={{ fontWeight: 700, fontSize: '1rem', color: '#111827' }}>ChatWalrus</span>
        <span style={{ color: '#9ca3af', fontSize: '0.8125rem', fontWeight: 400, marginLeft: '0.125rem' }}>
          Engagement Dashboard
        </span>
      </Link>

      <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
        {links.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            style={{
              fontSize: '0.875rem',
              fontWeight: isActive(href) ? 600 : 400,
              color: isActive(href) ? '#111827' : '#6b7280',
              textDecoration: 'none',
              padding: '0.375rem 0.75rem',
              borderRadius: '0.375rem',
              background: isActive(href) ? '#f3f4f6' : 'transparent',
              transition: 'background 0.1s',
            }}
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
