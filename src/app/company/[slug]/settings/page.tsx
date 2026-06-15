'use client';

import PageShell from '@/components/layout/PageShell';
import Link from 'next/link';
import { useEffect, useState, use } from 'react';

interface CompanySettings {
  name: string;
  start_date: string | null;
  end_date: string | null;
  learning_timeline_days: number | null;
  risk_threshold_percent: number | null;
}

export default function CompanySettingsPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = use(props.params);

  const [settings,  setSettings]  = useState<CompanySettings | null>(null);
  const [form,      setForm]      = useState<Partial<CompanySettings>>({});
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [msg,       setMsg]       = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    fetch(`/api/companies/${slug}`)
      .then((r) => r.json())
      .then((d) => {
        const c = d.company;
        setSettings(c);
        setForm({
          start_date:             c.start_date             ?? '',
          end_date:               c.end_date               ?? '',
          learning_timeline_days: c.learning_timeline_days ?? 90,
          risk_threshold_percent: c.risk_threshold_percent ?? 30,
        });
      })
      .catch(() => setMsg({ text: 'Could not load company settings.', ok: false }))
      .finally(() => setLoading(false));
  }, [slug]);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const body: Record<string, unknown> = {
        learning_timeline_days: Number(form.learning_timeline_days) || 90,
        risk_threshold_percent: Number(form.risk_threshold_percent) || 30,
      };
      // Only include dates when they have a value
      if (form.start_date) body.start_date = form.start_date;
      if (form.end_date)   body.end_date   = form.end_date;

      const res = await fetch(`/api/companies/${slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setMsg({ text: 'Settings saved. Run milestone checks to refresh status charts.', ok: true });
      } else {
        const d = await res.json().catch(() => ({}));
        setMsg({ text: d.error || 'Save failed.', ok: false });
      }
    } catch {
      setMsg({ text: 'Request failed.', ok: false });
    }
    setSaving(false);
  }

  const field = (label: string, key: keyof CompanySettings, type = 'text', hint?: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
      <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </label>
      <input
        type={type}
        value={String(form[key] ?? '')}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      />
      {hint && <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.125rem' }}>{hint}</p>}
    </div>
  );

  return (
    <PageShell>
      <Link href={`/company/${slug}`} className="back-link">← {settings?.name || 'Company'}</Link>

      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <h1 className="page-title">Company Settings</h1>
        <p className="page-subtitle" style={{ marginTop: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
          Configure program dates and thresholds. These drive milestone checks, benchmark calculations, and risk alerts.
        </p>
      </div>

      {loading ? (
        <div className="card empty-state"><span className="spinner" /><p>Loading...</p></div>
      ) : (
        <div className="card" style={{ maxWidth: 520 }}>
          <p className="section-title" style={{ marginBottom: '1.25rem' }}>Program Configuration</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {field(
              'Program Start Date',
              'start_date',
              'date',
              'Required for milestone checks. Without this, benchmark is always Day 30.'
            )}
            {field(
              'Program End Date',
              'end_date',
              'date',
              'Optional. Used to display the program timeline.'
            )}
            {field(
              'Learning Timeline (days)',
              'learning_timeline_days',
              'number',
              'Total program length in days. Default: 90. Used to calculate the expected completion benchmark.'
            )}
            {field(
              'Risk Threshold (%)',
              'risk_threshold_percent',
              'number',
              'Alert triggers when this % of learners are at-risk or not started. Default: 30.'
            )}
          </div>

          <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button
              className="btn btn-primary"
              disabled={saving}
              onClick={save}
            >
              {saving ? <><span className="spinner" />Saving…</> : 'Save Settings'}
            </button>
            {msg && (
              <p style={{ fontSize: '0.8125rem', color: msg.ok ? 'var(--success)' : 'var(--danger)' }}>
                {msg.text}
              </p>
            )}
          </div>

          {settings?.start_date && (
            <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-muted)' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Current: Start {settings.start_date}{settings.end_date ? ` → End ${settings.end_date}` : ''} · {settings.learning_timeline_days ?? 90} day program · {settings.risk_threshold_percent ?? 30}% risk threshold
              </p>
            </div>
          )}

          {!settings?.start_date && (
            <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-muted)', background: 'var(--warning-bg)', borderRadius: 6, padding: '0.75rem', border: '1px solid rgba(245,158,11,0.2)' }}>
              <p style={{ fontSize: '0.8125rem', color: 'var(--warning)', fontWeight: 500 }}>
                No start date set — status charts, benchmark, and risk alerts are all disabled for this company.
              </p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Set a start date and save, then go to Admin → Settings → Run Milestone Checks.
              </p>
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}
