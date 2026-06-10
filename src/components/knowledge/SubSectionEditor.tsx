'use client';
// src/components/knowledge/SubSectionEditor.tsx
//
// Reusable editor for the repeatable sub-sections of one (entity, section).
// Each sub-section = headline + optional image + body + bullets. Add / remove /
// reorder; saves the whole list (replace-all) to /api/admin/content-sections.
//
// Used inside the ingredient editor (and later tools/techniques) — one instance
// per prose section that wants named sub-parts (Storing, Production, …).

import React, { useState } from 'react';
import { ImageUpload } from '@/components/admin/ImageUpload';
import { ChevronUp, ChevronDown, Trash2, Plus } from 'lucide-react';

export interface SubSection {
  headline: string;
  image_url: string;
  image_credit: string;
  body: string;
  bullets: string[];
}

const MONO = 'var(--font-mono)';
const MUT = 'var(--muted)';
const B = '1px solid var(--border)';

const inputStyle: React.CSSProperties = {
  width: '100%', border: B, background: 'var(--surface)', padding: '8px 10px',
  fontSize: 14, color: 'var(--fg)', outline: 'none',
};
const miniLabel: React.CSSProperties = {
  display: 'block', fontFamily: MONO, fontSize: 9, color: MUT,
  textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 5,
};

export function emptySubSection(): SubSection {
  return { headline: '', image_url: '', image_credit: '', body: '', bullets: [] };
}

export function SubSectionEditor({
  entityType, entityId, slug, sectionKey, sectionLabel, value, imageKind,
}: {
  entityType: 'ingredient' | 'tool' | 'technique';
  entityId: string;
  slug: string;
  sectionKey: string;
  sectionLabel: string;
  value: SubSection[];
  imageKind: string; // upload route prefix, e.g. 'ingredients'
}) {
  const [items, setItems] = useState<SubSection[]>(value.length ? value : []);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  function update(i: number, patch: Partial<SubSection>) {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, ...patch } : it));
    setStatus(null);
  }
  function add() { setItems(prev => [...prev, emptySubSection()]); setStatus(null); }
  function remove(i: number) { setItems(prev => prev.filter((_, idx) => idx !== i)); setStatus(null); }
  function move(i: number, dir: -1 | 1) {
    setItems(prev => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setStatus(null);
  }

  async function save() {
    setSaving(true); setStatus(null);
    const res = await fetch('/api/admin/content-sections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityType, entityId, sectionKey, items }),
    });
    setSaving(false);
    if (res.ok) setStatus('Saved.');
    else {
      const d = await res.json().catch(() => ({}));
      setStatus(d.error ?? 'Save failed.');
    }
  }

  return (
    <div style={{ border: B, padding: 16, marginBottom: 18, background: 'var(--surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--accent)',
          textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          {sectionLabel} — sub-sections
        </span>
        <span style={{ fontFamily: MONO, fontSize: 10, color: MUT }}>
          {items.length} {items.length === 1 ? 'sub-section' : 'sub-sections'}
        </span>
      </div>

      {items.length === 0 && (
        <p style={{ fontSize: 12, color: MUT, fontStyle: 'italic', margin: '0 0 12px' }}>
          No sub-sections. Add one for e.g. “Ambient storage”, “Refrigerated”, “Frozen”.
        </p>
      )}

      {items.map((it, i) => (
        <div key={i} style={{ border: B, padding: 14, marginBottom: 12, background: 'var(--bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontFamily: MONO, fontSize: 10, color: MUT }}>#{i + 1}</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <IconBtn onClick={() => move(i, -1)} disabled={i === 0} title="Move up"><ChevronUp size={14} /></IconBtn>
              <IconBtn onClick={() => move(i, 1)} disabled={i === items.length - 1} title="Move down"><ChevronDown size={14} /></IconBtn>
              <IconBtn onClick={() => remove(i)} title="Remove" danger><Trash2 size={13} /></IconBtn>
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={miniLabel}>Sub-headline</label>
            <input style={inputStyle} value={it.headline}
              placeholder="e.g. Ambient storage"
              onChange={e => update(i, { headline: e.target.value })} />
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={miniLabel}>Body text</label>
            <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} value={it.body}
              onChange={e => update(i, { body: e.target.value })} />
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={miniLabel}>Bullet points (one per line)</label>
            <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
              value={it.bullets.join('\n')}
              placeholder={'Moisture evaporates through the peel\nFruit becomes lighter and softer'}
              onChange={e => update(i, { bullets: e.target.value.split('\n') })} />
          </div>

          <div>
            <label style={miniLabel}>Image (optional)</label>
            <ImageUpload kind={imageKind} slug={`${slug}-${sectionKey}-${i + 1}`}
              value={it.image_url} onChange={url => update(i, { image_url: url })} />
            {it.image_url && (
              <input style={{ ...inputStyle, marginTop: 8 }} value={it.image_credit}
                placeholder="Image credit (optional)"
                onChange={e => update(i, { image_credit: e.target.value })} />
            )}
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        <button type="button" onClick={add}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
            fontFamily: MONO, fontSize: 11, color: 'var(--accent)', background: 'none',
            border: '1px dashed var(--accent)', padding: '7px 12px', cursor: 'pointer',
            textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          <Plus size={13} /> Add sub-section
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {status && <span style={{ fontFamily: MONO, fontSize: 10, color: status === 'Saved.' ? 'var(--accent)' : '#a33' }}>{status}</span>}
          <button type="button" onClick={save} disabled={saving}
            style={{ fontFamily: MONO, fontSize: 11, color: '#fff', background: 'var(--accent)',
              border: 'none', padding: '7px 16px', cursor: saving ? 'default' : 'pointer',
              opacity: saving ? 0.6 : 1, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            {saving ? 'Saving…' : `Save ${sectionLabel.toLowerCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function IconBtn({ children, onClick, disabled, title, danger }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; title?: string; danger?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 26, height: 26, border: B, background: 'var(--surface)',
        color: disabled ? 'var(--border)' : danger ? '#a33' : MUT,
        cursor: disabled ? 'default' : 'pointer' }}>
      {children}
    </button>
  );
}
