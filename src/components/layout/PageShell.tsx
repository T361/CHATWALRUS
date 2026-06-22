import TopNav from './TopNav';
import AdminSidebar from './AdminSidebar';
import MiniRankings from './MiniRankings';

export default function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell-top">
      <TopNav />
      <div className="admin-with-sidebar">
        <AdminSidebar />
        <main className="admin-main-content">
          {children}
        </main>
      </div>
      <MiniRankings />
    </div>
  );
}
