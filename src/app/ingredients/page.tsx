'use client';
// src/app/ingredients/page.tsx

import React, { useState, useEffect, useCallback } from 'react';
import { Search, ChevronRight } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────
interface IngredientRow {
  id:           string;
  slug:         string;
  name:         string;
  category:     string;
  image_url?:   string;
  recipe_count: number;
  is_verified:  boolean;
}

// ── Category config ───────────────────────────────────────────
const CATEGORIES: { key: string; label: string; plural: string }[] = [
  { key: 'vegetable',  label: 'Vegetable',   plural: 'Vegetables'    },
  { key: 'fruit',      label: 'Fruit',       plural: 'Fruit'         },
  { key: 'meat',       label: 'Meat',        plural: 'Meat'          },
  { key: 'fish',       label: 'Fish',        plural: 'Fish'          },
  { key: 'dairy',      label: 'Dairy',       plural: 'Dairy'         },
  { key: 'grain',      label: 'Grain',       plural: 'Grains'        },
  { key: 'spice',      label: 'Spice',       plural: 'Spices'        },
  { key: 'herb',       label: 'Herb',        plural: 'Herbs'         },
  { key: 'oil',        label: 'Oil',         plural: 'Oils & Fats'   },
  { key: 'liquid',     label: 'Liquid',      plural: 'Liquids'       },
  { key: 'condiment',  label: 'Condiment',   plural: 'Condiments'    },
  { key: 'prepared',   label: 'Prepared',    plural: 'Prepared foods'},
  { key: 'other',      label: 'Other',       plural: 'Other'         },
];

const MONO = 'var(--font-mono)';
const MUT  = 'var(--muted)';
const B    = '1px solid var(--border)';

