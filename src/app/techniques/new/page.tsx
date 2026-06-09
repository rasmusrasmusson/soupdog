// src/app/techniques/new/page.tsx
'use client';
import React, { useState, useEffect } from 'react';

const MONO = 'var(--font-mono)';
const MUT  = 'var(--muted)';
const B    = '1px solid var(--border)';

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

export default function NewTechniquePage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [name, setName]       = useState('');
  const [slug, setSlug]       = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [family, setFamily]   = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/check')
      .then(r => r.json())
      .then(d => setAllowed(Boolean(d.isAdmin)))
      .catch(() => setAllowed(false));
  }, []);

  useEffect(() => {
    if (!slugEdited) setSlug(slugify(name));
  }, [name, slugEdited]);

  async function create() {
    setError(null);
    if (!name.trim()) { setError('Name is required.'); return; }
    if (!family.trim()) { setError('Family is required.'); return; }
    setSaving(true);
    const res = await fetch('/api/admin/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, slug, family, description }),
    });
    const d = await res.json();
    setSaving(false);
    if (!res.ok) { setError(d.error ?? 'Create failed.'); return; }
    window.location.href = `/techniques/${d.task.slug}/edit`;
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
        <a href="/techniques" style={{ color: MUT, textDecoration: 'none' }}>Techniques</a>
        <span>›</span>
        <span style={{ color: 'var(--fg)' }}>New</span>
      </div>

      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 600, margin: '0 0 8px' }}>
        Add a technique
      </h1>
      <p style={{ fontSize: 13, color: MUT, margin: '0 0 24px', lineHeight: 1.6 }}>
        Just the essentials to start — you&rsquo;ll fill in heat, completion, tools and the rest
        on the next screen. New techniques start as unverified drafts.
      </p>

      <div style={{ marginBottom: 18 }}>
        <label style={labelStyle}>Name</label>
        <input style={inputStyle} value={name} autoFocus
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Blanch" />
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={labelStyle}>Slug (URL key — must be unique)</label>
        <input style={inputStyle} value={slug}
          onChange={e => { setSlugEdited(true); setSlug(slugify(e.target.value)); }}
          placeholder="blanch" />
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={labelStyle}>Family (required — the transformation family)</label>
        <input style={inputStyle} value={family}
          onChange={e => setFamily(e.target.value)}
          placeholder="e.g. boil, fry, knife_cuts, mix, prepare" />
        <p style={{ fontFamily: MONO, fontSize: 9, color: MUT, margin: '6px 0 0', lineHeight: 1.5 }}>
          Groups the technique with siblings sharing a mechanism. Reuse an existing family
          where one fits (boil, simmer, fry, steam, knife_cuts, mix, prepare, finish, passive…).
        </p>
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={labelStyle}>Description (optional — what it does)</label>
        <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
          value={description} onChange={e => setDescription(e.target.value)}
          placeholder="Briefly cook in boiling water, then stop the cooking in iced water." />
      </div>

      {error && (
        <p style={{ fontFamily: MONO, fontSize: 11, color: '#a33', margin: '0 0 16px' }}>
          {error}
        </p>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button onClick={create} disabled={saving || !name.trim() || !family.trim()}
          style={{ fontFamily: MONO, fontSize: 12, color: '#fff',
            background: 'var(--accent)', border: 'none', padding: '8px 20px',
            cursor: (saving || !name.trim() || !family.trim()) ? 'default' : 'pointer',
            opacity: (saving || !name.trim() || !family.trim()) ? 0.6 : 1,
            textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {saving ? 'Creating…' : 'Create & edit'}
        </button>
        <a href="/techniques" style={{ fontFamily: MONO, fontSize: 11, color: MUT, textDecoration: 'none' }}>
          Cancel
        </a>
      </div>
    </div>
  );
}
