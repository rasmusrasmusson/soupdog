'use client';
// src/app/ingredients/[slug]/page.tsx

import React, { useState, useEffect, use } from 'react';
import { ChevronRight, ExternalLink, Leaf, FlaskConical } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────
interface NutritionPer100g {
  calories?:          number;
  carbohydrates?:     number;
  sugar?:             number;
  protein?:           number;
  fat?:               number;
  saturated_fat?:     number;
  monounsaturated_fat?: number;
  polyunsaturated_fat?: number;
  trans_fat?:         number;
  fiber?:             number;
  sodium?:            number;
  cholesterol?:       number;
  omega3?:            number;
  omega6?:            number;
  vitamin_a?:         number;
  vitamin_c?:         number;
  vitamin_d?:         number;
  vitamin_e?:         number;
  vitamin_k?:         number;
  thiamin?:           number;
  riboflavin?:        number;
  niacin?:            number;
  vitamin_b6?:        number;
  folate?:            number;
  vitamin_b12?:       number;
  pantothenic_acid?:  number;
  calcium?:           number;
  iron?:              number;
  magnesium?:         number;
  phosphorus?:        number;
  potassium?:         number;
  zinc?:              number;
  copper?:            number;
  manganese?:         number;
  selenium?:          number;
}

interface Ingredient {
  id:                   string;
  slug:                 string;
  name:                 string;
  description?:         string;
  category:             string;
  summary?:             string;
  taste_profile?:       string;
  uses?:                string[];
  history?:             string;
  manufacturing_notes?: string;
  cultural_notes?:      string;
  nutrition_per_100g?:  NutritionPer100g;
  nutrition_source?:    string;
  allergens?:           string[];
  season?:              string[];
  storage_notes?:       string;
  is_vegan?:            boolean;
  is_vegetarian?:       boolean;
  is_halal?:            boolean;
  is_kosher?:           boolean;
  is_gluten_free?:      boolean;
  brand?:               string;
  manufacturer?:        string;
  is_product?:          boolean;
  barcode?:             string;
  net_weight_g?:        number;
  serving_size_g?:      number;
  packaging_type?:      string;
  producer?:            string;
  country_of_origin?:   string;
  ingredient_list?:     string;
  base_temp_celsius?:   number;
  off_id?:              string;
  image_url?:           string;
  image_credit?:        string;
  content_reviewed?:    boolean;
  ai_content_generated_at?: string;
  needsAiContent?:      boolean;
  recipeCount:          number;
  parent?:              { id: string; slug: string; name: string } | null;
  siblings:             { id: string; slug: string; name: string }[];
  children:             { id: string; slug: string; name: string }[];
  transformationRecipe?: { title: string; slug: string } | null;
  linkedRecipes?: { id: string; slug: string; title: string }[];
}

// ── Helpers ───────────────────────────────────────────────────
const MONO = 'var(--font-mono)';
const MUT  = 'var(--muted)';
const B    = '1px solid var(--border)';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_KEYS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

const ALLERGEN_LABELS: Record<string, string> = {
  gluten: 'Gluten', crustaceans: 'Crustaceans', eggs: 'Eggs',
  fish: 'Fish', peanuts: 'Peanuts', soy: 'Soy', dairy: 'Dairy',
  nuts: 'Tree nuts', celery: 'Celery', mustard: 'Mustard',
  sesame: 'Sesame', sulphites: 'Sulphites', lupin: 'Lupin', molluscs: 'Molluscs',
};

function fmt(v: number | undefined, unit: string): string | null {
  if (v == null) return null;
  return `${v}${unit}`;
}

// ── Section wrapper ───────────────────────────────────────────
function Section({
  title, children, defaultOpen = false, badge
}: {
  title: string; children: React.ReactNode; defaultOpen?: boolean; badge?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: B }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', padding: '12px 0',
          background: 'none', border: 'none', cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: MONO, fontSize: 10, textTransform: 'uppercase',
            letterSpacing: '0.18em', color: 'var(--fg)', fontWeight: 600 }}>
            {title}
          </span>
          {badge && (
            <span style={{ fontFamily: MONO, fontSize: 9, color: MUT,
              border: B, padding: '1px 6px' }}>
              {badge}
            </span>
          )}
        </div>
        <ChevronRight size={12} style={{
          color: MUT, transition: 'transform 0.15s',
          transform: open ? 'rotate(90deg)' : 'none',
        }} />
      </button>
      {open && <div style={{ paddingBottom: 16 }}>{children}</div>}
    </div>
  );
}

