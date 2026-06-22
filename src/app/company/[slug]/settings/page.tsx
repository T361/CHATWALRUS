'use client';

import CompanyShell from '@/components/layout/CompanyShell';
import { useEffect, useState, use } from 'react';

interface CompanySettings {
  name: string;
  start_date: string | null;
  end_date: string | null;
  learning_timeline_days: number | null;
  risk_threshold_percent: number | null;
  csm_owner_email: string | null;
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
          csm_owner_email:        c.csm_owner_email        ?? '',
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
      if (form.start_date)       body.start_date       = form.start_date;
      if (form.end_date)         body.end_date         = form.end_date;
      if (form.csm_owner_email  !== undefined) body.csm_owner_email  = form.csm_owner_email  || null;

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

  function textField(label: string, key: keyof CompanySettings, type = 'text', hint?: string) {
    return (
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
  }

  return (
    <CompanyShell slug={slug} companyName={settings?.name}>
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <h1 className="page-title">Company Settings</h1>
        <p className="page-subtitle" style={{ marginTop: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
          Configure program dates and alert thresholds.
        </p>
      </div>

      {loading ? (
        <div className="card empty-state"><span className="spinner" /><p>Loading...</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: 560 }}>

          {/* Program Configuration */}
          <div className="card">
            <p className="section-title" style={{ marginBottom: '1.25rem' }}>Program Configuration</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {textField('Program Start Date', 'start_date', 'date',
                'Required for milestone checks. Without this, benchmark defaults to Day 30.')}
              {textField('Program End Date', 'end_date', 'date',
                'Optional. Displays the program timeline in the header.')}
              {textField('Learning Timeline (days)', 'learning_timeline_days', 'number',
                'Total program length in days. Default: 90. Scales milestone benchmarks.')}
              {textField('At-Risk Threshold (%)', 'risk_threshold_percent', 'number',
                'Alert fires when this % of learners are at-risk or not started. Default: 30.')}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
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
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Current: Start {settings.start_date}{settings.end_date ? ` → ${settings.end_date}` : ''} · {settings.learning_timeline_days ?? 90}d · {settings.risk_threshold_percent ?? 30}% risk threshold
            </p>
          )}

          {!settings?.start_date && (
            <div style={{ padding: '0.75rem 0.875rem', background: 'color-mix(in srgb, var(--warning) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)', borderRadius: 'var(--radius-sm)' }}>
              <p style={{ fontSize: '0.8125rem', color: 'var(--warning)', fontWeight: 500 }}>
                No start date set — benchmark, milestone checks, and alerts are all disabled.
              </p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Set a start date and save, then run Milestone Checks in Admin → Settings.
              </p>
            </div>
          )}
        </div>
      )}
    </CompanyShell>
  );
}
