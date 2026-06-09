'use client';
// src/app/tools/[slug]/edit/page.tsx

import React, { useState, useEffect, use } from 'react';

interface ToolEdit {
  id: string; slug: string; name: string; category: string;
  summary?: string; description?: string; description_long?: string;
  brand?: string; model_number?: string; manufacturer?: string;
  connected?: boolean; wattage?: number | null; cavity_volume_litres?: number | null;
  uses?: string[]; image_url?: string; image_credit?: string;
  content_reviewed?: boolean;
  archived?: boolean;
}

const MONO = 'var(--font-mono)';
const MUT  = 'var(--muted)';
const B    = '1px solid var(--border)';

const labelStyle: React.CSSProperties = {
  display: 'block', fontFamily: MONO, fontSize: 10, color: MUT,
  textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6,
};
const inputStyle: React.CSSProperties = {
  width: '100%', border: B, background: 'var(--surface)', padding: '8px 10px',
  fontSize: 14, color: 'var(--fg)', outline: 'none',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

export default function ToolEditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [tool, setTool]       = useState<ToolEdit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    fetch('/api/admin/check')
      .then(r => r.json())
      .then(d => setAllowed(Boolean(d.isAdmin)))
      .catch(() => setAllowed(false));

    fetch(`/api/tools/${slug}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setLoading(false); return; }
        const t = d.tool;
        setTool({
          id: t.id, slug: t.slug, name: t.name, category: t.category,
          summary: t.summary ?? '', description: t.description ?? '',
          description_long: t.description_long ?? '',
          brand: t.brand ?? '', model_number: t.model_number ?? '',
          manufacturer: t.manufacturer ?? '',
          connected: Boolean(t.connected),
          wattage: t.wattage ?? null,
          cavity_volume_litres: t.cavity_volume_litres ?? null,
          uses: t.uses ?? [],
          image_url: t.image_url ?? '', image_credit: t.image_credit ?? '',
          content_reviewed: Boolean(t.content_reviewed),
          archived: t.archived_at != null,
        });
        setLoading(false);
      })
      .catch(() => { setError('Failed to load.'); setLoading(false); });
  }, [slug]);

  function set<K extends keyof ToolEdit>(k: K, v: ToolEdit[K]) {
    setTool(t => t ? { ...t, [k]: v } : t);
    setSaved(false);
  }

  async function save() {
    if (!tool) return;
    setSaving(true); setError(null);
    const res = await fetch(`/api/admin/equipment/${tool.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: tool.name, summary: tool.summary, description: tool.description,
        description_long: tool.description_long,
        brand: tool.brand, model_number: tool.model_number, manufacturer: tool.manufacturer,
        connected: tool.connected, wattage: tool.wattage,
        cavity_volume_litres: tool.cavity_volume_litres,
        uses: tool.uses, image_url: tool.image_url, image_credit: tool.image_credit,
        content_reviewed: tool.content_reviewed,
      }),
    });
    const d = await res.json();
    setSaving(false);
    if (!res.ok) { setError(d.error ?? 'Save failed.'); return; }
    setSaved(true);
    // Return to the view page on success.
    window.location.href = `/tools/${tool.slug}`;
  }

  async function setArchived(next: boolean) {
    if (!tool) return;
    setArchiving(true); setError(null);
    const res = await fetch(`/api/admin/equipment/${tool.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: next }),
    });
    const d = await res.json().catch(() => ({}));
    setArchiving(false);
    if (!res.ok) {
      setConfirmArchive(false);
      setError(d.error ?? 'Failed.');
      return;
    }
    if (next) {
      // Archived — back to the list (it's hidden from the public view now).
      window.location.href = '/tools';
    } else {
      // Unarchived — refresh the view page.
      window.location.href = `/tools/${tool.slug}`;
    }
  }

  if (allowed === false) return (
    <div style={{ padding: 32, fontFamily: MONO, fontSize: 12, color: MUT }}>
      Not authorised.
    </div>
  );
  if (loading || !tool) return (
    <div className="flex items-center justify-center h-64">
      <span style={{ fontFamily: MONO, fontSize: 11, color: MUT,
        textTransform: 'uppercase', letterSpacing: '0.18em' }}>Loading…</span>
    </div>
  );

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 32px 100px' }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8,
        fontFamily: MONO, fontSize: 11, color: MUT,
        textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
        <a href="/tools" style={{ color: MUT, textDecoration: 'none' }}>Tools</a>
        <span>›</span>
        <a href={`/tools/${tool.slug}`} style={{ color: MUT, textDecoration: 'none' }}>{tool.name}</a>
        <span>›</span>
        <span style={{ color: 'var(--fg)' }}>Edit</span>
      </div>

      <h1 className="font-display" style={{ fontSize: 26, fontWeight: 400, margin: '0 0 24px' }}>
        Edit: {tool.name}
      </h1>

      <Field label="Name">
        <input style={inputStyle} value={tool.name} onChange={e => set('name', e.target.value)} />
      </Field>

      <Field label="Summary (the one-line what-it-is)">
        <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
          value={tool.summary} onChange={e => set('summary', e.target.value)} />
      </Field>

      <Field label="Short description">
        <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
          value={tool.description} onChange={e => set('description', e.target.value)} />
      </Field>

      <Field label="Long description (what it's for, how it works)">
        <textarea style={{ ...inputStyle, minHeight: 160, resize: 'vertical' }}
          value={tool.description_long} onChange={e => set('description_long', e.target.value)} />
      </Field>

      <Field label="Uses (one per line)">
        <textarea style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }}
          value={(tool.uses ?? []).join('\n')}
          onChange={e => set('uses', e.target.value.split('\n').map(s => s.trim()).filter(Boolean))} />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Field label="Typical power (W)">
          <input style={inputStyle} type="number" value={tool.wattage ?? ''}
            onChange={e => set('wattage', e.target.value === '' ? null : Number(e.target.value))} />
        </Field>
        <Field label="Capacity (litres)">
          <input style={inputStyle} type="number" step="0.1" value={tool.cavity_volume_litres ?? ''}
            onChange={e => set('cavity_volume_litres', e.target.value === '' ? null : Number(e.target.value))} />
        </Field>
      </div>

      <Field label="Connected (app control)">
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={Boolean(tool.connected)}
            onChange={e => set('connected', e.target.checked)} />
          <span>This tool can be controlled by an app</span>
        </label>
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Field label="Brand"><input style={inputStyle} value={tool.brand} onChange={e => set('brand', e.target.value)} /></Field>
        <Field label="Model number"><input style={inputStyle} value={tool.model_number} onChange={e => set('model_number', e.target.value)} /></Field>
      </div>

      <Field label="Manufacturer">
        <input style={inputStyle} value={tool.manufacturer} onChange={e => set('manufacturer', e.target.value)} />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <Field label="Hero image URL"><input style={inputStyle} value={tool.image_url} onChange={e => set('image_url', e.target.value)} /></Field>
        <Field label="Image credit"><input style={inputStyle} value={tool.image_credit} onChange={e => set('image_credit', e.target.value)} /></Field>
      </div>

      <Field label="Curation">
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={Boolean(tool.content_reviewed)}
            onChange={e => set('content_reviewed', e.target.checked)} />
          <span>Content reviewed (blessed)</span>
        </label>
      </Field>

      {/* Fixed bottom save bar (no chat sidebar → right:0) */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0,
        borderTop: B, background: 'var(--surface)', padding: '10px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {tool.archived ? (
            <button onClick={() => setArchived(false)} disabled={archiving}
              style={{ fontFamily: MONO, fontSize: 11, color: 'var(--accent)',
                background: 'none', border: '1px solid var(--accent)', padding: '6px 14px',
                cursor: archiving ? 'default' : 'pointer', opacity: archiving ? 0.6 : 1,
                textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {archiving ? 'Restoring…' : 'Unarchive'}
            </button>
          ) : confirmArchive ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: MONO, fontSize: 11, color: MUT }}>
                Archive this tool? (reversible)
              </span>
              <button onClick={() => setArchived(true)} disabled={archiving}
                style={{ fontFamily: MONO, fontSize: 11, color: '#fff',
                  background: 'var(--muted)', border: 'none', padding: '6px 14px',
                  cursor: archiving ? 'default' : 'pointer', opacity: archiving ? 0.6 : 1,
                  textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                {archiving ? 'Archiving…' : 'Archive'}
              </button>
              <button onClick={() => setConfirmArchive(false)} disabled={archiving}
                style={{ fontFamily: MONO, fontSize: 11, color: MUT,
                  background: 'none', border: 'none', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => { setConfirmArchive(true); setError(null); }}
              style={{ fontFamily: MONO, fontSize: 11, color: MUT,
                background: 'none', border: 'none', cursor: 'pointer',
                textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Archive
            </button>
          )}
          <span style={{ fontFamily: MONO, fontSize: 11, color: error ? '#a33' : MUT }}>
            {error ? error : saved ? 'Saved.' : tool.archived ? 'Archived' : 'Editing'}
          </span>
        </div>
        <button onClick={save} disabled={saving}
          style={{ fontFamily: MONO, fontSize: 12, color: '#fff',
            background: 'var(--accent)', border: 'none', padding: '8px 20px',
            cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
            textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
