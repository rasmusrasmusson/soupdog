'use client';
// src/app/products/[slug]/page.tsx
// Public product page — shows product metadata and linked recipes

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { Loader2, ExternalLink } from 'lucide-react';

const MONO = 'var(--font-mono)';
const B    = '1px solid var(--border)';

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <tr style={{ borderTop: B }}>
      <td style={{ padding: '8px 14px', fontFamily: MONO, fontSize: 10,
        textTransform: 'uppercase', letterSpacing: '0.15em',
        color: 'var(--muted)', borderRight: B, whiteSpace: 'nowrap' as const }}>
        {label}
      </td>
      <td style={{ padding: '8px 14px', fontFamily: MONO, fontSize: 12, color: 'var(--fg)' }}>
        {value}
      </td>
    </tr>
  );
}

function SectionHeader({ title, meta }: { title: string; meta?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <span style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase' as const,
        letterSpacing: '0.22em', color: 'var(--muted)' }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      {meta && <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)' }}>{meta}</span>}
    </div>
  );
}

export default function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [product,  setProduct]  = useState<any>(null);
  const [recipes,  setRecipes]  = useState<any[]>([]);
  const [parent,   setParent]   = useState<any>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string|null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient() as any;

        // Load product
        const { data: prod, error: pErr } = await supabase
          .from('ingredients')
          .select(`
            id, slug, name, brand, barcode, net_weight_g, serving_size_g,
            packaging_type, producer, country_of_origin, ingredient_list,
            allergens, description, nutrition_per_100g,
            base_temp_celsius, off_id, parent_id,
            source, confidence, is_verified, created_at
          `)
          .eq('slug', slug)
          .eq('is_product', true)
          .single();

        if (pErr || !prod) { setError('Product not found'); setLoading(false); return; }
        setProduct(prod);

        // Load parent ingredient
        if (prod.parent_id) {
          const { data: par } = await supabase
            .from('ingredients')
            .select('id, slug, name')
            .eq('id', prod.parent_id)
            .single();
          if (par) setParent(par);
        }

        // Load linked recipes (recipes that use this product as an ingredient)
        const { data: vIngredients } = await supabase
          .from('version_ingredients')
          .select('version_id')
          .eq('ingredient_id', prod.id);

        if (vIngredients?.length) {
          const versionIds = vIngredients.map((v: any) => v.version_id);
          const { data: versions } = await supabase
            .from('recipe_versions')
            .select('id, title, canonical_id')
            .in('id', versionIds);

          if (versions?.length) {
            const canonicalIds = versions.map((v: any) => v.canonical_id);
            const { data: canonicals } = await supabase
              .from('recipe_canonicals')
              .select('id, slug, is_published')
              .in('id', canonicalIds)
              .eq('is_published', true);

            if (canonicals?.length) {
              setRecipes(canonicals.map((rc: any) => {
                const v = versions.find((v: any) => v.canonical_id === rc.id);
                return { ...rc, title: v?.title ?? '(untitled)' };
              }));
            }
          }
        }

        setLoading(false);
      } catch (err: any) {
        setError(err.message);
        setLoading(false);
      }
    }
    load();
  }, [slug]);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}>
      <Loader2 size={16} className="animate-spin" style={{ color: 'var(--muted)' }} />
    </div>
  );

  if (error || !product) return (
    <div style={{ padding: 32, fontFamily: MONO, fontSize: 12, color: 'var(--muted)' }}>
      {error ?? 'Product not found'}
    </div>
  );

  const storageLabel = product.base_temp_celsius != null
    ? product.base_temp_celsius <= -15 ? `Frozen (${product.base_temp_celsius}°C)`
    : product.base_temp_celsius <= 8   ? `Refrigerated (${product.base_temp_celsius}°C)`
    : `Ambient (${product.base_temp_celsius}°C)`
    : null;

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 24px 48px' }}>

      {/* Breadcrumb */}
      <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)',
        marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Link href="/products" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Products</Link>
        {parent && (
          <>
            <span>›</span>
            <Link href={`/ingredients/${parent.slug}`}
              style={{ color: 'var(--muted)', textDecoration: 'none' }}>{parent.name}</Link>
          </>
        )}
        <span>›</span>
        <span style={{ color: 'var(--fg)' }}>{product.name}</span>
      </div>

      {/* Header */}
      <div style={{ marginBottom: 24, borderBottom: B, paddingBottom: 16 }}>
        <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>
          {product.brand ?? 'Product'}
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28,
          fontWeight: 400, margin: 0, color: 'var(--fg)' }}>
          {product.name}
        </h1>
        {product.description && (
          <p style={{ fontFamily: MONO, fontSize: 11, color: 'var(--muted)',
            marginTop: 8, lineHeight: 1.6 }}>
            {product.description}
          </p>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

        {/* Left column */}
        <div>
          {/* Product metadata */}
          <div style={{ marginBottom: 24 }}>
            <SectionHeader title="Product information" />
            <table style={{ borderCollapse: 'collapse', border: B, width: '100%' }}>
              <tbody>
                <MetaRow label="Brand"        value={product.brand} />
                <MetaRow label="Barcode"       value={product.barcode} />
                <MetaRow label="Net weight"    value={product.net_weight_g ? `${product.net_weight_g}g` : null} />
                <MetaRow label="Serving size"  value={product.serving_size_g ? `${product.serving_size_g}g` : null} />
                <MetaRow label="Packaging"     value={product.packaging_type} />
                <MetaRow label="Storage"       value={storageLabel} />
                <MetaRow label="Producer"      value={product.producer} />
                <MetaRow label="Country"       value={product.country_of_origin} />
                {parent && (
                  <MetaRow label="Category" value={
                    <Link href={`/ingredients/${parent.slug}`}
                      style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                      {parent.name}
                    </Link>
                  } />
                )}
              </tbody>
            </table>
          </div>

          {/* Nutrition */}
          {product.nutrition_per_100g && (
            <div style={{ marginBottom: 24 }}>
              <SectionHeader title="Nutrition" meta="per 100g" />
              <table style={{ borderCollapse: 'collapse', border: B, width: '100%' }}>
                <tbody>
                  {Object.entries(product.nutrition_per_100g as Record<string, number>)
                    .filter(([, v]) => v != null && v > 0)
                    .map(([key, value]) => (
                      <MetaRow key={key}
                        label={key.replace(/_/g, ' ')}
                        value={`${value}`} />
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Allergens */}
          {product.allergens?.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <SectionHeader title="Allergens" />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {product.allergens.map((a: string) => (
                  <span key={a} style={{ fontFamily: MONO, fontSize: 10, padding: '3px 8px',
                    border: B, background: 'var(--surface-hover)', textTransform: 'uppercase',
                    letterSpacing: '0.1em', color: 'var(--fg)' }}>
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column */}
        <div>
          {/* Cooking recipes */}
          <div style={{ marginBottom: 24 }}>
            <SectionHeader title="Cooking instructions" meta={`${recipes.length} recipes`} />
            {recipes.length === 0 ? (
              <div style={{ border: `1px dashed var(--border)`, padding: '24px 16px',
                textAlign: 'center' }}>
                <p style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)',
                  textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 12 }}>
                  No cooking recipes yet
                </p>
                <Link href="/my/recipes/new"
                  style={{ fontFamily: MONO, fontSize: 11, color: 'var(--accent)',
                    textDecoration: 'none', padding: '6px 12px', border: B }}>
                  Create a recipe using this product →
                </Link>
              </div>
            ) : (
              <div style={{ border: B }}>
                {recipes.map((r, i) => (
                  <Link key={r.id} href={`/recipes/${r.slug}`}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 14px', borderTop: i > 0 ? B : 'none',
                      textDecoration: 'none', color: 'var(--fg)' }}
                    className="hover:bg-[var(--surface-hover)] transition-colors">
                    <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 500 }}>
                      {r.title}
                    </span>
                    <ExternalLink size={11} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Ingredient list */}
          {product.ingredient_list && (
            <div style={{ marginBottom: 24 }}>
              <SectionHeader title="Ingredient list" />
              <div style={{ padding: '10px 14px', border: B, fontFamily: MONO,
                fontSize: 11, color: 'var(--muted)', lineHeight: 1.7 }}>
                {product.ingredient_list}
              </div>
            </div>
          )}

          {/* Data quality */}
          <div>
            <SectionHeader title="Data quality" />
            <div style={{ padding: '10px 14px', border: B }}>
              <div style={{ display: 'flex', justifyContent: 'space-between',
                fontFamily: MONO, fontSize: 10, marginBottom: 6 }}>
                <span style={{ color: 'var(--muted)', textTransform: 'uppercase',
                  letterSpacing: '0.12em' }}>Source</span>
                <span style={{ color: 'var(--fg)' }}>{product.source?.replace(/_/g, ' ')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between',
                fontFamily: MONO, fontSize: 10 }}>
                <span style={{ color: 'var(--muted)', textTransform: 'uppercase',
                  letterSpacing: '0.12em' }}>Confidence</span>
                <span style={{ color: 'var(--fg)' }}>{Math.round((product.confidence ?? 0) * 100)}%</span>
              </div>
              {product.off_id && (
                <div style={{ marginTop: 8 }}>
                  <a href={`https://world.openfoodfacts.org/product/${product.off_id}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ fontFamily: MONO, fontSize: 10, color: 'var(--accent)',
                      textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <ExternalLink size={9} /> View on Open Food Facts
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
