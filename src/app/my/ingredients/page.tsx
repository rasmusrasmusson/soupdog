'use client';
// src/app/my/ingredients/page.tsx
// Manage ingredients and products you've created

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, ExternalLink, Pencil, Loader2, Package } from 'lucide-react';

const MONO = { fontFamily: 'var(--font-mono)' } as const;
const B    = '1px solid var(--border)';

interface IngredientRow {
  id:           string;
  slug:         string;
  name:         string;
  brand:        string | null;
  barcode:      string | null;
  is_product:   boolean;
  category:     string;
  created_at:   string;
}

export default function MyIngredientsPage() {
  const [items,   setItems]   = useState<IngredientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState<'all'|'products'|'generic'>('all');

  useEffect(() => {
    fetch('/api/my/ingredients')
      .then(r => r.json())
      .then(d => { setItems(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = items.filter(i => {
    if (tab === 'products') return i.is_product;
    if (tab === 'generic')  return !i.is_product;
    return true;
  });

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 24px 48px' }}>

      <div style={{ display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-end', borderBottom: B, paddingBottom: 16, marginBottom: 24 }}>
        <div>
          <div style={{ ...MONO, fontSize: 9, textTransform: 'uppercase',
            letterSpacing: '0.22em', color: 'var(--muted)', marginBottom: 4 }}>
            My Kitchen
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24,
            fontWeight: 400, margin: 0 }}>Ingredients & Products</h1>
          <p style={{ ...MONO, fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            Ingredients you've added to the taxonomy, including packaged products.
          </p>
        </div>
        <Link href="/my/ingredients/new"
          style={{ display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', background: 'var(--accent)', color: '#fff',
            textDecoration: 'none', ...MONO, fontSize: 11 }}>
          <Plus size={12} /> Add ingredient
        </Link>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: B, marginBottom: 20 }}>
        {([['all', 'All'], ['products', 'Products'], ['generic', 'Generic']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ ...MONO, fontSize: 11, padding: '8px 16px', border: 'none',
              borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab === key ? 'var(--accent)' : 'var(--muted)',
              background: 'none', cursor: 'pointer',
              textTransform: 'uppercase', letterSpacing: '0.12em',
              fontWeight: tab === key ? 600 : 400 }}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Loader2 size={16} className="animate-spin" style={{ color: 'var(--muted)' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ border: `1px dashed var(--border)`, padding: '48px 24px',
          textAlign: 'center', color: 'var(--muted)' }}>
          <p style={{ ...MONO, fontSize: 11, textTransform: 'uppercase',
            letterSpacing: '0.15em', marginBottom: 16 }}>
            {tab === 'products' ? 'No products yet' : tab === 'generic' ? 'No generic ingredients yet' : 'Nothing added yet'}
          </p>
          <Link href="/my/ingredients/new"
            style={{ ...MONO, fontSize: 11, color: 'var(--accent)',
              textDecoration: 'none', padding: '8px 16px', border: B }}>
            Add your first ingredient →
          </Link>
        </div>
      ) : (
        <table style={{ borderCollapse: 'collapse', border: B, width: '100%', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--surface-hover)' }}>
              {['Name', 'Brand', 'Barcode', 'Category', 'Type'].map((h, i, arr) => (
                <th key={h} style={{ padding: '8px 14px', ...MONO, fontSize: 9,
                  textTransform: 'uppercase', letterSpacing: '0.18em',
                  color: 'var(--muted)', textAlign: 'left',
                  borderRight: i < arr.length - 1 ? B : 'none' }}>
                  {h}
                </th>
              ))}
              <th style={{ padding: '8px 14px' }} />
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => (
              <tr key={item.id} style={{ borderTop: B }}>
                <td style={{ padding: '10px 14px', borderRight: B, fontWeight: 500 }}>
                  <Link href={`/ingredients/${item.slug}`}
                    style={{ color: 'var(--fg)', textDecoration: 'none' }}
                    className="hover:text-[var(--accent)]">
                    {item.name}
                  </Link>
                </td>
                <td style={{ padding: '10px 14px', borderRight: B, ...MONO, color: 'var(--muted)' }}>
                  {item.brand ?? '—'}
                </td>
                <td style={{ padding: '10px 14px', borderRight: B, ...MONO, fontSize: 10, color: 'var(--muted)' }}>
                  {item.barcode ?? '—'}
                </td>
                <td style={{ padding: '10px 14px', borderRight: B, ...MONO, fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  {item.category}
                </td>
                <td style={{ padding: '10px 14px', borderRight: B }}>
                  {item.is_product ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4,
                      ...MONO, fontSize: 9, color: 'var(--accent)',
                      textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      <Package size={9} /> Product
                    </span>
                  ) : (
                    <span style={{ ...MONO, fontSize: 9, color: 'var(--muted)',
                      textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      Generic
                    </span>
                  )}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <Link href={`/my/ingredients/${item.id}/edit`}
                      style={{ display: 'flex', alignItems: 'center', gap: 4,
                        ...MONO, fontSize: 10, color: 'var(--muted)', textDecoration: 'none' }}>
                      <Pencil size={10} /> Edit
                    </Link>
                    <Link href={`/ingredients/${item.slug}`}
                      style={{ display: 'flex', alignItems: 'center', gap: 4,
                        ...MONO, fontSize: 10, color: 'var(--muted)', textDecoration: 'none' }}>
                      <ExternalLink size={10} /> View
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
