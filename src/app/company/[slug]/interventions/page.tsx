'use client';

import CompanyShell from '@/components/layout/CompanyShell';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface Intervention {
  id: string;
  learner_id: string | null;
  csm_email: string | null;
  intervention_type: string;
  note: string;
  follow_up_date: string | null;
  created_at: string;
  learners: { full_name: string; email: string } | null;
}

const TYPE_LABELS: Record<string, string> = {
  note: 'Note',
  call: 'Call',
  email: 'Email',
  action_taken: 'Action Taken',
  follow_up_set: 'Follow-up Set',
};

const TYPE_COLORS: Record<string, string> = {
  note: 'var(--text-muted)',
  call: 'var(--success)',
  email: 'var(--cyan)',
  action_taken: 'var(--primary)',
  follow_up_set: 'var(--warning)',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export default function InterventionsPage() {
  const { slug } = useParams<{ slug: string }>();
  const [items,        setItems]        = useState<Intervention[]>([]);
  const [companyName,  setCompanyName]  = useState('');
  const [loading,      setLoading]      = useState(true);
  const [submitting,   setSubmitting]   = useState(false);
  const [form,         setForm]         = useState({
    note: '', intervention_type: 'note', follow_up_date: '', csm_email: '',
  });
  const [error, setError] = useState('');

  async function load() {
    const res = await fetch(`/api/companies/${slug}/interventions`);
    const d = await res.json();
    setItems(d.interventions ?? []);
    setLoading(false);
  }

  useEffect(() => {
    fetch(`/api/companies/${slug}`)
      .then((r) => r.json())
      .then((d) => setCompanyName(d.company?.name ?? slug))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.note.trim()) { setError('Note is required'); return; }
    setSubmitting(true);
    setError('');
    const res = await fetch(`/api/companies/${slug}/interventions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setForm({ note: '', intervention_type: 'note', follow_up_date: '', csm_email: '' });
      await load();
    } else {
      const d = await res.json();
      setError(d.error ?? 'Failed to save');
    }
    setSubmitting(false);
  }

  async function deleteEntry(id: string) {
    await fetch(`/api/companies/${slug}/interventions?id=${id}`, { method: 'DELETE' });
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  return (
    <CompanyShell slug={slug} companyName={companyName}>
      <div className="page-header" style={{ marginTop: '0.75rem' }}>
        <div>
          <h1 className="page-title">Intervention Log</h1>
          <p className="page-subtitle">Track CSM notes, calls, and follow-ups for {companyName}</p>
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', paddingTop: '0.375rem' }}>
          {items.length} entries
        </span>
      </div>

      {/* Add entry form */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 className="section-title" style={{ marginBottom: '1rem' }}>Log New Entry</h3>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.375rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Type
              </label>
              <select
                value={form.intervention_type}
                onChange={(e) => setForm((p) => ({ ...p, intervention_type: e.target.value }))}
                style={{ width: '100%' }}
              >
                {Object.entries(TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.375rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Follow-up Date (optional)
              </label>
              <input
                type="date"
                value={form.follow_up_date}
                onChange={(e) => setForm((p) => ({ ...p, follow_up_date: e.target.value }))}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.375rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Your Email (optional)
            </label>
            <input
              type="email"
              placeholder="csm@company.com"
              value={form.csm_email}
              onChange={(e) => setForm((p) => ({ ...p, csm_email: e.target.value }))}
              style={{ width: '100%', maxWidth: 360 }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.375rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Note *
            </label>
            <textarea
              rows={3}
              placeholder="What happened? What was discussed or actioned?"
              value={form.note}
              onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>

          {error && <p style={{ fontSize: '0.8125rem', color: 'var(--danger)' }}>{error}</p>}

          <div>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Log Entry'}
            </button>
          </div>
        </form>
      </div>

      {/* Timeline */}
      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Loading…</div>
      ) : items.length === 0 ? (
        <div className="empty-state card">
          <h3>No entries yet</h3>
          <p>Log your first note, call, or action above.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {items.map((item) => (
            <div key={item.id} className="card" style={{ padding: '1rem 1.25rem', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              {/* Type pill */}
              <div style={{ flexShrink: 0, marginTop: '0.125rem' }}>
                <span style={{
                  display: 'inline-block', padding: '0.125rem 0.5rem',
                  borderRadius: '9999px', fontSize: '0.6875rem', fontWeight: 700,
                  background: `color-mix(in srgb, ${TYPE_COLORS[item.intervention_type] ?? 'var(--text-muted)'} 12%, transparent)`,
                  color: TYPE_COLORS[item.intervention_type] ?? 'var(--text-muted)',
                  border: `1px solid color-mix(in srgb, ${TYPE_COLORS[item.intervention_type] ?? 'var(--text-muted)'} 30%, transparent)`,
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                }}>
                  {TYPE_LABELS[item.intervention_type] ?? item.intervention_type}
                </span>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '0.875rem', color: 'var(--text)', lineHeight: 1.6 }}>{item.note}</p>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {formatDate(item.created_at)} at {formatTime(item.created_at)}
                  </span>
                  {item.csm_email && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      by {item.csm_email}
                    </span>
                  )}
                  {item.follow_up_date && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--warning)', fontWeight: 500 }}>
                      Follow-up: {formatDate(item.follow_up_date)}
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => deleteEntry(item.id)}
                style={{
                  flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', padding: '0.25rem',
                  borderRadius: 'var(--radius-sm)', transition: 'color 120ms',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--danger)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                title="Delete entry"
              >
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M3 6h14M8 6V4h4v2M6 6l1 12h6l1-12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </CompanyShell>
  );
}
