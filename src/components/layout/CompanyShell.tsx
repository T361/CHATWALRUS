import { cookies } from 'next/headers';
import CompanyTopNav from './CompanyTopNav';
import AdminSidebar from './AdminSidebar';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from '@/lib/auth/session';

export default async function CompanyShell({
  slug,
  companyName,
  children,
}: {
  slug: string;
  companyName?: string;
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const session = verifyAdminSessionToken(token);
  const isAdmin = session?.role === 'admin';

  return (
    <div className="app-shell-top">
      <CompanyTopNav slug={slug} companyName={companyName} />
      {isAdmin ? (
        <div className="company-admin-layout">
          <AdminSidebar />
          <main className="company-admin-main">{children}</main>
        </div>
      ) : (
        <main className="shell-content">{children}</main>
      )}
    </div>
  );
}
