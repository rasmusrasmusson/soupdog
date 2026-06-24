// src/app/nutrients/page.tsx
'use client';
import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type Nutrient = {
  id: string;
  key: string;
  name: string;
  category: string;
  unit: string;
  display_order: number | null;
  summary: string | null;
  published: boolean;
};

const MONO = 'var(--font-mono)';

const CATEGORY_LABELS: Record<string, string> = {
  macro: 'Macronutrients',
  vitamin: 'Vitamins',
  mineral: 'Minerals',
  fatty_acid: 'Fats & fatty acids',
  amino_acid: 'Amino acids',
  other: 'Other',
};
const CATEGORY_ORDER = ['macro', 'vitamin', 'mineral', 'fatty_acid', 'amino_acid', 'other'];

const prettify = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const categoryLabel = (c: string) => CATEGORY_LABELS[c] ?? prettify(c);

export default function NutrientsPage() {
  const [nutrients, setNutrients] = useState<Nutrient[] | null>(null);
  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState<string>('all');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetch('/api/admin/check').then(r => r.json()).then(d => setIsAdmin(Boolean(d.isAdmin))).catch(() => setIsAdmin(false));
  }, []);

  useEffect(() => {
    const supabase = createClient() as any;
    supabase
      .from('nutrient')
      .select('id, key, name, category, unit, display_order, summary, published')
      .order('display_order', { ascending: true })
      .then(({ data }: any) => setNutrients(data ?? []));
  }, []);

  const categories = useMemo(() => {
    if (!nutrients) return [];
    const present = Array.from(new Set(nutrients.map(n => n.category)));
    return present.sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a); const ib = CATEGORY_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, [nutrients]);

  const filtered = useMemo(() => {
    if (!nutrients) return [];
    const q = query.trim().toLowerCase();
    return nutrients.filter(n => {
      if (activeCat !== 'all' && n.category !== activeCat) return false;
      if (q && !n.name.toLowerCase().includes(q) && !n.key.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [nutrients, query, activeCat]);

  const grouped = useMemo(() => {
    const m = new Map<string, Nutrient[]>();
    for (const n of filtered) {
      if (!m.has(n.category)) m.set(n.category, []);
      m.get(n.category)!.push(n);
    }
    return categories.filter(c => m.has(c)).map(c => [c, m.get(c)!] as [string, Nutrient[]]);
  }, [filtered, categories]);

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '32px 24px 80px' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, marginBottom: 6 }}>
        Nutrients
      </h1>
      <p style={{ fontFamily: MONO, fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 24 }}>
        What each nutrient does, how much you need, and which ingredients are richest in it —
        drawn from Soupdog's ingredient data.
      </p>

      {/* Search */}
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search nutrients…"
        style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)',
          background: 'var(--surface)', color: 'var(--fg)', fontFamily: MONO, fontSize: 13,
          outline: 'none', boxSizing: 'border-box', marginBottom: 14 }}
      />

      {/* Category filter buttons */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 28 }}>
        <FilterBtn label="All" active={activeCat === 'all'} onClick={() => setActiveCat('all')} />
        {categories.map(c => (
          <FilterBtn key={c} label={categoryLabel(c)} active={activeCat === c} onClick={() => setActiveCat(c)} />
        ))}
      </div>

      {nutrients === null ? (
        <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--muted)' }}>Loading…</div>
      ) : grouped.length === 0 ? (
        <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--muted)' }}>No nutrients match.</div>
      ) : (
        grouped.map(([cat, items]) => (
          <div key={cat} style={{ marginBottom: 32 }}>
            <div style={{ fontFamily: MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em',
              color: 'var(--accent)', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
              {categoryLabel(cat)} <span style={{ color: 'var(--muted)', opacity: 0.6 }}>· {items.length}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
              {items.map(n => (
                <Link key={n.id} href={`/nutrients/${n.key}`}
                  style={{ display: 'block', padding: '10px 12px', border: '1px solid var(--border)',
                    background: 'var(--surface)', textDecoration: 'none', transition: 'border-color 0.15s' }}
                  className="hover:border-[var(--accent)]">
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--fg)' }}>{n.name}</span>
                    <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)' }}>{n.unit}</span>
                  </div>
                  {n.summary && (
                    <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)', lineHeight: 1.5, marginTop: 4 }}>
                      {n.summary}
                    </div>
                  )}
                  {isAdmin && !n.published && (
                    <span style={{ fontFamily: MONO, fontSize: 8, color: '#b45309', marginTop: 4, display: 'inline-block' }}>
                      DRAFT
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function FilterBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      style={{ fontFamily: MONO, fontSize: 10, padding: '5px 11px',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        background: active ? 'var(--accent)' : 'var(--surface)',
        color: active ? 'var(--bg)' : 'var(--muted)', cursor: 'pointer' }}>
      {label}
    </button>
  );
}