// ── Ingredient row component ──────────────────────────────────
function IngRow({ ing }: { ing: IngredientRow }) {
  return (
    <a
      href={`/ingredients/${ing.slug}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '8px 0', borderBottom: B,
        textDecoration: 'none', transition: 'background 0.1s',
      }}
      className="group hover:bg-[var(--surface-hover)] -mx-3 px-3 rounded-none"
    >
      {/* Thumbnail or placeholder */}
      <div style={{
        width: 36, height: 27, flexShrink: 0,
        border: B, overflow: 'hidden',
        background: 'var(--surface-hover)',
      }}>
        {ing.image_url
          ? <img src={ing.image_url} alt={ing.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          : <div style={{ width: '100%', height: '100%',
              background: 'var(--surface-hover)' }} />
        }
      </div>

      {/* Name */}
      <span style={{
        flex: 1, fontSize: 13, color: 'var(--fg)', fontWeight: 500,
        minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}
        className="group-hover:text-[var(--accent)] transition-colors">
        {ing.name}
      </span>

      {/* Recipe count */}
      {ing.recipe_count > 0 && (
        <span style={{ fontFamily: MONO, fontSize: 10, color: MUT, flexShrink: 0 }}>
          {ing.recipe_count} {ing.recipe_count === 1 ? 'recipe' : 'recipes'}
        </span>
      )}

      <ChevronRight size={11} style={{ color: MUT, flexShrink: 0 }}
        className="opacity-0 group-hover:opacity-100 transition-opacity" />
    </a>
  );
}

// ── Category section ──────────────────────────────────────────
function CategorySection({
  category, ingredients, defaultExpanded,
}: {
  category: { key: string; label: string; plural: string };
  ingredients: IngredientRow[];
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const PREVIEW = 6;
  const shown = expanded ? ingredients : ingredients.slice(0, PREVIEW);
  const hasMore = ingredients.length > PREVIEW;

  return (
    <div style={{ marginBottom: 8 }}>
      {/* Category header */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', padding: '10px 0',
          background: 'none', border: 'none', borderTop: B,
          cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontFamily: MONO, fontSize: 10, textTransform: 'uppercase',
            letterSpacing: '0.18em', color: 'var(--fg)', fontWeight: 600,
          }}>
            {category.plural}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 10, color: MUT }}>
            {ingredients.length}
          </span>
        </div>
        <ChevronRight size={12} style={{
          color: MUT, transition: 'transform 0.15s',
          transform: expanded ? 'rotate(90deg)' : 'none',
          flexShrink: 0,
        }} />
      </button>

      {/* Ingredient rows */}
      {expanded && (
        <div style={{ paddingBottom: 8 }}>
          {shown.map(ing => <IngRow key={ing.id} ing={ing} />)}
          {hasMore && !expanded && (
            <button
              onClick={() => setExpanded(true)}
              style={{
                fontFamily: MONO, fontSize: 10, color: 'var(--accent)',
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '6px 0', textDecoration: 'none',
              }}
            >
              + {ingredients.length - PREVIEW} more
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function IngredientsPage() {
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [query, setQuery]             = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  useEffect(() => {
    async function load() {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient() as any;

      // Fetch all ingredients with recipe counts
      const { data } = await supabase
        .from('ingredients')
        .select(`
          id, slug, name, category, image_url, is_verified,
          version_ingredients ( version_id )
        `)
        .order('name');

      if (!data) { setLoading(false); return; }

      // Count distinct published recipes per ingredient
      const rows: IngredientRow[] = data.map((r: any) => ({
        id:           r.id,
        slug:         r.slug,
        name:         r.name,
        category:     r.category,
        image_url:    r.image_url ?? undefined,
        is_verified:  r.is_verified,
        recipe_count: (r.version_ingredients ?? []).length,
      }));

      setIngredients(rows);
      setLoading(false);
    }
    load();
  }, []);

  // ── Filter logic ─────────────────────────────────────────────
  const filtered = ingredients.filter(ing => {
    const matchesQuery = query.length < 2 ||
      ing.name.toLowerCase().includes(query.toLowerCase());
    const matchesCategory = activeCategory === 'all' ||
      ing.category === activeCategory;
    return matchesQuery && matchesCategory;
  });

  // Group by category (preserving CATEGORIES order)
  const grouped = CATEGORIES
    .map(cat => ({
      category: cat,
      ingredients: filtered.filter(i => i.category === cat.key),
    }))
    .filter(g => g.ingredients.length > 0);

  const totalCount = ingredients.length;
  const isSearching = query.length >= 2 || activeCategory !== 'all';

  return (
    <>
      {/* SEO structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: 'Ingredients — Soupdog',
          description: 'Detailed nutritional information, history, and culinary guides for ingredients and food products.',
          url: 'https://soup.dog/ingredients',
        }) }}
      />

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 32px 80px' }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 className="font-display"
            style={{ fontSize: 28, fontWeight: 400, color: 'var(--fg)',
              margin: '0 0 8px' }}>
            Ingredients
          </h1>
          <p style={{ fontSize: 13, color: MUT, margin: 0, lineHeight: 1.6 }}>
            Nutritional data, history, and culinary guides for ingredients and food products.
            {totalCount > 0 && (
              <span style={{ fontFamily: MONO, fontSize: 11, marginLeft: 8 }}>
                {totalCount} entries
              </span>
            )}
          </p>
        </div>

        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          border: B, padding: '10px 14px', marginBottom: 20,
          background: 'var(--surface)',
        }}>
          <Search size={14} style={{ color: MUT, flexShrink: 0 }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search ingredients…"
            style={{
              flex: 1, background: 'transparent', border: 'none',
              fontSize: 13, color: 'var(--fg)', outline: 'none',
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{
                fontFamily: MONO, fontSize: 10, color: MUT,
                background: 'none', border: 'none', cursor: 'pointer',
                padding: 0,
              }}
            >
              ESC
            </button>
          )}
        </div>

        {/* Category filter pills */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 28,
        }}>
          <button
            onClick={() => setActiveCategory('all')}
            style={{
              fontFamily: MONO, fontSize: 10, padding: '4px 12px',
              border: activeCategory === 'all' ? '1px solid var(--accent)' : B,
              background: activeCategory === 'all' ? 'var(--accent-subtle)' : 'var(--surface)',
              color: activeCategory === 'all' ? 'var(--accent)' : MUT,
              cursor: 'pointer', transition: 'all 0.15s',
              textTransform: 'uppercase', letterSpacing: '0.1em',
            }}
          >
            All
          </button>
          {CATEGORIES.filter(cat =>
            ingredients.some(i => i.category === cat.key)
          ).map(cat => (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(
                activeCategory === cat.key ? 'all' : cat.key
              )}
              style={{
                fontFamily: MONO, fontSize: 10, padding: '4px 12px',
                border: activeCategory === cat.key
                  ? '1px solid var(--accent)' : B,
                background: activeCategory === cat.key
                  ? 'var(--accent-subtle)' : 'var(--surface)',
                color: activeCategory === cat.key ? 'var(--accent)' : MUT,
                cursor: 'pointer', transition: 'all 0.15s',
                textTransform: 'uppercase', letterSpacing: '0.1em',
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          /* Loading skeleton */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[1,2,3].map(i => (
              <div key={i} style={{ borderTop: B, padding: '10px 0' }}>
                <div style={{ height: 12, width: 120, background: 'var(--surface-hover)',
                  marginBottom: 12, animation: 'pulse 1.5s ease-in-out infinite' }} />
                {[1,2,3,4].map(j => (
                  <div key={j} style={{ height: 10, width: `${60 + j * 8}%`,
                    background: 'var(--surface-hover)', marginBottom: 8,
                    animation: 'pulse 1.5s ease-in-out infinite' }} />
                ))}
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '48px 0', textAlign: 'center',
            fontFamily: MONO, fontSize: 11, color: MUT,
            textTransform: 'uppercase', letterSpacing: '0.15em' }}>
            {isSearching ? 'No ingredients found.' : 'No ingredients yet.'}
          </div>
        ) : isSearching && query.length >= 2 ? (
          /* Flat search results — no grouping */
          <div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: MUT,
              textTransform: 'uppercase', letterSpacing: '0.15em',
              marginBottom: 12 }}>
              {filtered.length} result{filtered.length !== 1 ? 's' : ''}
            </div>
            {filtered.map(ing => <IngRow key={ing.id} ing={ing} />)}
          </div>
        ) : (
          /* Grouped by category */
          <div>
            {grouped.map((g, i) => (
              <CategorySection
                key={g.category.key}
                category={g.category}
                ingredients={g.ingredients}
                defaultExpanded={i < 3}
              />
            ))}
          </div>
        )}

        {/* Footer note */}
        <div style={{
          marginTop: 48, paddingTop: 20, borderTop: B,
          fontFamily: MONO, fontSize: 10, color: MUT,
          lineHeight: 1.7,
        }}>
          Ingredients are added automatically when used in recipes.
          Nutritional data sourced from USDA FoodData Central.
        </div>

      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </>
  );
}
