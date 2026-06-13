'use client';
// src/app/ingredients/[slug]/page.tsx
//
// Ingredient knowledge page — cookbook / Haynes-manual layout.
//   • Intro region: lead text left, hero floated right (with background).
//   • Right rail: Wikipedia-style "On this page" TOC (Option-1 model — the AI
//     assistant, Step 2, will take over the rail when summoned; rail is built
//     as a slot stack so the future personal "In your kitchen" inventory card
//     drops in above without a re-layout).
//   • Sections scaffold the full content model (How to use · Storing ·
//     Variations · Details · Nutrition · Allergies · Culture & religion ·
//     Diets · Production · History · Related), rendering whatever data exists
//     and showing a quiet "not yet" line otherwise. Schema/content fills in
//     over time; no migration needed to ship this layout.

import React, { useState, useEffect, use } from 'react';
import { ChevronRight, ExternalLink, Pencil } from 'lucide-react';
import {
  KLink, Section, SubLabel, CountChip, SubSections, renderProse,
  InlineToc, useTocProvider, TocProvider, anchorId,
} from '@/components/knowledge/KnowledgePage';
import { useAssistantContext } from '@/components/assistant/AssistantProvider';
import { IngredientPreviewCard, type CompositionEntry } from '@/components/knowledge/CompositionEditor';

// ── Types ─────────────────────────────────────────────────────
interface NutritionPer100g {
  calories?: number; carbohydrates?: number; sugar?: number; protein?: number;
  fat?: number; saturated_fat?: number; monounsaturated_fat?: number;
  polyunsaturated_fat?: number; trans_fat?: number; fiber?: number;
  sodium?: number; cholesterol?: number; omega3?: number; omega6?: number;
  vitamin_a?: number; vitamin_c?: number; vitamin_d?: number; vitamin_e?: number;
  vitamin_k?: number; thiamin?: number; riboflavin?: number; niacin?: number;
  vitamin_b6?: number; folate?: number; vitamin_b12?: number;
  pantothenic_acid?: number; calcium?: number; iron?: number; magnesium?: number;
  phosphorus?: number; potassium?: number; zinc?: number; copper?: number;
  manganese?: number; selenium?: number;
}
interface Rel { id: string; slug: string; name: string }
interface Ingredient {
  id: string; slug: string; name: string; description?: string; category: string;
  summary?: string; taste_profile?: string; uses?: string[]; history?: string;
  manufacturing_notes?: string; cultural_notes?: string;
  nutrition_per_100g?: NutritionPer100g; nutrition_source?: string;
  allergens?: string[]; season?: string[]; storage_notes?: string;
  is_vegan?: boolean; is_vegetarian?: boolean; is_halal?: boolean;
  is_kosher?: boolean; is_gluten_free?: boolean;
  brand?: string; manufacturer?: string; is_product?: boolean; barcode?: string;
  net_weight_g?: number; serving_size_g?: number; packaging_type?: string;
  producer?: string; country_of_origin?: string; ingredient_list?: string;
  base_temp_celsius?: number; off_id?: string;
  image_url?: string; image_credit?: string;
  content_reviewed?: boolean; ai_content_generated_at?: string;
  archived_at?: string | null;
  // joined
  parent?: Rel | null; siblings: Rel[]; children: Rel[];
  transformationRecipe?: { title: string; slug: string } | null;
  linkedRecipes?: { id: string; slug: string; title: string }[];
  recipeCount?: number;
  confusedWith?: Rel[];
  composition?: CompositionEntry[];
  concepts?: { memberId: string; conceptId: string; name: string; note?: string | null }[];
  sections?: Record<string, { id: string; headline?: string; image_url?: string;
    image_credit?: string; body?: string; bullets?: string[] }[]>;
  needsAiContent?: boolean;
}

const MONO = 'var(--font-mono)';
const SERIF = 'var(--font-display)';
const MUT = 'var(--muted)';
const FG = 'var(--fg)';
const B = '1px solid var(--border)';

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const ALLERGEN_LABELS: Record<string, string> = {
  gluten: 'Gluten', crustaceans: 'Crustaceans', eggs: 'Eggs', fish: 'Fish',
  peanuts: 'Peanuts', soybeans: 'Soybeans', milk: 'Milk', nuts: 'Tree nuts',
  celery: 'Celery', mustard: 'Mustard', sesame: 'Sesame', sulphites: 'Sulphites',
  lupin: 'Lupin', molluscs: 'Molluscs',
};

