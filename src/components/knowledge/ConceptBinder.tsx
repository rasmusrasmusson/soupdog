'use client';
// src/components/knowledge/ConceptBinder.tsx
//
// Binds GLOBAL concepts (name bindings) to an entity (ingredient | recipe).
// Shows bound concepts as removable chips; an "Add concept" picker searches
// existing concepts or creates-and-binds a new one. Writes via
// /api/admin/concepts (admin-gated). Saves immediately (live), like the
// Composition editor. Reusable across ingredient and recipe pages.

import React, { useState, useEffect, useRef } from 'react';
import { Plus, X, Search } from 'lucide-react';

const MONO = 'var(--font-mono)';
const MUT = 'var(--muted)';
const FG = 'var(--fg)';
const ACCENT = 'var(--accent)';
const B = '1px solid var(--border)';

export interface BoundConcept { memberId: string; conceptId: string; name: string; note?: string | null }

export function ConceptBinder({ entityType, entityId, value }: {
  entityType: 'ingredient' | 'recipe'; entityId: string; value?: BoundConcept[];
}) {
  const [bound, setBound] = useState<BoundConcept[]>(value ?? []);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // If no initial value was supplied, self-load the current bindings. This lets
  // the binder be dropped in with just entityType+entityId (e.g. the recipe edit
  // page) without the host having to pre-fetch.
  useEffect(() => {
    if (value !== undefined) return;
    let live = true;
    fetch(`/api/admin/concepts?entityType=${entityType}&entityId=${encodeURIComponent(entityId)}`)
      .then(r => r.ok ? r.json() : { concepts: [] })
      .then(d => { if (live) setBound(Array.isArray(d.concepts) ? d.concepts : []); })
      .catch(() => {});
    return () => { live = false; };
  }, [entityType, entityId, value]);

  async function unbind(memberId: string) {
    setStatus(null);
    const res = await fetch(`/api/admin/concepts?memberId=${encodeURIComponent(memberId)}`, { method: 'DELETE' });
    if (res.ok) setBound(prev => prev.filter(c => c.memberId !== memberId));
    else { const d = await res.json().catch(() => ({})); setStatus(d.error ?? 'Remove failed.'); }
  }

  function added(c: BoundConcept) {
    setBound(prev => prev.some(x => x.conceptId === c.conceptId) ? prev : [...prev, c]);
    setPickerOpen(false);
  }

  return (
    <div style={{ border: B, padding: 16, marginBottom: 18, background: 'var(--surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontFamily: MONO, fontSize: 11, color: ACCENT, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          Concepts — names this is known by
        </span>
        <span style={{ fontFamily: MONO, fontSize: 10, color: MUT }}>
          {bound.length} {bound.length === 1 ? 'name' : 'names'}
        </span>
      </div>

      {bound.length === 0 && (
        <p style={{ fontSize: 12, color: MUT, fontStyle: 'italic', margin: '0 0 12px' }}>
          No concept names yet. A concept is a name people know this by (e.g. a dish name). Global names only for now.
        </p>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {bound.map(c => (
          <span key={c.memberId}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: B,
              background: 'var(--bg)', padding: '5px 8px 5px 11px', fontSize: 13, color: FG }}>
            {c.name}
            <button onClick={() => unbind(c.memberId)} title="Remove this name"
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#a33', display: 'inline-flex' }}>
              <X size={12} />
            </button>
          </span>
        ))}
      </div>

      <button type="button" onClick={() => { setPickerOpen(true); setStatus(null); }}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: MONO, fontSize: 11,
          color: ACCENT, background: 'none', border: '1px dashed var(--accent)', padding: '7px 12px',
          cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        <Plus size={13} /> Add concept
      </button>
      {status && <span style={{ marginLeft: 12, fontFamily: MONO, fontSize: 10, color: '#a33' }}>{status}</span>}

      {pickerOpen && (
        <ConceptPicker entityType={entityType} entityId={entityId} existingIds={bound.map(c => c.conceptId)}
          onAdded={added} onClose={() => setPickerOpen(false)} />
      )}
    </div>
  );
}

function ConceptPicker({ entityType, entityId, existingIds, onAdded, onClose }: {
  entityType: 'ingredient' | 'recipe'; entityId: string; existingIds: string[];
  onAdded: (c: BoundConcept) => void; onClose: () => void;
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
        const res = await fetch(`/api/concepts/search?q=${encodeURIComponent(q.trim())}`);
        const data = await res.json();
        setResults(Array.isArray(data.concepts) ? data.concepts : []);
      } catch { setResults([]); }
      setSearching(false);
    }, 250);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [q]);

  async function bindExisting(conceptId: string) {
    setBusy(true); setError(null);
    const res = await fetch('/api/admin/concepts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'bind', conceptId, entityType, entityId }),
    });
    setBusy(false);
    if (res.ok) { const d = await res.json(); onAdded(d.member); }
    else { const d = await res.json().catch(() => ({})); setError(d.error ?? 'Bind failed.'); }
  }

  async function createAndBind() {
    const name = q.trim();
    if (!name) return;
    setBusy(true); setError(null);
    const res = await fetch('/api/admin/concepts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'createAndBind', name, entityType, entityId }),
    });
    setBusy(false);
    if (res.ok) { const d = await res.json(); onAdded(d.member); }
    else { const d = await res.json().catch(() => ({})); setError(d.error ?? 'Create failed.'); }
  }

  const filtered = results.filter(r => !existingIds.includes(r.id));
  const exactExists = results.some(r => (r.name ?? '').toLowerCase() === q.trim().toLowerCase());

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: 'min(520px, calc(100vw - 32px))', maxHeight: '70vh', background: 'var(--bg)',
          border: B, boxShadow: '0 12px 40px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: B }}>
          <span style={{ fontFamily: MONO, fontSize: 11, color: MUT, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            Add a concept name
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUT }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 14, borderBottom: B }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: B, background: 'var(--surface)', padding: '8px 10px' }}>
            <Search size={14} style={{ color: MUT, flexShrink: 0 }} />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)}
              placeholder="Search concepts, or type a new name…"
              style={{ flex: 1, border: 'none', background: 'none', outline: 'none', fontSize: 14, color: FG }} />
          </div>
          {error && <p style={{ fontFamily: MONO, fontSize: 10, color: '#a33', margin: '8px 0 0' }}>{error}</p>}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
          {searching && <p style={{ fontSize: 12, color: MUT, fontStyle: 'italic', margin: 0 }}>Searching…</p>}
          {!searching && q.trim().length >= 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filtered.map(r => (
                <button key={r.id} onClick={() => bindExisting(r.id)} disabled={busy}
                  style={{ textAlign: 'left', border: B, background: 'var(--surface)', padding: '8px 10px',
                    cursor: busy ? 'default' : 'pointer', fontSize: 13, color: FG,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                  className="hover:bg-[var(--surface-hover)] transition-colors">
                  <span>{r.name}</span>
                  <span style={{ fontFamily: MONO, fontSize: 9, color: ACCENT, textTransform: 'uppercase' }}>Bind</span>
                </button>
              ))}
              {!exactExists && (
                <button onClick={createAndBind} disabled={busy}
                  style={{ textAlign: 'left', border: '1px dashed var(--accent)', background: 'none',
                    padding: '8px 10px', cursor: busy ? 'default' : 'pointer', fontSize: 13, color: ACCENT,
                    display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Plus size={13} /> Create “{q.trim()}” as a new concept and bind it
                </button>
              )}
              {filtered.length === 0 && exactExists && (
                <p style={{ fontSize: 12, color: MUT, fontStyle: 'italic', margin: 0 }}>
                  That concept is already bound.
                </p>
              )}
            </div>
          )}
          {!searching && q.trim().length < 2 && (
            <p style={{ fontSize: 12, color: MUT, fontStyle: 'italic', margin: 0 }}>
              Type at least 2 characters to search, or a full name to create a new concept.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