// ── AI content placeholder ────────────────────────────────────
function AiPlaceholder({ lines = 3 }: { lines?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} style={{
          height: 12, background: 'var(--surface-hover)',
          width: i === lines - 1 ? '60%' : '100%',
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
      ))}
    </div>
  );
}

// ── Nutrition row ─────────────────────────────────────────────
function NutrRow({ label, value, indent = false, bold = false }: {
  label: string; value: string | null; indent?: boolean; bold?: boolean;
}) {
  if (value == null) return null;
  return (
    <tr style={{ borderTop: B }}>
      <td style={{
        padding: '7px 0 7px 12px', paddingLeft: indent ? 28 : 12,
        fontSize: 12, color: bold ? 'var(--fg)' : MUT, fontWeight: bold ? 600 : 400,
      }}>
        {label}
      </td>
      <td style={{
        padding: '7px 12px 7px 0', textAlign: 'right',
        fontFamily: MONO, fontSize: 12, color: 'var(--fg)',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </td>
    </tr>
  );
}

// ── Pill link ─────────────────────────────────────────────────
function Pill({ name, href, accent = false }: { name: string; href: string; accent?: boolean }) {
  return (
    <a href={href} style={{
      display: 'inline-block', padding: '3px 10px',
      border: accent ? '1px solid var(--accent)' : B,
      fontFamily: MONO, fontSize: 11,
      color: accent ? 'var(--accent)' : 'var(--fg)',
      background: accent ? 'var(--accent-subtle)' : 'var(--surface)',
      textDecoration: 'none', transition: 'border-color 0.15s',
    }}>
      {name}
    </a>
  );
}

// ── Tag badge ─────────────────────────────────────────────────
function Tag({ label, positive }: { label: string; positive?: boolean }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px',
      fontFamily: MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em',
      border: B,
      color: positive ? 'var(--accent-text)' : MUT,
      background: positive ? 'var(--accent-subtle)' : 'var(--surface)',
    }}>
      {label}
    </span>
  );
}

// ── Confidence badge ──────────────────────────────────────────
function ConfidenceBadge({ reviewed, hasAi }: { reviewed?: boolean; hasAi?: boolean }) {
  if (reviewed) return (
    <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--accent)',
      border: '1px solid var(--accent)', padding: '1px 5px', letterSpacing: '0.1em' }}>
      VERIFIED
    </span>
  );
  if (hasAi) return (
    <span style={{ fontFamily: MONO, fontSize: 9, color: MUT,
      border: B, padding: '1px 5px', letterSpacing: '0.1em' }}>
      AI · DRAFT
    </span>
  );
  return null;
}