function fmt(v: number | undefined, unit: string): string | null {
  if (v == null) return null;
  return `${v}${unit}`;
}

// ── small presentational helpers ──────────────────────────────
function NutrRow({ label, value, indent = false, bold = false }: {
  label: string; value: string | null; indent?: boolean; bold?: boolean;
}) {
  if (value == null) return null;
  return (
    <tr style={{ borderTop: B }}>
      <td style={{
        padding: '7px 0 7px 12px', paddingLeft: indent ? 28 : 12,
        fontSize: 12, color: bold ? FG : MUT, fontWeight: bold ? 600 : 400,
      }}>{label}</td>
      <td style={{
        padding: '7px 12px 7px 0', textAlign: 'right',
        fontFamily: MONO, fontSize: 12, color: FG, fontVariantNumeric: 'tabular-nums',
      }}>{value}</td>
    </tr>
  );
}

function Tag({ label, positive = false }: { label: string; positive?: boolean }) {
  return (
    <span style={{
      fontFamily: MONO, fontSize: 11, padding: '3px 10px',
      border: positive ? '1px solid var(--accent)' : B,
      color: positive ? 'var(--accent)' : MUT,
      background: positive ? 'var(--accent-subtle)' : 'transparent',
    }}>{label}</span>
  );
}

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

function ConfidenceBadge({ reviewed, hasAi }: { reviewed?: boolean; hasAi?: boolean }) {
  if (reviewed) return (
    <span style={{
      fontFamily: MONO, fontSize: 9, color: 'var(--accent)', border: '1px solid var(--accent)',
      padding: '1px 5px', letterSpacing: '0.1em', textTransform: 'uppercase',
    }}>Verified</span>
  );
  if (hasAi) return (
    <span style={{
      fontFamily: MONO, fontSize: 9, color: MUT, border: B,
      padding: '1px 5px', letterSpacing: '0.1em', textTransform: 'uppercase',
    }}>AI · Draft</span>
  );
  return null;
}

