export const dynamic = 'force-dynamic';

import CompanyShell from '@/components/layout/CompanyShell';
import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';

const EXPORT_TYPES = [
  { label: 'Learner Progress', sub: 'Names, email, status, completion %', href: (slug: string) => `/api/companies/${slug}/export/csv`, icon: '↓ CSV' },
  { label: 'Full Company Data', sub: 'All learner + enrollment data', href: (slug: string) => `/api/companies/${slug}/export/json`, icon: '↓ JSON' },
  { label: 'Assessments', sub: 'Quiz scores and assignment submissions', href: (slug: string) => `/api/companies/${slug}/export/csv?type=assessments`, icon: '↓ CSV' },
  { label: 'Survey Responses', sub: 'Ratings and written feedback', href: (slug: string) => `/api/companies/${slug}/export/csv?type=surveys`, icon: '↓ CSV' },
  { label: 'Zoom Attendance', sub: 'Live session attendance records', href: (slug: string) => `/api/companies/${slug}/export/csv?type=attendance`, icon: '↓ CSV' },
];

export default async function ExportPage(
  props: { params: Promise<{ slug: string }> }
) {
  const { slug } = await props.params;
  const db = createAdminClient();

  if (!db) {
    return <CompanyShell slug={slug}><div className="card"><p style={{ color: 'var(--warning)' }}>Database not connected.</p></div></CompanyShell>;
  }

  const { data: company } = await db.from('companies').select('id, name').eq('slug', slug).single();
  if (!company) notFound();

  return (
    <CompanyShell slug={slug} companyName={company.name}>
      <div className="page-header">
        <h1 className="page-title">Export Data</h1>
        <span className="badge badge-not-started">{company.name}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.875rem' }}>
        {EXPORT_TYPES.map((exp) => (
          <a
            key={exp.label}
            href={exp.href(slug)}
            style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
          >
            <div className="card card-hover" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.6875rem',
                fontWeight: 600,
                color: 'var(--primary)',
                background: 'var(--primary-glow)',
                border: '1px solid var(--border-accent)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.25rem 0.5rem',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}>
                {exp.icon}
              </span>
              <div>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)' }}>{exp.label}</h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.125rem' }}>{exp.sub}</p>
              </div>
            </div>
          </a>
        ))}
      </div>
    </CompanyShell>
  );
}