// ══════════════════════════════════════════════════════════════
//  Main page
// ══════════════════════════════════════════════════════════════
export default function IngredientPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [ing, setIng]     = useState<Ingredient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiPolling, setAiPolling] = useState(false);

  useEffect(() => {
    fetch(`/api/ingredients/${slug}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setLoading(false); return; }
        setIng(d.ingredient);
        setLoading(false);
        // If AI content was just triggered, poll once after 4s
        if (d.ingredient.needsAiContent) {
          setAiPolling(true);
          setTimeout(() => {
            fetch(`/api/ingredients/${slug}`)
              .then(r => r.json())
              .then(d2 => { if (d2.ingredient) setIng(d2.ingredient); setAiPolling(false); })
              .catch(() => setAiPolling(false));
          }, 4000);
        }
      })
      .catch(() => { setError('Failed to load.'); setLoading(false); });
  }, [slug]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <span style={{ fontFamily: MONO, fontSize: 11, color: MUT,
        textTransform: 'uppercase', letterSpacing: '0.18em' }}>Loading…</span>
    </div>
  );

  if (error || !ing) return (
    <div style={{ padding: 32, fontFamily: MONO, fontSize: 12, color: MUT }}>
      {error ?? 'Ingredient not found.'}
    </div>
  );

  const n = ing.nutrition_per_100g ?? {};
  const hasBasicNutrition = n.calories != null || n.protein != null || n.fat != null;
  const hasDetailedNutrition = n.vitamin_c != null || n.calcium != null || n.iron != null;
  const parentId = ing.parent?.id;
  const hasEthical = ing.is_vegan != null || ing.is_vegetarian != null ||
    ing.is_halal != null || ing.is_kosher != null || ing.is_gluten_free != null;
  const hasAllergens = (ing.allergens?.length ?? 0) > 0;
  const inSeason = ing.season?.map(s => MONTH_KEYS.indexOf(s)).filter(i => i >= 0) ?? [];

  return (
    <>
      {/* Schema.org structured data for SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Thing',
          name: ing.name,
          description: ing.summary ?? ing.description ?? undefined,
          url: `https://soup.dog/ingredients/${ing.slug}`,
          ...(ing.image_url ? { image: ing.image_url } : {}),
          ...(ing.brand ? { brand: { '@type': 'Brand', name: ing.brand } } : {}),
        }) }}
      />

      <div style={{ display: 'flex', gap: 0, minHeight: '100%' }}>

        {/* ── Main content ───────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '24px 32px 64px' }}>

          {/* Breadcrumb taxonomy */}
          {(ing.parent || ing.children.length > 0) && (
            <nav style={{ display: 'flex', alignItems: 'center', gap: 4,
              marginBottom: 16, flexWrap: 'wrap' }}>
              {ing.parent && (
                <>
                  <a href={`/ingredients/${ing.parent.slug}`}
                    style={{ fontFamily: MONO, fontSize: 10, color: MUT,
                      textDecoration: 'none', textTransform: 'uppercase',
                      letterSpacing: '0.12em' }}
                    className="hover:text-[var(--fg)] transition-colors">
                    {ing.parent.name}
                  </a>
                  <ChevronRight size={10} style={{ color: MUT, flexShrink: 0 }} />
                </>
              )}
              <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--fg)',
                textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600 }}>
                {ing.name}
              </span>
            </nav>
          )}

          {/* Hero image */}
          {ing.image_url && (
            <div style={{
              marginBottom: 24, position: 'relative',
              width: '100%', aspectRatio: '4/3',
              overflow: 'hidden', border: B, background: 'var(--surface-hover)',
            }}>
              <img
                src={ing.image_url}
                alt={ing.name}
                style={{
                  width: '100%', height: '100%',
                  objectFit: 'cover', objectPosition: 'center',
                  display: 'block',
                }}
              />
              {ing.image_credit && (
                <div style={{
                  position: 'absolute', bottom: 0, right: 0,
                  padding: '3px 8px', background: 'rgba(0,0,0,0.45)',
                  fontFamily: MONO, fontSize: 9, color: 'rgba(255,255,255,0.7)',
                  letterSpacing: '0.08em',
                }}>
                  {ing.image_credit}
                </div>
              )}
            </div>
          )}

          {/* Title */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start',
              justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <h1 className="font-display"
                style={{ fontSize: 28, fontWeight: 400, lineHeight: 1.2,
                  color: 'var(--fg)', margin: 0 }}>
                {ing.name}
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ConfidenceBadge reviewed={ing.content_reviewed}
                  hasAi={!!ing.ai_content_generated_at} />
                <span style={{ fontFamily: MONO, fontSize: 10, color: MUT,
                  textTransform: 'uppercase', letterSpacing: '0.12em',
                  border: B, padding: '2px 8px' }}>
                  {ing.category}
                </span>
              </div>
            </div>

            {/* Brand / manufacturer */}
            {(ing.brand || ing.manufacturer) && (
              <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 11, color: MUT }}>
                {[ing.brand, ing.manufacturer].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>

          {/* Summary */}
          <div style={{ marginBottom: 24, paddingBottom: 24, borderBottom: B }}>
            {aiPolling && !ing.summary ? (
              <AiPlaceholder lines={3} />
            ) : ing.summary ? (
              <p style={{ fontSize: 13, lineHeight: 1.7, color: MUT, margin: 0 }}>
                {ing.summary}
              </p>
            ) : (
              <p style={{ fontSize: 13, color: MUT, fontStyle: 'italic', margin: 0 }}>
                No description available yet.
              </p>
            )}

            {/* Taste profile */}
            {ing.taste_profile && (
              <p style={{ fontSize: 12, lineHeight: 1.6, color: MUT,
                margin: '10px 0 0', paddingTop: 10, borderTop: B }}>
                <span style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase',
                  letterSpacing: '0.15em', marginRight: 8, color: 'var(--fg)' }}>
                  Taste
                </span>
                {ing.taste_profile}
              </p>
            )}
          </div>

          {/* Taxonomy — "Type of" / "Varieties" / "Related varieties" */}
          {(ing.children.length > 0 || ing.siblings.length > 0) && (
            <div style={{ marginBottom: 24, paddingBottom: 24, borderBottom: B }}>
              {ing.children.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase',
                    letterSpacing: '0.15em', color: MUT, marginBottom: 8 }}>
                    Varieties
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {ing.children.map(c => (
                      <Pill key={c.id} name={c.name} href={`/ingredients/${c.slug}`} />
                    ))}
                  </div>
                </div>
              )}
              {ing.siblings.length > 0 && (
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase',
                    letterSpacing: '0.15em', color: MUT, marginBottom: 8 }}>
                    Related varieties
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {ing.siblings.map(s => (
                      <Pill key={s.id} name={s.name} href={`/ingredients/${s.slug}`} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Common uses */}
          {(ing.uses?.length ?? 0) > 0 && (
            <div style={{ marginBottom: 24, paddingBottom: 24, borderBottom: B }}>
              <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase',
                letterSpacing: '0.15em', color: MUT, marginBottom: 8 }}>
                Common uses
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ing.uses!.map(u => (
                  <span key={u} style={{
                    fontFamily: MONO, fontSize: 11, padding: '3px 10px',
                    border: B, color: MUT,
                  }}>
                    {u}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Allergens + ethical tags — always visible */}
          {(hasAllergens || hasEthical) && (
            <div style={{ marginBottom: 24, paddingBottom: 24, borderBottom: B }}>
              {hasAllergens && (
                <div style={{ marginBottom: hasEthical ? 10 : 0 }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase',
                    letterSpacing: '0.15em', color: 'var(--error)', marginBottom: 8 }}>
                    Contains allergens
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {ing.allergens!.map(a => (
                      <span key={a} style={{
                        fontFamily: MONO, fontSize: 11, padding: '3px 10px',
                        border: '1px solid var(--error)', color: 'var(--error)',
                      }}>
                        {ALLERGEN_LABELS[a] ?? a}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {hasEthical && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6,
                  marginTop: hasAllergens ? 8 : 0 }}>
                  {ing.is_vegan     === true  && <Tag label="Vegan"       positive />}
                  {ing.is_vegetarian=== true  && <Tag label="Vegetarian"  positive />}
                  {ing.is_halal     === true  && <Tag label="Halal"       positive />}
                  {ing.is_kosher    === true  && <Tag label="Kosher"      positive />}
                  {ing.is_gluten_free=== true && <Tag label="Gluten-free" positive />}
                  {ing.is_vegan     === false && <Tag label="Not vegan" />}
                  {ing.is_vegetarian=== false && <Tag label="Not vegetarian" />}
                </div>
              )}
            </div>
          )}

          {/* ── Expandable sections ──────────────────────────── */}

          {/* Nutrition */}
          {hasBasicNutrition && (
            <Section title="Nutrition" defaultOpen badge="per 100g">
              <div style={{ fontSize: 11, color: MUT, fontFamily: MONO,
                marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>Source: {ing.nutrition_source ?? 'unknown'}</span>
                {ing.nutrition_source === 'usda' && (
                  <span style={{ border: B, padding: '1px 6px', fontSize: 9,
                    textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    USDA estimate
                  </span>
                )}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse',
                border: B, fontSize: 12 }}>
                <tbody>
                  <NutrRow label="Calories"        value={fmt(n.calories, ' kcal')} bold />
                  <NutrRow label="Carbohydrates"   value={fmt(n.carbohydrates, 'g')} bold />
                  <NutrRow label="  Sugar"         value={fmt(n.sugar, 'g')} indent />
                  <NutrRow label="  Fiber"         value={fmt(n.fiber, 'g')} indent />
                  <NutrRow label="Protein"         value={fmt(n.protein, 'g')} bold />
                  <NutrRow label="Fat"             value={fmt(n.fat, 'g')} bold />
                  <NutrRow label="  Saturated"     value={fmt(n.saturated_fat, 'g')} indent />
                  <NutrRow label="  Monounsaturated" value={fmt(n.monounsaturated_fat, 'g')} indent />
                  <NutrRow label="  Polyunsaturated" value={fmt(n.polyunsaturated_fat, 'g')} indent />
                  <NutrRow label="  Trans fat"     value={fmt(n.trans_fat, 'g')} indent />
                  <NutrRow label="Sodium"          value={fmt(n.sodium, 'mg')} bold />
                  <NutrRow label="Cholesterol"     value={fmt(n.cholesterol, 'mg')} bold />
                </tbody>
              </table>

              {/* Detailed nutrition — nested expandable */}
              {hasDetailedNutrition && (
                <Section title="Detailed micronutrients">
                  <table style={{ width: '100%', borderCollapse: 'collapse',
                    border: B, fontSize: 12 }}>
                    <tbody>
                      <NutrRow label="Omega-3"         value={fmt(n.omega3, 'g')} />
                      <NutrRow label="Omega-6"         value={fmt(n.omega6, 'g')} />
                      <NutrRow label="Vitamin A"       value={fmt(n.vitamin_a, 'μg')} />
                      <NutrRow label="Vitamin C"       value={fmt(n.vitamin_c, 'mg')} />
                      <NutrRow label="Vitamin D"       value={fmt(n.vitamin_d, 'μg')} />
                      <NutrRow label="Vitamin E"       value={fmt(n.vitamin_e, 'mg')} />
                      <NutrRow label="Vitamin K"       value={fmt(n.vitamin_k, 'μg')} />
                      <NutrRow label="Thiamin (B1)"    value={fmt(n.thiamin, 'mg')} />
                      <NutrRow label="Riboflavin (B2)" value={fmt(n.riboflavin, 'mg')} />
                      <NutrRow label="Niacin (B3)"     value={fmt(n.niacin, 'mg')} />
                      <NutrRow label="Vitamin B6"      value={fmt(n.vitamin_b6, 'mg')} />
                      <NutrRow label="Folate (B9)"     value={fmt(n.folate, 'μg')} />
                      <NutrRow label="Vitamin B12"     value={fmt(n.vitamin_b12, 'μg')} />
                      <NutrRow label="Pantothenic acid" value={fmt(n.pantothenic_acid, 'mg')} />
                      <NutrRow label="Calcium"         value={fmt(n.calcium, 'mg')} />
                      <NutrRow label="Iron"            value={fmt(n.iron, 'mg')} />
                      <NutrRow label="Magnesium"       value={fmt(n.magnesium, 'mg')} />
                      <NutrRow label="Phosphorus"      value={fmt(n.phosphorus, 'mg')} />
                      <NutrRow label="Potassium"       value={fmt(n.potassium, 'mg')} />
                      <NutrRow label="Zinc"            value={fmt(n.zinc, 'mg')} />
                      <NutrRow label="Copper"          value={fmt(n.copper, 'mg')} />
                      <NutrRow label="Manganese"       value={fmt(n.manganese, 'mg')} />
                      <NutrRow label="Selenium"        value={fmt(n.selenium, 'μg')} />
                    </tbody>
                  </table>
                </Section>
              )}
            </Section>
          )}

          {/* History */}
          <Section title="History & origin">
            {aiPolling && !ing.history ? (
              <AiPlaceholder lines={4} />
            ) : ing.history ? (
              <p style={{ fontSize: 13, lineHeight: 1.7, color: MUT, margin: 0 }}>
                {ing.history}
              </p>
            ) : (
              <p style={{ fontSize: 12, color: MUT, fontStyle: 'italic', margin: 0 }}>
                History not available yet.
              </p>
            )}
            {ing.cultural_notes && (
              <p style={{ fontSize: 12, lineHeight: 1.6, color: MUT,
                margin: '10px 0 0', paddingTop: 10, borderTop: B }}>
                {ing.cultural_notes}
              </p>
            )}
          </Section>

          {/* How it's made */}
          <Section title="How it's produced">
            {aiPolling && !ing.manufacturing_notes ? (
              <AiPlaceholder lines={3} />
            ) : ing.manufacturing_notes ? (
              <p style={{ fontSize: 13, lineHeight: 1.7, color: MUT, margin: 0 }}>
                {ing.manufacturing_notes}
              </p>
            ) : (
              <p style={{ fontSize: 12, color: MUT, fontStyle: 'italic', margin: 0 }}>
                Production notes not available yet.
              </p>
            )}
          </Section>

          {/* Storage */}
          <Section title="Storage & shelf life">
            {ing.storage_notes ? (
              <p style={{ fontSize: 13, lineHeight: 1.7, color: MUT, margin: 0 }}>
                {ing.storage_notes}
              </p>
            ) : (
              <p style={{ fontSize: 12, color: MUT, fontStyle: 'italic', margin: 0 }}>
                Storage information not available yet.
              </p>
            )}

            {/* Seasonality */}
            {inSeason.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase',
                  letterSpacing: '0.15em', color: MUT, marginBottom: 8 }}>
                  Seasonality
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 3 }}>
                  {MONTHS.map((m, i) => (
                    <div key={m} style={{
                      textAlign: 'center', padding: '4px 0',
                      background: inSeason.includes(i)
                        ? 'var(--accent-subtle)' : 'var(--surface-hover)',
                      border: inSeason.includes(i)
                        ? '1px solid var(--accent)' : B,
                    }}>
                      <span style={{
                        fontFamily: MONO, fontSize: 9,
                        color: inSeason.includes(i) ? 'var(--accent)' : MUT,
                        fontWeight: inSeason.includes(i) ? 600 : 400,
                      }}>
                        {m}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Section>

          {/* Execution intelligence — stub for now */}
          <Section title="Cooking behaviour">
            <div style={{ padding: '12px 0', display: 'flex', alignItems: 'center',
              gap: 8, color: MUT }}>
              <FlaskConical size={14} style={{ flexShrink: 0 }} />
              <span style={{ fontFamily: MONO, fontSize: 11 }}>
                Thermal properties and appliance behaviour — coming in a future update.
              </span>
            </div>
          </Section>

          {/* ── Product information (only when is_product=true) ── */}
          {ing.is_product && (
            <Section title="Product information" defaultOpen>
              <table style={{ width: '100%', borderCollapse: 'collapse', border: B }}>
                <tbody>
                  {ing.barcode && (
                    <tr style={{ borderTop: B }}>
                      <td style={{ padding: '8px 12px', fontFamily: MONO, fontSize: 10,
                        textTransform: 'uppercase', letterSpacing: '0.12em', color: MUT,
                        borderRight: B, whiteSpace: 'nowrap' }}>Barcode</td>
                      <td style={{ padding: '8px 12px', fontFamily: MONO, fontSize: 12 }}>{ing.barcode}</td>
                    </tr>
                  )}
                  {ing.net_weight_g != null && (
                    <tr style={{ borderTop: B }}>
                      <td style={{ padding: '8px 12px', fontFamily: MONO, fontSize: 10,
                        textTransform: 'uppercase', letterSpacing: '0.12em', color: MUT,
                        borderRight: B, whiteSpace: 'nowrap' }}>Net weight</td>
                      <td style={{ padding: '8px 12px', fontFamily: MONO, fontSize: 12 }}>{ing.net_weight_g}g</td>
                    </tr>
                  )}
                  {ing.serving_size_g != null && (
                    <tr style={{ borderTop: B }}>
                      <td style={{ padding: '8px 12px', fontFamily: MONO, fontSize: 10,
                        textTransform: 'uppercase', letterSpacing: '0.12em', color: MUT,
                        borderRight: B, whiteSpace: 'nowrap' }}>Serving size</td>
                      <td style={{ padding: '8px 12px', fontFamily: MONO, fontSize: 12 }}>{ing.serving_size_g}g</td>
                    </tr>
                  )}
                  {ing.packaging_type && (
                    <tr style={{ borderTop: B }}>
                      <td style={{ padding: '8px 12px', fontFamily: MONO, fontSize: 10,
                        textTransform: 'uppercase', letterSpacing: '0.12em', color: MUT,
                        borderRight: B, whiteSpace: 'nowrap' }}>Packaging</td>
                      <td style={{ padding: '8px 12px', fontFamily: MONO, fontSize: 12 }}>{ing.packaging_type}</td>
                    </tr>
                  )}
                  {ing.base_temp_celsius != null && (
                    <tr style={{ borderTop: B }}>
                      <td style={{ padding: '8px 12px', fontFamily: MONO, fontSize: 10,
                        textTransform: 'uppercase', letterSpacing: '0.12em', color: MUT,
                        borderRight: B, whiteSpace: 'nowrap' }}>Storage</td>
                      <td style={{ padding: '8px 12px', fontFamily: MONO, fontSize: 12 }}>
                        {ing.base_temp_celsius <= -15 ? `Frozen (${ing.base_temp_celsius}°C)`
                          : ing.base_temp_celsius <= 8 ? `Refrigerated (${ing.base_temp_celsius}°C)`
                          : `Ambient (${ing.base_temp_celsius}°C)`}
                      </td>
                    </tr>
                  )}
                  {ing.producer && (
                    <tr style={{ borderTop: B }}>
                      <td style={{ padding: '8px 12px', fontFamily: MONO, fontSize: 10,
                        textTransform: 'uppercase', letterSpacing: '0.12em', color: MUT,
                        borderRight: B, whiteSpace: 'nowrap' }}>Producer</td>
                      <td style={{ padding: '8px 12px', fontFamily: MONO, fontSize: 12 }}>{ing.producer}</td>
                    </tr>
                  )}
                  {ing.country_of_origin && (
                    <tr style={{ borderTop: B }}>
                      <td style={{ padding: '8px 12px', fontFamily: MONO, fontSize: 10,
                        textTransform: 'uppercase', letterSpacing: '0.12em', color: MUT,
                        borderRight: B, whiteSpace: 'nowrap' }}>Country</td>
                      <td style={{ padding: '8px 12px', fontFamily: MONO, fontSize: 12 }}>{ing.country_of_origin}</td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Ingredient list from packaging */}
              {ing.ingredient_list && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase',
                    letterSpacing: '0.15em', color: MUT, marginBottom: 6 }}>
                    Ingredient list
                  </div>
                  <div style={{ padding: '10px 12px', border: B,
                    fontFamily: MONO, fontSize: 11, color: MUT, lineHeight: 1.7 }}>
                    {ing.ingredient_list}
                  </div>
                </div>
              )}

              {/* Linked recipes */}
              {ing.recipeCount > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase',
                    letterSpacing: '0.15em', color: MUT, marginBottom: 6 }}>
                    Cooking recipes
                  </div>
                  <a href={`/search?q=${encodeURIComponent(ing.name)}&type=recipe`}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 12px', border: B, textDecoration: 'none',
                      background: 'var(--surface)', color: 'var(--fg)' }}
                    className="hover:border-[var(--accent)] transition-colors">
                    <span style={{ fontFamily: MONO, fontSize: 12 }}>
                      View {ing.recipeCount} recipe{ing.recipeCount !== 1 ? 's' : ''}
                    </span>
                    <ExternalLink size={11} style={{ color: MUT }} />
                  </a>
                </div>
              )}
              {ing.recipeCount === 0 && (
                <div style={{ marginTop: 12, padding: '16px', border: '1px dashed var(--border)',
                  textAlign: 'center' }}>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: MUT,
                    textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>
                    No cooking recipes yet
                  </div>
                  <a href="/my/recipes/import"
                    style={{ fontFamily: MONO, fontSize: 11, color: 'var(--accent)',
                      textDecoration: 'none', padding: '5px 12px', border: B }}>
                    Create a recipe using this product →
                  </a>
                </div>
              )}

              {/* Open Food Facts link */}
              {ing.off_id && (
                <div style={{ marginTop: 12 }}>
                  <a href={`https://world.openfoodfacts.org/product/${ing.off_id}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ fontFamily: MONO, fontSize: 10, color: MUT,
                      textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <ExternalLink size={9} /> View on Open Food Facts
                  </a>
                </div>
              )}
            </Section>
          )}

        </div>

        {/* ── Right panel ────────────────────────────────────── */}
        <aside style={{
          width: 220, flexShrink: 0, borderLeft: B,
          position: 'sticky', top: 0, height: '100vh',
          overflowY: 'auto', padding: '24px 20px',
          display: 'flex', flexDirection: 'column', gap: 24,
        }} className="hidden md:flex">

          {/* Thumbnail */}
          {ing.image_url && (
            <div style={{
              width: '100%', aspectRatio: '4/3',
              overflow: 'hidden', border: B,
              background: 'var(--surface-hover)',
            }}>
              <img
                src={ing.image_url}
                alt={ing.name}
                style={{
                  width: '100%', height: '100%',
                  objectFit: 'cover', objectPosition: 'center',
                  display: 'block',
                }}
              />
            </div>
          )}

          {/* Make it yourself */}
          {ing.transformationRecipe && (
            <div>
              <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase',
                letterSpacing: '0.18em', color: MUT, marginBottom: 10 }}>
                Make it yourself
              </div>
              <a href={`/recipes/${ing.transformationRecipe.slug}`}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 12px', border: '1px solid var(--accent)',
                  background: 'var(--accent-subtle)', textDecoration: 'none',
                  transition: 'background 0.15s',
                }}
                className="hover:bg-[var(--accent)] group">
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase',
                    letterSpacing: '0.12em', color: 'var(--accent)', marginBottom: 3 }}
                    className="group-hover:text-white transition-colors">
                    Recipe
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg)' }}
                    className="group-hover:text-white transition-colors">
                    {ing.transformationRecipe.title}
                  </div>
                </div>
                <ExternalLink size={11} style={{ color: 'var(--accent)', flexShrink: 0 }}
                  className="group-hover:text-white transition-colors" />
              </a>
            </div>
          )}

          {/* Recipes using this */}
          <div>
            <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase',
              letterSpacing: '0.18em', color: MUT, marginBottom: 10 }}>
              In recipes
            </div>
            {(ing.linkedRecipes?.length ?? 0) > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {ing.linkedRecipes!.map(r => (
                  <a key={r.id} href={`/recipes/${r.slug}`}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 12px', border: B, textDecoration: 'none',
                      background: 'var(--surface)',
                    }}
                    className="hover:border-[var(--accent)] transition-colors">
                    <span style={{ fontSize: 12, color: 'var(--fg)' }}>{r.title}</span>
                    <ChevronRight size={11} style={{ color: MUT }} />
                  </a>
                ))}
              </div>
            ) : (
              <span style={{ fontFamily: MONO, fontSize: 11, color: MUT }}>
                No recipes yet.
              </span>
            )}
          </div>

          {/* Quick nutrition facts */}
          {hasBasicNutrition && (
            <div>
              <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase',
                letterSpacing: '0.18em', color: MUT, marginBottom: 10 }}>
                Quick facts · 100g
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', border: B }}>
                <tbody>
                  {([
                    ['Calories',   n.calories,       ' kcal'],
                    ['Carbs',      n.carbohydrates,  'g'],
                    ['Sugar',      n.sugar,           'g'],
                    ['Protein',    n.protein,         'g'],
                    ['Fat',        n.fat,             'g'],
                    ['Saturated',  n.saturated_fat,   'g'],
                    ['Fiber',      n.fiber,           'g'],
                    ['Sodium',     n.sodium,          'mg'],
                  ] as [string, number | undefined, string][])
                    .filter(([, v]) => v != null)
                    .map(([label, value, unit]) => (
                      <tr key={label} style={{ borderBottom: B }}>
                        <td style={{ padding: '5px 8px', fontSize: 11, color: MUT }}>
                          {label}
                        </td>
                        <td style={{
                          padding: '5px 8px', textAlign: 'right',
                          fontFamily: MONO, fontSize: 11, color: 'var(--fg)',
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {value}{unit}
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          )}

          {/* Allergens summary */}
          {hasAllergens && (
            <div>
              <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase',
                letterSpacing: '0.18em', color: 'var(--error)', marginBottom: 10 }}>
                Allergens
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {ing.allergens!.map(a => (
                  <span key={a} style={{
                    fontFamily: MONO, fontSize: 11, padding: '3px 8px',
                    border: '1px solid var(--error)', color: 'var(--error)',
                  }}>
                    {ALLERGEN_LABELS[a] ?? a}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Dietary tags */}
          {hasEthical && (
            <div>
              <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase',
                letterSpacing: '0.18em', color: MUT, marginBottom: 10 }}>
                Dietary
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {ing.is_vegan      === true  && <Tag label="Vegan"        positive />}
                {ing.is_vegetarian === true  && <Tag label="Vegetarian"   positive />}
                {ing.is_halal      === true  && <Tag label="Halal"        positive />}
                {ing.is_kosher     === true  && <Tag label="Kosher"       positive />}
                {ing.is_gluten_free=== true  && <Tag label="Gluten-free"  positive />}
                {ing.is_vegan      === false && <Tag label="Not vegan" />}
                {ing.is_vegetarian === false && <Tag label="Not vegetarian" />}
              </div>
            </div>
          )}

          {/* Type of */}
          {ing.parent && (
            <div>
              <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase',
                letterSpacing: '0.18em', color: MUT, marginBottom: 10 }}>
                Type of
              </div>
              <Pill name={ing.parent.name} href={`/ingredients/${ing.parent.slug}`} accent />
            </div>
          )}

        </aside>

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
