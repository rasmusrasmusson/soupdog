'use client';
// src/components/knowledge/CompositionEditor.tsx
//
// Edits an ingredient's Composition — the ingredients derived FROM it. Shows
// the current parts as preview cards; an "Add part" button opens a picker to
// search an existing ingredient OR create-and-link a new one. Writes via
// /api/admin/composition (sets transformed_from_id on the derived ingredient).
//
// The preview card is exported for reuse (the view page renders the same shape).

import React, { useState, useEffect, useRef } from 'react';
import { Plus, X, Search } from 'lucide-react';

const MONO = 'var(--font-mono)';
const MUT = 'var(--muted)';
const FG = 'var(--fg)';
const ACCENT = 'var(--accent)';
const B = '1px solid var(--border)';

export interface CompositionEntry {
  id: string; slug: string; name: string;
  blurb?: string | null; imageUrl?: string | null; hasRecipe?: boolean;
}

// Reusable preview card for a linked ingredient.
export function IngredientPreviewCard({ entry, onRemove, href }: {
  entry: CompositionEntry; onRemove?: () => void; href?: string;
}) {
  const inner = (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start',
      border: B, background: 'var(--surface)', padding: 12, width: '100%' }}>
      <div style={{ width: 52, height: 52, flexShrink: 0, border: B,
        background: 'var(--surface-hover)', overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {entry.imageUrl
          ? <img src={entry.imageUrl} alt={entry.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontFamily: MONO, fontSize: 9, color: MUT }}>—</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: FG, fontWeight: 500 }}>{entry.name}</div>
        {entry.blurb && (
          <div style={{ fontSize: 12, color: MUT, lineHeight: 1.45, marginTop: 2,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {entry.blurb}
          </div>
        )}
      </div>
    </div>
  );
  return (
    <div style={{ position: 'relative' }}>
      {href ? <a href={href} style={{ textDecoration: 'none', display: 'block' }}
        className="hover:opacity-80 transition-opacity">{inner}</a> : inner}
      {onRemove && (
        <button onClick={onRemove} title="Remove from composition"
          style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22,
            border: B, background: 'var(--bg)', color: '#a33', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <X size={12} />
        </button>
      )}
    </div>
  );
}

export function CompositionEditor({ parentId, parentName, value }: {
  parentId: string; parentName: string; value: CompositionEntry[];
}) {
  const [entries, setEntries] = useState<CompositionEntry[]>(value ?? []);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function unlink(childId: string) {
    setStatus(null);
    const res = await fetch(`/api/admin/composition?childId=${encodeURIComponent(childId)}`, { method: 'DELETE' });
    if (res.ok) setEntries(prev => prev.filter(e => e.id !== childId));
    else { const d = await res.json().catch(() => ({})); setStatus(d.error ?? 'Remove failed.'); }
  }

  function added(entry: CompositionEntry) {
    setEntries(prev => prev.some(e => e.id === entry.id) ? prev : [...prev, entry]);
    setPickerOpen(false);
  }

  return (
    <div style={{ border: B, padding: 16, marginBottom: 18, background: 'var(--surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontFamily: MONO, fontSize: 11, color: ACCENT,
          textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          Composition — parts of {parentName.toLowerCase()}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 10, color: MUT }}>
          {entries.length} {entries.length === 1 ? 'part' : 'parts'}
        </span>
      </div>

      {entries.length === 0 && (
        <p style={{ fontSize: 12, color: MUT, fontStyle: 'italic', margin: '0 0 12px' }}>
          No parts yet. Add the ingredients that come from {parentName.toLowerCase()} — e.g. pulp, juice, zest.
        </p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10, marginBottom: 12 }}>
        {entries.map(e => (
          <IngredientPreviewCard key={e.id} entry={e} onRemove={() => unlink(e.id)} />
        ))}
      </div>

      <button type="button" onClick={() => { setPickerOpen(true); setStatus(null); }}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
          fontFamily: MONO, fontSize: 11, color: ACCENT, background: 'none',
          border: '1px dashed var(--accent)', padding: '7px 12px', cursor: 'pointer',
          textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        <Plus size={13} /> Add part
      </button>
      {status && <span style={{ marginLeft: 12, fontFamily: MONO, fontSize: 10, color: '#a33' }}>{status}</span>}

      {pickerOpen && (
        <CompositionPicker parentId={parentId} existingIds={entries.map(e => e.id)}
          onAdded={added} onClose={() => setPickerOpen(false)} />
      )}
    </div>
  );
}

