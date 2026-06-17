import TopNav from './TopNav';
import CompanySidebar from './CompanySidebar';
import MiniRankings from './MiniRankings';

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
      <TopNav />
      <div style={{ display: 'flex', minHeight: 'calc(100vh - 54px)' }}>
        <CompanySidebar slug={slug} companyName={companyName} />
        <main className="shell-content" style={{ flex: 1, minWidth: 0 }}>
          {children}
        </main>
      </div>
      <MiniRankings />
    </div>
  );
}
