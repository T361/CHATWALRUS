import Sidebar from './Sidebar';

export default function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="shell-main">
        <main className="shell-content">
          {children}
        </main>
      </div>
    </div>
  );
}
