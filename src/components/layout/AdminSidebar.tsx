'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React from 'react';

function IconBuilding({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="2" y="3" width="16" height="14" rx="1.5"/>
      <path d="M7 17V10h6v7"/><path d="M2 8h16"/>
    </svg>
  );
}
function IconUsers({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="7" cy="7" r="3"/><path d="M1 17c0-3.314 2.686-5 6-5"/><circle cx="14" cy="8" r="2.5"/><path d="M12 17c0-2.761 2.015-4 4.5-4S21 14.239 21 17"/>
    </svg>
  );
}
function IconBook({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M3 4a1 1 0 0 1 1-1h4a3 3 0 0 1 3 3v10a2 2 0 0 0-2-2H4a1 1 0 0 1-1-1V4z"/>
      <path d="M17 4a1 1 0 0 0-1-1h-4a3 3 0 0 0-3 3v10a2 2 0 0 1 2-2h4a1 1 0 0 0 1-1V4z"/>
    </svg>
  );
}
function IconTrophy({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M10 14v3M7 17h6"/><path d="M4 3h12v5a6 6 0 0 1-12 0V3z"/>
      <path d="M4 5H2a2 2 0 0 0 2 2M16 5h2a2 2 0 0 1-2 2"/>
    </svg>
  );
}
function IconSettings({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="10" cy="10" r="2.5"/>
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.93 4.93l1.41 1.41M13.66 13.66l1.41 1.41M4.93 15.07l1.41-1.41M13.66 6.34l1.41-1.41"/>
    </svg>
  );
}

const NAV_LINKS = [
  { href: '/',               label: 'Companies',   Icon: IconBuilding, exact: true },
  { href: '/learners',       label: 'Learners',    Icon: IconUsers },
  { href: '/courses',        label: 'Courses',     Icon: IconBook },
  { href: '/leaderboard',    label: 'Leaderboard', Icon: IconTrophy },
  { href: '/admin/settings', label: 'Settings',    Icon: IconSettings },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    if (href.startsWith('/company/')) return pathname === href || pathname.startsWith(href + '/');
    return pathname.startsWith(href);
  }

  return (
    <nav className="admin-sidebar">
      {NAV_LINKS.map(({ href, label, Icon, exact }) => {
        const active = isActive(href, exact);
        return (
          <Link
            key={href}
            href={href}
            className={`admin-sidebar-link${active ? ' active' : ''}`}
          >
            <span style={{ opacity: active ? 1 : 0.65, display: 'flex' }}>
              <Icon size={16} />
            </span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
