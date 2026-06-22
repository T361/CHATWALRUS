'use client';

import { useState } from 'react';
import type { Passcode } from '@/types/alert';
import { broadcastPasscodeDeleted } from '@/components/layout/AuthSync';

interface PasscodeTableProps {
  passcodes: Passcode[];
  companies?: Record<string, string>; // id → name
  onRefresh?: () => void;
}

export default function PasscodeTable({ passcodes, companies = {}, onRefresh }: PasscodeTableProps) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    code: '',
    company_id: '',
    description: '',
  });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Get list of companies as array for dropdown
  const companyOptions = Object.entries(companies).map(([id, name]) => ({ id, name }));

  async function handleCreate() {
    if (!formData.code || !formData.company_id) {
      setMessage({ type: 'error', text: 'Passcode and company are required' });
      return;
    }

    setCreating(true);
    setMessage(null);

    try {
      const res = await fetch('/api/admin/passcodes', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: formData.code,
          role: 'company',
          company_id: formData.company_id,
          description: formData.description || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'Failed to create passcode' });
      } else {
        setMessage({ type: 'success', text: 'Passcode created successfully' });
        setFormData({ code: '', company_id: '', description: '' });
        setShowCreateForm(false);
        if (onRefresh) onRefresh();
      }
    } catch {
      setMessage({ type: 'error', text: 'Request failed' });
    }

    setCreating(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this passcode?')) return;

    setDeleting(id);
    setMessage(null);

    try {
      const res = await fetch(`/api/admin/passcodes/${id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'Failed to delete passcode' });
      } else {
        setMessage({ type: 'success', text: 'Passcode deleted successfully' });
        broadcastPasscodeDeleted(); // kick any open company tabs using this passcode
        if (onRefresh) onRefresh();
      }
    } catch {
      setMessage({ type: 'error', text: 'Delete request failed' });
    }

    setDeleting(null);
  }

  return (
    <div>
      {/* Message Banner */}
      {message && (
        <div
          className="card"
          style={{
            background: message.type === 'success' ? 'var(--success-bg)' : 'var(--danger-bg)',
            borderColor: message.type === 'success' ? 'var(--success)' : 'var(--danger)',
            padding: '0.75rem',
            marginBottom: '1rem',
          }}
        >
          <p style={{ fontSize: '0.875rem', color: message.type === 'success' ? 'var(--success)' : 'var(--danger)' }}>
            {message.text}
          </p>
        </div>
      )}

      {/* Create Form */}
      {showCreateForm && (
        <div className="card" style={{ marginBottom: '1rem', background: 'var(--bg-raised)' }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '1rem' }}>Create Company Passcode</h3>

          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                Passcode *
              </label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="e.g., company-secure-123"
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                Company *
              </label>
              <select
                value={formData.company_id}
                onChange={(e) => setFormData({ ...formData, company_id: e.target.value })}
                style={{ width: '100%' }}
              >
                <option value="">Select a company</option>
                {companyOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
              Description (optional)
            </label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="e.g., Client dashboard access"
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowCreateForm(false)}
              disabled={creating}
            >
              Cancel
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleCreate} disabled={creating}>
              {creating ? 'Creating...' : 'Create Passcode'}
            </button>
          </div>
        </div>
      )}

      {/* Add Button */}
      {!showCreateForm && (
        <div style={{ marginBottom: '1rem' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowCreateForm(true)}>
            + Add Company Passcode
          </button>
        </div>
      )}

      {/* Table */}
      {passcodes.length === 0 ? (
        <div className="empty-state">
          <p>No passcodes configured. Create one above to grant company-specific dashboard access.</p>
        </div>
      ) : (
        <div style={{ overflow: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Role</th>
                <th>Company</th>
                <th>Description</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {passcodes.map((p) => (
                <tr key={p.id}>
                  <td className="mono" style={{ fontWeight: 500, fontSize: '0.8125rem' }}>{p.code}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>
                    <span className={`badge ${p.role === 'admin' ? 'badge-high-engagement' : 'badge-on-track'}`}>
                      {p.role}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
                    {p.company_id ? (companies[p.company_id] || p.company_id.slice(0, 8) + '…') : <span style={{ color: 'var(--text-muted)' }}>All</span>}
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{p.description || '—'}</td>
                  <td>
                    <span className={`badge ${p.status === 'active' ? 'badge-on-track' : 'badge-not-started'}`}>
                      {p.status}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {new Date(p.created_at).toLocaleDateString()}
                  </td>
                  <td>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleDelete(p.id)}
                      disabled={deleting === p.id}
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                    >
                      {deleting === p.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
