import CompanyTopNav from './CompanyTopNav';

export default function CompanyShell({
  slug,
  companyName,
  children,
}: {
  slug: string;
  companyName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="app-shell-top">
      <CompanyTopNav slug={slug} companyName={companyName} />
      <main style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>{children}</main>
    </div>
  );
}
