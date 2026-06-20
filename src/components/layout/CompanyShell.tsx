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
      {/* On mobile: column (tab strip on top, content below).
          On desktop: row (sidebar left, content right). */}
      <div className="company-shell-body">
        <CompanySidebar slug={slug} companyName={companyName} />
        <main className="shell-content company-shell-main">
          {children}
        </main>
      </div>
      <MiniRankings />
    </div>
  );
}
