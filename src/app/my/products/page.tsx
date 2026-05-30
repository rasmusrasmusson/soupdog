'use client';
// src/app/my/products/page.tsx

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, ExternalLink, Loader2, Pencil } from 'lucide-react';

const MONO = { fontFamily: 'var(--font-mono)' } as const;
const B    = '1px solid var(--border)';

interface Product {
  id: string; slug: string; name: string;
  brand: string | null; barcode: string | null;
  net_weight_g: number | null; base_state: string | null;
  packaging_type: string | null; is_verified: boolean;
  created_at: string;
}

export default function MyProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    fetch('/api/my/products')
      .then(r => r.json())
      .then(d => { setProducts(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 24px 48px' }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
        borderBottom: B, paddingBottom: 16, marginBottom: 24 }}>
        <div>
          <div style={{ ...MONO, fontSize: 9, textTransform: 'uppercase',
            letterSpacing: '0.22em', color: 'var(--muted)', marginBottom: 4 }}>
            My Kitchen
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24,
            fontWeight: 400, margin: 0 }}>Products</h1>
          <p style={{ ...MONO, fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            Packaged foods you've registered with cooking profiles.
          </p>
        </div>
        <Link href="/my/products/new"
          style={{ display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', background: 'var(--accent)', color: '#fff',
            textDecoration: 'none', ...MONO, fontSize: 11 }}>
          <Plus size={12} /> Register product
        </Link>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Loader2 size={16} className="animate-spin" style={{ color: 'var(--muted)' }} />
        </div>
      ) : products.length === 0 ? (
        <div style={{ border: `1px dashed var(--border)`, padding: '48px 24px',
          textAlign: 'center', color: 'var(--muted)' }}>
          <p style={{ ...MONO, fontSize: 11, textTransform: 'uppercase',
            letterSpacing: '0.15em', marginBottom: 16 }}>
            No products yet
          </p>
          <Link href="/my/products/new"
            style={{ ...MONO, fontSize: 11, color: 'var(--accent)',
              textDecoration: 'none', padding: '8px 16px', border: B }}>
            Register your first product →
          </Link>
        </div>
      ) : (
        <table style={{ borderCollapse: 'collapse', border: B, width: '100%', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--surface-hover)' }}>
              {['Product','Brand','Barcode','Weight','State','Packaging'].map(h => (
                <th key={h} style={{ padding: '8px 14px', ...MONO, fontSize: 9,
                  textTransform: 'uppercase', letterSpacing: '0.18em',
                  color: 'var(--muted)', textAlign: 'left', borderRight: B }}>
                  {h}
                </th>
              ))}
              <th style={{ padding: '8px 14px', ...MONO, fontSize: 9 }} />
            </tr>
          </thead>
          <tbody>
            {products.map(p => (
              <tr key={p.id} style={{ borderTop: B }}>
                <td style={{ padding: '10px 14px', borderRight: B, fontWeight: 500 }}>
                  <Link href={`/products/${p.slug}`}
                    style={{ color: 'var(--fg)', textDecoration: 'none' }}
                    className="hover:text-[var(--accent)]">
                    {p.name}
                  </Link>
                </td>
                <td style={{ padding: '10px 14px', borderRight: B, ...MONO, color: 'var(--muted)' }}>
                  {p.brand ?? '—'}
                </td>
                <td style={{ padding: '10px 14px', borderRight: B, ...MONO, fontSize: 10, color: 'var(--muted)' }}>
                  {p.barcode ?? '—'}
                </td>
                <td style={{ padding: '10px 14px', borderRight: B, ...MONO, color: 'var(--muted)' }}>
                  {p.net_weight_g ? `${p.net_weight_g}g` : '—'}
                </td>
                <td style={{ padding: '10px 14px', borderRight: B, ...MONO, fontSize: 10,
                  color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  {p.base_state ?? '—'}
                </td>
                <td style={{ padding: '10px 14px', borderRight: B, ...MONO, fontSize: 10, color: 'var(--muted)' }}>
                  {p.packaging_type ?? '—'}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <Link href={`/my/products/${p.id}/edit`}
                      style={{ display: 'flex', alignItems: 'center', gap: 4,
                        ...MONO, fontSize: 10, color: 'var(--muted)', textDecoration: 'none' }}>
                      <Pencil size={10} /> Edit
                    </Link>
                    <Link href={`/products/${p.slug}`}
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
