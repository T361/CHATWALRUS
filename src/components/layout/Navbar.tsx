import Link from 'next/link';

export default function Navbar() {
  return (
    <nav style={{
      background: 'white',
      borderBottom: '1px solid #e5e7eb',
      padding: '0 1.5rem',
      height: '56px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}>
      <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ fontSize: '1.25rem' }}>🐋</span>
        <span style={{ fontWeight: 700, fontSize: '1rem', color: '#111827' }}>
          ChatWalrus
        </span>
        <span style={{ color: '#6b7280', fontSize: '0.875rem', fontWeight: 400 }}>
          Engagement Dashboard
        </span>
      </Link>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <Link href="/admin/surveys" style={{ fontSize: '0.875rem', color: '#6b7280', textDecoration: 'none' }}>
          Surveys
        </Link>
        <Link href="/admin/settings" style={{ fontSize: '0.875rem', color: '#6b7280', textDecoration: 'none' }}>
          Settings
        </Link>
      </div>
    </nav>
  );
}
