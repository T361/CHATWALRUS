import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminCompanyProvider } from '@/components/layout/AdminCompanyContext';
import CompanyTopNav from '@/components/layout/CompanyTopNav';
import CompanySidebar from '@/components/layout/CompanySidebar';

export default async function CompanySlugLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const session = verifyAdminSessionToken(token);

  if (!session) {
    redirect('/login');
  }

  const isAdmin = session.role === 'admin';
  const db = createAdminClient();

  if (!isAdmin && session.role === 'company') {
    if (!session.passcodeId) {
      redirect('/login?reason=session_refresh');
    }

    if (db) {
      const { data } = await db
        .from('passcodes')
        .select('id')
        .eq('id', session.passcodeId)
        .maybeSingle();

      if (!data) {
        redirect('/login?reason=session_expired');
      }
    }
  }

  let companyName: string | undefined;
  if (db) {
    const { data } = await db
      .from('companies')
      .select('name')
      .eq('slug', slug)
      .maybeSingle();
    companyName = data?.name ?? undefined;
  }

  return (
    <AdminCompanyProvider isAdmin={isAdmin}>
      <div className="app-shell-top">
        <CompanyTopNav slug={slug} companyName={companyName} />
        {isAdmin ? (
          <div className="company-admin-layout">
            <CompanySidebar slug={slug} companyName={companyName} />
            <main className="company-admin-main">
              <div className="company-admin-content">{children}</div>
            </main>
          </div>
        ) : (
          <main className="shell-content">{children}</main>
        )}
      </div>
    </AdminCompanyProvider>
  );
}
