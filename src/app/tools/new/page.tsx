'use client';
// src/app/tools/new/page.tsx

import React, { useState, useEffect } from 'react';

const MONO = 'var(--font-mono)';
const MUT  = 'var(--muted)';
const B    = '1px solid var(--border)';

const CATEGORIES = [
  'pan','knife','cookware','bakeware','appliance','appliance_small',
  'oven','mixer','thermometer','scale','measuring','prep','other',
];

function humanCategory(key: string): string {
  const s = key.replace(/[_-]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function slugify(s: string): string {
  return s.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontFamily: MONO, fontSize: 10, color: MUT,
  textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6,
};
const inputStyle: React.CSSProperties = {
  width: '100%', border: B, background: 'var(--surface)', padding: '8px 10px',
  fontSize: 14, color: 'var(--fg)', outline: 'none',
};

export default function NewToolPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [name, setName]       = useState('');
  const [slug, setSlug]       = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [category, setCategory] = useState('pan');
  const [summary, setSummary] = useState('');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/check')
      .then(r => r.json())
      .then(d => setAllowed(Boolean(d.isAdmin)))
      .catch(() => setAllowed(false));
  }, []);

  // Auto-derive slug from name until the admin manually edits the slug field.
  useEffect(() => {
    if (!slugEdited) setSlug(slugify(name));
  }, [name, slugEdited]);

  async function create() {
    setError(null);
    if (!name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    const res = await fetch('/api/admin/equipment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, slug, category, summary }),
    });
    const d = await res.json();
    setSaving(false);
    if (!res.ok) { setError(d.error ?? 'Create failed.'); return; }
    // Straight into the edit page to flesh out the rest.
    window.location.href = `/tools/${d.tool.slug}/edit`;
  }

  if (allowed === false) return (
    <div style={{ padding: 32, fontFamily: MONO, fontSize: 12, color: MUT }}>
      Not authorised.
    </div>
  );
  if (allowed === null) return (
    <div className="flex items-center justify-center h-64">
      <span style={{ fontFamily: MONO, fontSize: 11, color: MUT,
        textTransform: 'uppercase', letterSpacing: '0.18em' }}>Loading…</span>
    </div>
  );

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 32px 100px' }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8,
        fontFamily: MONO, fontSize: 11, color: MUT,
        textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
        <a href="/tools" style={{ color: MUT, textDecoration: 'none' }}>Tools</a>
        <span>›</span>
        <span style={{ color: 'var(--fg)' }}>New</span>
      </div>

      <h1 className="font-display" style={{ fontSize: 26, fontWeight: 400, margin: '0 0 8px' }}>
        Add a tool
      </h1>
      <p style={{ fontSize: 13, color: MUT, margin: '0 0 24px', lineHeight: 1.6 }}>
        Just a name to start — you&rsquo;ll fill in the rest on the next screen.
      </p>

      <div style={{ marginBottom: 18 }}>
        <label style={labelStyle}>Name</label>
        <input style={inputStyle} value={name} autoFocus
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Frying pan" />
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={labelStyle}>Slug (URL key — must be unique)</label>
        <input style={inputStyle} value={slug}
          onChange={e => { setSlugEdited(true); setSlug(slugify(e.target.value)); }}
          placeholder="frying-pan" />
        <p style={{ fontFamily: MONO, fontSize: 9, color: MUT, margin: '6px 0 0', lineHeight: 1.5 }}>
          For a tool that techniques reference, match the slug techniques use
          (e.g. <code>frying-pan</code>, <code>saucepan</code>, <code>chefs-knife</code>).
        </p>
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={labelStyle}>Category</label>
        <select style={inputStyle} value={category}
          onChange={e => setCategory(e.target.value)}>
          {CATEGORIES.map(c => (
            <option key={c} value={c}>{humanCategory(c)}</option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={labelStyle}>Summary (optional — the one-line what-it-is)</label>
        <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
          value={summary} onChange={e => setSummary(e.target.value)}
          placeholder="Wide flat pan for frying and sautéing." />
      </div>

      {error && (
        <p style={{ fontFamily: MONO, fontSize: 11, color: '#a33', margin: '0 0 16px' }}>
          {error}
        </p>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button onClick={create} disabled={saving || !name.trim()}
          style={{ fontFamily: MONO, fontSize: 12, color: '#fff',
            background: 'var(--accent)', border: 'none', padding: '8px 20px',
            cursor: (saving || !name.trim()) ? 'default' : 'pointer',
            opacity: (saving || !name.trim()) ? 0.6 : 1,
            textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {saving ? 'Creating…' : 'Create & edit'}
        </button>
        <a href="/tools" style={{ fontFamily: MONO, fontSize: 11, color: MUT, textDecoration: 'none' }}>
          Cancel
        </a>
      </div>
    </div>
  );
}
