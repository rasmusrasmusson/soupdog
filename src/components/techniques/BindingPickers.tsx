// src/components/techniques/BindingPickers.tsx
// Search-to-match pickers for specialising a task into a concept along two axes:
//   - bound ingredient (a kind/family node, e.g. "lemon") via /api/ingredients/search
//   - bound tool (equipment slug, e.g. "zester") via /api/equipment (fetched once, filtered)
// Both optional. Used in the concept-create form and on a concept's own edit page.
'use client';
import React, { useState, useEffect, useRef } from 'react';

const MONO = 'var(--font-mono)';
const MUT  = 'var(--muted)';

type Ingredient = { id: string; slug: string; name: string; is_product?: boolean; parent_id?: string | null };
type Tool = { id: string; name: string; category: string | null; slug: string | null };

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid var(--border)',
  background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'inherit',
};

// ---- Ingredient picker -----------------------------------------------------
export function IngredientPicker({
  value, valueLabel, onChange,
}: {
  value: string | null;
  valueLabel?: string | null;
  onChange: (id: string | null, label: string | null) => void;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Ingredient[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        const r = await fetch(`/api/ingredients/search?q=${encodeURIComponent(q.trim())}`).then(x => x.json());
        if (!cancelled) setResults(Array.isArray(r) ? r : []);
      } catch { if (!cancelled) setResults([]); }
    }, 200);
    return () => { cancelled = true; clearTimeout(id); };
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  if (value) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, padding: '6px 10px', border: '1px solid var(--accent)', color: 'var(--accent)', background: 'var(--accent-subtle, transparent)' }}>
          {valueLabel || 'selected ingredient'}
        </span>
        <button type="button" onClick={() => { onChange(null, null); setQ(''); }}
          style={{ background: 'transparent', border: 'none', color: MUT, fontSize: 12, cursor: 'pointer' }}>
          change
        </button>
      </div>
    );
  }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input style={inputStyle} value={q} placeholder="type to find an ingredient (e.g. lemon)"
        onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
      {open && results.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
          background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: 220, overflowY: 'auto' }}>
          {results.map(r => (
            <button key={r.id} type="button"
              onClick={() => { onChange(r.id, r.name); setOpen(false); setQ(''); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px',
                background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)',
                cursor: 'pointer', fontSize: 13, color: 'var(--fg)' }}>
              {r.name}
              {r.is_product && <span style={{ fontFamily: MONO, fontSize: 10, color: MUT, marginLeft: 6 }}>product</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Tool picker -----------------------------------------------------------
export function ToolPicker({
  value, onChange,
}: {
  value: string | null;            // the slug
  onChange: (slug: string | null, label: string | null) => void;
}) {
  const [tools, setTools] = useState<Tool[]>([]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/equipment').then(r => r.json()).then((d: Tool[]) => setTools(Array.isArray(d) ? d : [])).catch(() => setTools([]));
  }, []);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const matches = q.trim().length < 1 ? tools.slice(0, 12)
    : tools.filter(t => t.name.toLowerCase().includes(q.trim().toLowerCase()) || (t.slug ?? '').includes(q.trim().toLowerCase())).slice(0, 12);

  const current = value ? tools.find(t => t.slug === value) : null;

  if (value) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, padding: '6px 10px', border: '1px solid var(--accent)', color: 'var(--accent)' }}>
          {current?.name || value}
        </span>
        <button type="button" onClick={() => { onChange(null, null); setQ(''); }}
          style={{ background: 'transparent', border: 'none', color: MUT, fontSize: 12, cursor: 'pointer' }}>
          change
        </button>
      </div>
    );
  }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input style={inputStyle} value={q} placeholder="type to find a tool (e.g. knife, zester)"
        onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
      {open && matches.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
          background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: 220, overflowY: 'auto' }}>
          {matches.map(t => (
            <button key={t.id} type="button"
              onClick={() => { onChange(t.slug ?? null, t.name); setOpen(false); setQ(''); }}
              disabled={!t.slug}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px',
                background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)',
                cursor: t.slug ? 'pointer' : 'not-allowed', fontSize: 13, color: t.slug ? 'var(--fg)' : MUT }}>
              {t.name}
              {t.category && <span style={{ fontFamily: MONO, fontSize: 10, color: MUT, marginLeft: 6 }}>{t.category}</span>}
              {!t.slug && <span style={{ fontFamily: MONO, fontSize: 10, color: MUT, marginLeft: 6 }}>no slug</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
