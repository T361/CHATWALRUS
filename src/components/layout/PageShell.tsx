import TopNav from './TopNav';
import MiniRankings from './MiniRankings';

export default function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell-top">
      <TopNav />
      <main className="shell-content">
        {children}
      </main>
      <MiniRankings />
    </div>
  );
}