function CompositionPicker({ parentId, existingIds, onAdded, onClose }: {
  parentId: string; existingIds: string[];
  onAdded: (e: CompositionEntry) => void; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<any>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/ingredients/search?q=${encodeURIComponent(q.trim())}&exclude_products=false`);
        const data = await res.json();
        setResults(Array.isArray(data) ? data : []);
      } catch { setResults([]); }
      setSearching(false);
    }, 250);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [q]);

  async function linkExisting(childId: string) {
    setBusy(true); setError(null);
    const res = await fetch('/api/admin/composition', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentId, action: 'link', childId }),
    });
    setBusy(false);
    if (res.ok) { const d = await res.json(); onAdded(d.ingredient); }
    else { const d = await res.json().catch(() => ({})); setError(d.error ?? 'Link failed.'); }
  }

  async function createNew() {
    const name = q.trim();
    if (!name) return;
    setBusy(true); setError(null);
    const res = await fetch('/api/admin/composition', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentId, action: 'create', name }),
    });
    setBusy(false);
    if (res.ok) { const d = await res.json(); onAdded(d.ingredient); }
    else { const d = await res.json().catch(() => ({})); setError(d.error ?? 'Create failed.'); }
  }

  const filtered = results.filter(r => r.id !== parentId && !existingIds.includes(r.id));
  const exactExists = results.some(r => (r.name ?? '').toLowerCase() === q.trim().toLowerCase());

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: 'min(520px, calc(100vw - 32px))', maxHeight: '70vh',
          background: 'var(--bg)', border: B, boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
          display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 14px', borderBottom: B }}>
          <span style={{ fontFamily: MONO, fontSize: 11, color: MUT, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            Add a part
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUT }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 14, borderBottom: B }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: B, background: 'var(--surface)', padding: '8px 10px' }}>
            <Search size={14} style={{ color: MUT, flexShrink: 0 }} />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)}
              placeholder="Search ingredients, or type a new name…"
              style={{ flex: 1, border: 'none', background: 'none', outline: 'none', fontSize: 14, color: FG }} />
          </div>
          {error && <p style={{ fontFamily: MONO, fontSize: 10, color: '#a33', margin: '8px 0 0' }}>{error}</p>}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
          {searching && <p style={{ fontSize: 12, color: MUT, fontStyle: 'italic', margin: 0 }}>Searching…</p>}

          {!searching && q.trim().length >= 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filtered.map(r => (
                <button key={r.id} onClick={() => linkExisting(r.id)} disabled={busy}
                  style={{ textAlign: 'left', border: B, background: 'var(--surface)', padding: '8px 10px',
                    cursor: busy ? 'default' : 'pointer', fontSize: 13, color: FG,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                  className="hover:bg-[var(--surface-hover)] transition-colors">
                  <span>{r.name}</span>
                  <span style={{ fontFamily: MONO, fontSize: 9, color: ACCENT, textTransform: 'uppercase' }}>Link</span>
                </button>
              ))}

              {/* Create-and-link, when no exact match exists */}
              {!exactExists && (
                <button onClick={createNew} disabled={busy}
                  style={{ textAlign: 'left', border: '1px dashed var(--accent)', background: 'none',
                    padding: '8px 10px', cursor: busy ? 'default' : 'pointer', fontSize: 13, color: ACCENT,
                    display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Plus size={13} /> Create “{q.trim()}” as a new ingredient and link it
                </button>
              )}

              {filtered.length === 0 && exactExists && (
                <p style={{ fontSize: 12, color: MUT, fontStyle: 'italic', margin: 0 }}>
                  That ingredient is already linked or is this ingredient.
                </p>
              )}
            </div>
          )}

          {!searching && q.trim().length < 2 && (
            <p style={{ fontSize: 12, color: MUT, fontStyle: 'italic', margin: 0 }}>
              Type at least 2 characters to search, or a full name to create a new part.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
