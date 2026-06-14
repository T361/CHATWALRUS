import Navbar from './Navbar';

export default function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Navbar />
      <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '1.75rem 1.5rem' }}>
        {children}
      </main>
    </div>
  );
}