// ══════════════════════════════════════════════════════════════
//  Page
// ══════════════════════════════════════════════════════════════
export default function IngredientPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [ing, setIng] = useState<Ingredient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiPolling, setAiPolling] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  // TOC plumbing (Section titles register themselves)
  const { entries, api } = useTocProvider();

  // Publish page context to the global assistant dock (null until loaded).
  useAssistantContext(ing ? {
    entityType: 'ingredient',
    entityName: ing.name,
    summary: ing.summary,
    facts: {
      category: ing.category,
      taste: ing.taste_profile,
      allergens: ing.allergens,
      vegan: ing.is_vegan, vegetarian: ing.is_vegetarian,
      halal: ing.is_halal, kosher: ing.is_kosher, glutenFree: ing.is_gluten_free,
      uses: ing.uses,
    },
  } : null);

  async function setArchived(next: boolean) {
    if (!ing) return;
    setArchiving(true);
    const res = await fetch(`/api/admin/ingredients/${ing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: next }),
    });
    setArchiving(false);
    setConfirmArchive(false);
    if (res.ok) {
      if (next) window.location.href = '/ingredients';
      else setIng({ ...ing, archived_at: null });
    }
  }

  useEffect(() => {
    fetch('/api/admin/check')
      .then(r => r.json())
      .then(d => setIsAdmin(Boolean(d.isAdmin)))
      .catch(() => setIsAdmin(false));

    fetch(`/api/ingredients/${slug}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setLoading(false); return; }
        setIng(d.ingredient);
        setLoading(false);
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
  const sec = (key: string) => ing.sections?.[key] ?? [];
  const hasBasicNutrition = n.calories != null || n.protein != null || n.fat != null;
  const hasDetailedNutrition = n.vitamin_c != null || n.calcium != null || n.iron != null;
  const hasEthical = ing.is_vegan != null || ing.is_vegetarian != null ||
    ing.is_halal != null || ing.is_kosher != null || ing.is_gluten_free != null;
  const hasAllergens = (ing.allergens?.length ?? 0) > 0;
  const inSeason = ing.season?.map(s => MONTH_KEYS.indexOf(s)).filter(i => i >= 0) ?? [];

  // Variation links: parent (a transformation/child of), children (varieties),
  // siblings (related variations). All real ingredient rows we link out to.
  const hasVariations = !!ing.parent || ing.children.length > 0 || ing.siblings.length > 0;

  // "Recipes by method / by type" — STUBBED counts for now. Wiring these to the
  // recipe×task graph (and method-tagging recipes at save time) is a later pass.
  const recipeMethodChips = [
    { label: 'Juicing' }, { label: 'Zesting' }, { label: 'Garnish' },
  ];
  const recipeTypeChips = [
    { label: 'Sauces' }, { label: 'Drinks' }, { label: 'Desserts' },
  ];

  return (
    <TocProvider api={api}>
      {/* SEO */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org', '@type': 'Thing', name: ing.name,
        description: ing.summary ?? ing.description ?? undefined,
        url: `https://soup.dog/ingredients/${ing.slug}`,
        ...(ing.image_url ? { image: ing.image_url } : {}),
        ...(ing.brand ? { brand: { '@type': 'Brand', name: ing.brand } } : {}),
      }) }} />

      <div style={{ minHeight: '100%' }}>

        {/* ── Main content column ──────────────────────────────── */}
        <div style={{ minWidth: 0, padding: '24px 36px 80px' }}>
          <div style={{ maxWidth: 720 }}>

            {/* Breadcrumb */}
            {ing.parent && (
              <nav style={{ display: 'flex', alignItems: 'center', gap: 6,
                marginBottom: 12, flexWrap: 'wrap' }}>
                <a href={`/ingredients/${ing.parent.slug}`}
                  style={{ fontFamily: MONO, fontSize: 10, color: MUT,
                    textDecoration: 'none', textTransform: 'uppercase', letterSpacing: '0.12em' }}
                  className="hover:text-[var(--fg)] transition-colors">{ing.parent.name}</a>
                <ChevronRight size={10} style={{ color: MUT, flexShrink: 0 }} />
                <span style={{ fontFamily: MONO, fontSize: 10, color: FG,
                  textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600 }}>
                  {ing.name}
                </span>
              </nav>
            )}

            {/* ── Intro region: lead left, hero floated right ───── */}
            <div id="introduction" style={{
              display: 'grid',
              gridTemplateColumns: ing.image_url ? 'minmax(0,1fr) 184px' : '1fr',
              gap: 24, alignItems: 'start',
              marginBottom: 24, paddingBottom: 24, borderBottom: B,
              scrollMarginTop: 16,
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'flex-start',
                  justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                  <h1 className="font-display" style={{ fontFamily: SERIF, fontSize: 30,
                    fontWeight: 400, lineHeight: 1.15, color: FG, margin: 0 }}>{ing.name}</h1>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                    <ConfidenceBadge reviewed={ing.content_reviewed} hasAi={!!ing.ai_content_generated_at} />
                    <span style={{ fontFamily: MONO, fontSize: 10, color: MUT,
                      textTransform: 'uppercase', letterSpacing: '0.12em', border: B, padding: '2px 8px' }}>
                      {ing.category}
                    </span>
                    {isAdmin && (
                      <>
                        {ing.archived_at ? (
                          <button onClick={() => setArchived(false)} disabled={archiving}
                            style={{ fontFamily: MONO, fontSize: 10, color: 'var(--accent)',
                              border: '1px solid var(--accent)', padding: '5px 9px', background: 'transparent',
                              cursor: archiving ? 'default' : 'pointer', opacity: archiving ? 0.6 : 1,
                              textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                            {archiving ? 'Restoring…' : 'Unarchive'}
                          </button>
                        ) : confirmArchive ? (
                          <>
                            <span style={{ fontFamily: MONO, fontSize: 10, color: MUT }}>Archive?</span>
                            <button onClick={() => setArchived(true)} disabled={archiving}
                              style={{ fontFamily: MONO, fontSize: 10, color: '#fff', background: 'var(--muted)',
                                border: 'none', padding: '5px 9px', cursor: archiving ? 'default' : 'pointer',
                                opacity: archiving ? 0.6 : 1, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                              {archiving ? '…' : 'Archive'}
                            </button>
                            <button onClick={() => setConfirmArchive(false)} disabled={archiving}
                              style={{ fontFamily: MONO, fontSize: 10, color: MUT, background: 'none',
                                border: 'none', cursor: 'pointer' }}>Cancel</button>
                          </>
                        ) : (
                          <button onClick={() => setConfirmArchive(true)}
                            style={{ fontFamily: MONO, fontSize: 10, color: MUT, background: 'none',
                              border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                            Archive
                          </button>
                        )}
                        <a href={`/ingredients/${ing.slug}/edit`}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                            fontFamily: MONO, fontSize: 10, color: 'var(--accent)',
                            border: '1px solid var(--accent)', padding: '5px 9px',
                            textDecoration: 'none', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                          <Pencil size={11} /> Edit
                        </a>
                      </>
                    )}
                  </div>
                </div>

                {(ing.concepts?.length ?? 0) > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: MUT, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      Also known as
                    </span>
                    {ing.concepts!.map(c => (
                      <span key={c.memberId} style={{ fontSize: 12, color: 'var(--fg-secondary)',
                        border: B, padding: '2px 8px', background: 'var(--surface)' }}>{c.name}</span>
                    ))}
                  </div>
                )}

                {(ing.brand || ing.manufacturer) && (
                  <div style={{ fontFamily: MONO, fontSize: 11, color: MUT, marginBottom: 8 }}>
                    {[ing.brand, ing.manufacturer].filter(Boolean).join(' · ')}
                  </div>
                )}

                {aiPolling && !ing.summary ? <AiPlaceholder lines={3} />
                  : ing.summary ? (
                    <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--fg-secondary)', margin: 0 }}>
                      {ing.summary}
                    </p>
                  ) : (
                    <p style={{ fontSize: 13, color: MUT, fontStyle: 'italic', margin: 0 }}>
                      No description available yet.
                    </p>
                  )}

                {ing.taste_profile && (
                  <p style={{ fontSize: 12.5, lineHeight: 1.6, color: MUT,
                    margin: '12px 0 0', paddingTop: 12, borderTop: B }}>
                    <span style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase',
                      letterSpacing: '0.15em', marginRight: 8, color: FG }}>Taste</span>
                    {ing.taste_profile}
                  </p>
                )}
              </div>

              {/* Hero — ingredient keeps a background surface */}
              {ing.image_url && (
                <div style={{ position: 'relative', width: '100%', aspectRatio: '1/1',
                  overflow: 'hidden', border: B, background: 'var(--surface-hover)' }}>
                  <img src={ing.image_url} alt={ing.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover',
                      objectPosition: 'center', display: 'block' }} />
                  {ing.image_credit && (
                    <div style={{ position: 'absolute', bottom: 0, right: 0,
                      padding: '3px 8px', background: 'rgba(0,0,0,0.45)',
                      fontFamily: MONO, fontSize: 9, color: 'rgba(255,255,255,0.7)',
                      letterSpacing: '0.08em' }}>{ing.image_credit}</div>
                  )}
                </div>
              )}
            </div>

            {/* Inline "On this page" — the rail now belongs to the assistant */}
            <InlineToc entries={entries} />

            {/* ── How to use ────────────────────────────────────── */}
            <Section title={`How to use ${ing.name.toLowerCase()}`} id="how-to-use">
              <SubLabel>Recipes by food and drink type</SubLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                {recipeTypeChips.map(c => (
                  <CountChip key={c.label} label={c.label} pending
                    href={`/search?q=${encodeURIComponent(ing.name)}&type=recipe`} />
                ))}
              </div>
              <SubLabel>Recipes by method</SubLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {recipeMethodChips.map(c => (
                  <CountChip key={c.label} label={c.label} pending
                    href={`/search?q=${encodeURIComponent(ing.name)}&type=recipe`} />
                ))}
              </div>
              <p style={{ fontSize: 11, color: MUT, fontStyle: 'italic', margin: '12px 0 0' }}>
                Recipe counts are being connected — these will fill in as the recipe library grows.
              </p>

              {(ing.uses?.length ?? 0) > 0 && (
                <div style={{ marginTop: 18 }}>
                  <SubLabel>Common uses</SubLabel>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {ing.uses!.map(u => (
                      <span key={u} style={{ fontFamily: MONO, fontSize: 11,
                        padding: '3px 10px', border: B, color: MUT }}>{u}</span>
                    ))}
                  </div>
                </div>
              )}
            </Section>

            {/* ── Storing & shelf life ──────────────────────────── */}
            <Section title="Storing and shelf life" id="storing"
              empty={!ing.storage_notes && inSeason.length === 0 && sec('storing').length === 0}
              emptyNote="Storage guidance for this ingredient hasn't been added yet.">
              {ing.storage_notes && renderProse(ing.storage_notes)}
              {sec('storing').length > 0 && (
                <div style={{ marginTop: ing.storage_notes ? 18 : 0 }}>
                  <SubSections items={sec('storing')} />
                </div>
              )}
              {inSeason.length > 0 && (
                <div style={{ marginTop: (ing.storage_notes || sec('storing').length) ? 18 : 0 }}>
                  <SubLabel>Seasonality</SubLabel>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 3 }}>
                    {MONTHS.map((m, i) => (
                      <div key={i} style={{ textAlign: 'center', padding: '4px 0',
                        background: inSeason.includes(i) ? 'var(--accent-subtle)' : 'var(--surface-hover)',
                        border: inSeason.includes(i) ? '1px solid var(--accent)' : B }}>
                        <span style={{ fontFamily: MONO, fontSize: 9,
                          color: inSeason.includes(i) ? 'var(--accent)' : MUT,
                          fontWeight: inSeason.includes(i) ? 600 : 400 }}>{m}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Section>

            {/* ── Variations ────────────────────────────────────── */}
            {hasVariations && (
              <Section title="Variations" id="variations">
                <p style={{ fontSize: 12.5, color: MUT, lineHeight: 1.6, margin: '0 0 14px' }}>
                  Related forms of {ing.name.toLowerCase()} — each has its own page.
                </p>
                {ing.parent && (
                  <p style={{ fontSize: 13.5, lineHeight: 1.8, margin: '0 0 10px', color: 'var(--fg-secondary)' }}>
                    A form of <KLink href={`/ingredients/${ing.parent.slug}`}>{ing.parent.name}</KLink>.
                  </p>
                )}
                {ing.children.length > 0 && (
                  <div style={{ marginBottom: ing.siblings.length ? 14 : 0 }}>
                    <SubLabel>Varieties &amp; derived forms</SubLabel>
                    <p style={{ fontSize: 13.5, lineHeight: 1.9, margin: 0, color: 'var(--fg-secondary)' }}>
                      {ing.children.map((c, i) => (
                        <React.Fragment key={c.id}>
                          <KLink href={`/ingredients/${c.slug}`}>{c.name}</KLink>
                          {i < ing.children.length - 1 ? ', ' : ''}
                        </React.Fragment>
                      ))}
                    </p>
                  </div>
                )}
                {ing.siblings.length > 0 && (
                  <div>
                    <SubLabel>Related variations</SubLabel>
                    <p style={{ fontSize: 13.5, lineHeight: 1.9, margin: 0, color: 'var(--fg-secondary)' }}>
                      {ing.siblings.map((s, i) => (
                        <React.Fragment key={s.id}>
                          <KLink href={`/ingredients/${s.slug}`}>{s.name}</KLink>
                          {i < ing.siblings.length - 1 ? ', ' : ''}
                        </React.Fragment>
                      ))}
                    </p>
                  </div>
                )}
              </Section>
            )}

            {/* ── Details / anatomy ─────────────────────────────── */}
            {/* ── Composition (parts / what it's made of) ───────── */}
            {/* Ingredients derived from this one (pulp, juice, zest…), each its
                own ingredient via a process. Linked by transformed_from_id. */}
            <Section title="Composition" id="composition"
              empty={(ing.composition?.length ?? 0) === 0}
              emptyNote="A breakdown of what this is made of hasn't been added yet.">
              {(ing.composition?.length ?? 0) > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                  {ing.composition!.map(c => (
                    <IngredientPreviewCard key={c.id} entry={c} href={`/ingredients/${c.slug}`} />
                  ))}
                </div>
              )}
            </Section>

            {/* ── Nutrition ─────────────────────────────────────── */}
            <Section title="Nutrition" id="nutrition"
              badge={hasBasicNutrition ? 'per 100g' : undefined}
              empty={!hasBasicNutrition}
              emptyNote="Nutrition data for this ingredient hasn't been added yet.">
              {hasBasicNutrition && (
                <>
                  <div style={{ fontSize: 11, color: MUT, fontFamily: MONO, marginBottom: 8,
                    display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>Source: {ing.nutrition_source ?? 'unknown'}</span>
                    {ing.nutrition_source === 'usda' && (
                      <span style={{ border: B, padding: '1px 6px', fontSize: 9,
                        textTransform: 'uppercase', letterSpacing: '0.1em' }}>USDA estimate</span>
                    )}
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', border: B, fontSize: 12 }}>
                    <tbody>
                      <NutrRow label="Calories" value={fmt(n.calories, ' kcal')} bold />
                      <NutrRow label="Carbohydrates" value={fmt(n.carbohydrates, 'g')} bold />
                      <NutrRow label="Sugar" value={fmt(n.sugar, 'g')} indent />
                      <NutrRow label="Fiber" value={fmt(n.fiber, 'g')} indent />
                      <NutrRow label="Protein" value={fmt(n.protein, 'g')} bold />
                      <NutrRow label="Fat" value={fmt(n.fat, 'g')} bold />
                      <NutrRow label="Saturated" value={fmt(n.saturated_fat, 'g')} indent />
                      <NutrRow label="Monounsaturated" value={fmt(n.monounsaturated_fat, 'g')} indent />
                      <NutrRow label="Polyunsaturated" value={fmt(n.polyunsaturated_fat, 'g')} indent />
                      <NutrRow label="Trans fat" value={fmt(n.trans_fat, 'g')} indent />
                      <NutrRow label="Sodium" value={fmt(n.sodium, 'mg')} bold />
                      <NutrRow label="Cholesterol" value={fmt(n.cholesterol, 'mg')} bold />
                    </tbody>
                  </table>
                  {hasDetailedNutrition && (
                    <details style={{ marginTop: 12 }}>
                      <summary style={{ fontFamily: MONO, fontSize: 10, textTransform: 'uppercase',
                        letterSpacing: '0.15em', color: MUT, cursor: 'pointer', padding: '6px 0' }}>
                        Detailed micronutrients
                      </summary>
                      <table style={{ width: '100%', borderCollapse: 'collapse', border: B, fontSize: 12, marginTop: 8 }}>
                        <tbody>
                          <NutrRow label="Omega-3" value={fmt(n.omega3, 'g')} />
                          <NutrRow label="Omega-6" value={fmt(n.omega6, 'g')} />
                          <NutrRow label="Vitamin A" value={fmt(n.vitamin_a, 'μg')} />
                          <NutrRow label="Vitamin C" value={fmt(n.vitamin_c, 'mg')} />
                          <NutrRow label="Vitamin D" value={fmt(n.vitamin_d, 'μg')} />
                          <NutrRow label="Vitamin E" value={fmt(n.vitamin_e, 'mg')} />
                          <NutrRow label="Vitamin K" value={fmt(n.vitamin_k, 'μg')} />
                          <NutrRow label="Thiamin (B1)" value={fmt(n.thiamin, 'mg')} />
                          <NutrRow label="Riboflavin (B2)" value={fmt(n.riboflavin, 'mg')} />
                          <NutrRow label="Niacin (B3)" value={fmt(n.niacin, 'mg')} />
                          <NutrRow label="Vitamin B6" value={fmt(n.vitamin_b6, 'mg')} />
                          <NutrRow label="Folate (B9)" value={fmt(n.folate, 'μg')} />
                          <NutrRow label="Vitamin B12" value={fmt(n.vitamin_b12, 'μg')} />
                          <NutrRow label="Pantothenic acid" value={fmt(n.pantothenic_acid, 'mg')} />
                          <NutrRow label="Calcium" value={fmt(n.calcium, 'mg')} />
                          <NutrRow label="Iron" value={fmt(n.iron, 'mg')} />
                          <NutrRow label="Magnesium" value={fmt(n.magnesium, 'mg')} />
                          <NutrRow label="Phosphorus" value={fmt(n.phosphorus, 'mg')} />
                          <NutrRow label="Potassium" value={fmt(n.potassium, 'mg')} />
                          <NutrRow label="Zinc" value={fmt(n.zinc, 'mg')} />
                          <NutrRow label="Copper" value={fmt(n.copper, 'mg')} />
                          <NutrRow label="Manganese" value={fmt(n.manganese, 'mg')} />
                          <NutrRow label="Selenium" value={fmt(n.selenium, 'μg')} />
                        </tbody>
                      </table>
                    </details>
                  )}
                </>
              )}
            </Section>

            {/* ── Allergies ─────────────────────────────────────── */}
            <Section title="Allergies" id="allergies"
              empty={!hasAllergens}
              emptyNote="No known allergen information has been added for this ingredient.">
              {hasAllergens && (
                <>
                  <SubLabel tone="error">Contains allergens</SubLabel>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {ing.allergens!.map(a => (
                      <span key={a} style={{ fontFamily: MONO, fontSize: 11, padding: '3px 10px',
                        border: '1px solid var(--error)', color: 'var(--error)' }}>
                        {ALLERGEN_LABELS[a] ?? a}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </Section>

            {/* ── Culture & religion ────────────────────────────── */}
            <Section title="Culture and religion" id="culture"
              empty={!ing.cultural_notes && sec('culture').length === 0}
              emptyNote="Cultural and religious notes for this ingredient are on the way.">
              {ing.cultural_notes && renderProse(ing.cultural_notes)}
              {sec('culture').length > 0 && (
                <div style={{ marginTop: ing.cultural_notes ? 18 : 0 }}>
                  <SubSections items={sec('culture')} />
                </div>
              )}
            </Section>

            {/* ── Diets ─────────────────────────────────────────── */}
            <Section title="Diets" id="diets"
              empty={!hasEthical}
              emptyNote="Dietary suitability hasn't been recorded for this ingredient yet.">
              {hasEthical && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {ing.is_vegan === true && <Tag label="Vegan" positive />}
                  {ing.is_vegetarian === true && <Tag label="Vegetarian" positive />}
                  {ing.is_halal === true && <Tag label="Halal" positive />}
                  {ing.is_kosher === true && <Tag label="Kosher" positive />}
                  {ing.is_gluten_free === true && <Tag label="Gluten-free" positive />}
                  {ing.is_vegan === false && <Tag label="Not vegan" />}
                  {ing.is_vegetarian === false && <Tag label="Not vegetarian" />}
                </div>
              )}
            </Section>

            {/* ── Production ────────────────────────────────────── */}
            <Section title="Production" id="production"
              empty={!ing.manufacturing_notes && sec('production').length === 0 && !aiPolling}
              emptyNote="Production and cultivation notes haven't been added yet.">
              {aiPolling && !ing.manufacturing_notes && sec('production').length === 0
                ? <AiPlaceholder lines={3} />
                : (
                  <>
                    {ing.manufacturing_notes && renderProse(ing.manufacturing_notes)}
                    {sec('production').length > 0 && (
                      <div style={{ marginTop: ing.manufacturing_notes ? 18 : 0 }}>
                        <SubSections items={sec('production')} />
                      </div>
                    )}
                  </>
                )}
            </Section>

            {/* ── History ───────────────────────────────────────── */}
            <Section title="History" id="history"
              empty={!ing.history && sec('history').length === 0 && !aiPolling}
              emptyNote="The history and origin of this ingredient is being written.">
              {aiPolling && !ing.history && sec('history').length === 0
                ? <AiPlaceholder lines={4} />
                : (
                  <>
                    {ing.history && renderProse(ing.history)}
                    {sec('history').length > 0 && (
                      <div style={{ marginTop: ing.history ? 18 : 0 }}>
                        <SubSections items={sec('history')} />
                      </div>
                    )}
                  </>
                )}
            </Section>

            {/* ── Can be confused with ──────────────────────────── */}
            {/* Renders from a typed `confused_with` entity_relation (symmetric,
                admin-entered). The relation read path + admin entry land with
                the ingredient editor; for now this is a quiet scaffold slot. */}
            <Section title="Can be confused with" id="confused-with"
              empty={(ing.confusedWith?.length ?? 0) === 0}
              emptyNote="No look-alike ingredients have been noted yet.">
              {(ing.confusedWith?.length ?? 0) > 0 && (
                <p style={{ fontSize: 13.5, lineHeight: 1.9, margin: 0, color: 'var(--fg-secondary)' }}>
                  {ing.confusedWith!.map((r, i, arr) => (
                    <React.Fragment key={r.id}>
                      <KLink href={`/ingredients/${r.slug}`}>{r.name}</KLink>
                      {i < arr.length - 1 ? ', ' : ''}
                    </React.Fragment>
                  ))}
                </p>
              )}
            </Section>

            {/* ── Product information (products only) ────────────── */}
            {ing.is_product && (
              <Section title="Product information" id="product">
                <table style={{ width: '100%', borderCollapse: 'collapse', border: B }}>
                  <tbody>
                    {ing.barcode && <ProductRow label="Barcode" value={ing.barcode} mono />}
                    {ing.net_weight_g != null && <ProductRow label="Net weight" value={`${ing.net_weight_g}g`} />}
                    {ing.serving_size_g != null && <ProductRow label="Serving size" value={`${ing.serving_size_g}g`} />}
                    {ing.packaging_type && <ProductRow label="Packaging" value={ing.packaging_type} />}
                    {ing.producer && <ProductRow label="Producer" value={ing.producer} />}
                    {ing.country_of_origin && <ProductRow label="Country" value={ing.country_of_origin} />}
                  </tbody>
                </table>
                {ing.ingredient_list && (
                  <div style={{ marginTop: 12 }}>
                    <SubLabel>Ingredient list</SubLabel>
                    <div style={{ padding: '10px 12px', border: B, fontFamily: MONO,
                      fontSize: 11, color: MUT, lineHeight: 1.7 }}>{ing.ingredient_list}</div>
                  </div>
                )}
                {(ing.recipeCount ?? 0) === 0 && (
                  <div style={{ marginTop: 12, padding: 16, border: '1px dashed var(--border)', textAlign: 'center' }}>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: MUT,
                      textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>
                      No recipes yet
                    </div>
                    <a href={`/my/recipes/import?product=${encodeURIComponent(ing.name)}&productSlug=${encodeURIComponent(ing.slug)}`}
                      style={{ fontFamily: MONO, fontSize: 11, color: 'var(--accent)',
                        textDecoration: 'none', padding: '5px 12px', border: B }}>
                      Create a recipe using this product →
                    </a>
                  </div>
                )}
                {ing.off_id && (
                  <div style={{ marginTop: 12 }}>
                    <a href={`https://world.openfoodfacts.org/product/${ing.off_id}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{ fontFamily: MONO, fontSize: 10, color: MUT, textDecoration: 'none',
                        display: 'flex', alignItems: 'center', gap: 4 }}>
                      <ExternalLink size={9} /> View on Open Food Facts
                    </a>
                  </div>
                )}
              </Section>
            )}

            {/* "Make it yourself" — surfaced inline (was rail-only) */}
            {ing.transformationRecipe && (
              <div style={{ marginTop: 4 }}>
                <SubLabel>Make it yourself</SubLabel>
                <a href={`/recipes/${ing.transformationRecipe.slug}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '10px 14px', border: '1px solid var(--accent)',
                    background: 'var(--accent-subtle)', textDecoration: 'none', color: FG }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{ing.transformationRecipe.title}</span>
                  <ExternalLink size={11} style={{ color: 'var(--accent)' }} />
                </a>
              </div>
            )}

          </div>
        </div>

        {/* (Assistant rail is now global in AppShell; TOC is inline at top.) */}
      </div>

      <style>{`@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </TocProvider>
  );
}

function ProductRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <tr style={{ borderTop: B }}>
      <td style={{ padding: '8px 12px', fontFamily: MONO, fontSize: 10,
        textTransform: 'uppercase', letterSpacing: '0.12em', color: MUT,
        borderRight: B, whiteSpace: 'nowrap' }}>{label}</td>
      <td style={{ padding: '8px 12px', fontFamily: mono ? MONO : 'inherit', fontSize: 12 }}>{value}</td>
    </tr>
  );
}
