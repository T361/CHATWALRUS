'use client';

import { useContext } from 'react';
import CompanyTopNav from './CompanyTopNav';
import AdminSidebar from './AdminSidebar';
import { AdminCompanyContext } from './AdminCompanyContext';

export default function CompanyShell({
  slug,
  companyName,
  children,
}: {
  slug: string;
  companyName?: string;
  children: React.ReactNode;
}) {
  const isAdmin = useContext(AdminCompanyContext);

  return (
    <div className="app-shell-top">
      <CompanyTopNav slug={slug} companyName={companyName} />
      {isAdmin ? (
        <div className="company-admin-layout">
          <AdminSidebar />
          <main className="company-admin-main">
            <div className="company-admin-content">{children}</div>
          </main>
        </div>
      ) : (
        <main className="shell-content">{children}</main>
      )}
    </div>
  );
}
