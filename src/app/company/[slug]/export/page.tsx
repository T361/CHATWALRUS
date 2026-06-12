import PageShell from '@/components/layout/PageShell';
import Link from 'next/link';
import { createServerClientSafe } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';

export default async function ExportPage(
  props: { params: Promise<{ slug: string }> }
) {
  const { slug } = await props.params;
  const db = createServerClientSafe();

  if (!db) {
    return <PageShell><div className="card"><p>⚠️ Database not connected.</p></div></PageShell>;
  }

  const { data: company } = await db.from('companies').select('id, name').eq('slug', slug).single();
  if (!company) notFound();

  const exports = [
    { label: 'Learner Progress CSV', href: `/api/companies/${slug}/export/csv`, icon: '👥' },
    { label: 'Full Company JSON', href: `/api/companies/${slug}/export/json`, icon: '📦' },
    { label: 'Assessments CSV', href: `/api/companies/${slug}/export/csv?type=assessments`, icon: '📝' },
    { label: 'Surveys CSV', href: `/api/companies/${slug}/export/csv?type=surveys`, icon: '📋' },
    { label: 'Attendance CSV', href: `/api/companies/${slug}/export/csv?type=attendance`, icon: '📅' },
  ];

  return (
    <PageShell>
      <Link href={`/company/${slug}`} style={{ fontSize: '0.8125rem', color: '#6b7280', textDecoration: 'none' }}>
        ← Back to {company.name}
      </Link>

      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '1rem 0' }}>
        Export Data — {company.name}
      </h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}>
        {exports.map((exp) => (
          <a
            key={exp.href}
            href={exp.href}
            className="card"
            style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
          >
            <span style={{ fontSize: '1.5rem' }}>{exp.icon}</span>
            <div>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 600 }}>{exp.label}</h3>
              <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>Click to download</p>
            </div>
          </a>
        ))}
      </div>
    </PageShell>
  );
}
