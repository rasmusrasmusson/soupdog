// src/app/my/meals/[id]/recipe/page.tsx
'use client';

// The Level-0 unified recipe for a meal. Renders the meal as ONE page: a combined
// ingredient list, then each component (dish/side/drink) as a labelled section
// using the existing step-group grammar. L0 is deterministic and does NOT reorder
// or merge prep across dishes (that is L1, a later phase) — so the time shown is
// a rough sum, clearly labelled approximate. The "see dishes separately" toggle
// flips between the merged ingredient list and per-component reading, for users
// unused to a single mixed recipe.

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Pencil, Flame, Clock } from 'lucide-react';
import { PrintButton, PrintHeader } from '@/components/recipe/PrintRecipe';

type CompType = 'dish' | 'side' | 'drink';
interface StepIng { name: string; quantityValue: number; quantityUnit: string; prep: string | null }
interface Step {
  id: string; group: string | null; stepType: string; instruction: string;
  durationMinutes: number | null; temperatureCelsius: number | null; ingredients: StepIng[];
}
interface Component {
  componentId: string; type: CompType; title: string; cuisine: string | null;
  slug: string | null; canonicalId: string; servingsTarget: number | null; baseServings: number | null;
  note: string | null; totalTimeMinutes: number | null; steps: Step[];
}
interface CombinedIng { name: string; quantityValue: number | null; quantityUnit: string | null; mixedUnits: boolean }
interface MergedStep {
  id: string; dishTitle: string; dishCanonicalId: string; group: string | null;
  type: 'human' | 'machine' | 'passive' | 'hold';
  instruction: string; durationSeconds: number; temperatureCelsius: number | null;
  ingredients: StepIng[];
  startOffsetSeconds: number; endOffsetSeconds: number; isHold: boolean; meanwhile: boolean;
}
interface MergedPayload {
  totalSeconds: number;
  scheduled: MergedStep[];
  hasDurations: boolean;
}
interface MealRecipe {
  id: string; slug: string; title: string; servings: number | null;
  approxTotalMinutes: number | null; approxActiveMinutes: number | null;
  components: Component[]; combinedIngredients: CombinedIng[];
  merged: MergedPayload | null;
  mergedTotalMinutes: number | null;
  mergeMissing?: boolean;
  mergeStale?: boolean;
}

type ViewMode = 'cook' | 'sections' | 'separate';

interface Narrative {
  intro?: string;
  steps: { n: number; text: string }[];
  outro?: string;
}

const MONO = { fontFamily: 'var(--font-mono)' } as const;
const SERIF = { fontFamily: 'var(--font-serif, Georgia, serif)' } as const;
const B = '1px solid var(--border)';
const TYPE_LABEL: Record<CompType, string> = { dish: 'Dish', side: 'Side', drink: 'Drink' };

function fmtQty(v: number | null, u: string | null): string {
  if (v == null || u == null) return '';
  const n = Number.isInteger(v) ? v : Math.round(v * 10) / 10;
  return `${n} ${u}`;
}

export default function MealRecipePage() {
  const params = useParams();
  const id = params?.id as string;
  const [data, setData] = useState<MealRecipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<ViewMode>('cook');
  const [building, setBuilding] = useState(false);   // auto-rebuild in progress

  // L2 narrative: lazily fetched on first entry to cook mode, then cached client-side.
  const [narrative, setNarrative] = useState<Narrative | null>(null);
  const [narrativeState, setNarrativeState] = useState<'idle' | 'loading' | 'done' | 'failed'>('idle');
  const [showSteps, setShowSteps] = useState(false);   // toggle: prose vs the raw L1 timeline

  // Load the recipe. If the cook-together plan is missing or stale (the meal
  // changed since it was last built), rebuild it automatically and reload — so
  // the user never has to manually "merge"; opening the recipe always shows a
  // current plan. The rebuild is deterministic and fast (no AI); the L2 narrative
  // then regenerates lazily as before.
  const load = useCallback(async (allowAutoBuild = true) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/my/meals/${id}/recipe`);
      if (!res.ok) return;
      const d = await res.json();
      setData(d);

      if (allowAutoBuild && (d.mergeMissing || d.mergeStale)) {
        // Plan is out of date — rebuild it, then reload once (without re-triggering
        // a build, to avoid any loop). Reset the narrative so it regenerates for
        // the fresh plan.
        setBuilding(true);
        setNarrative(null);
        setNarrativeState('idle');
        try {
          await fetch(`/api/my/meals/${id}/build`, { method: 'POST' });
          const res2 = await fetch(`/api/my/meals/${id}/recipe`);
          if (res2.ok) setData(await res2.json());
        } catch { /* fall back to whatever we have */ }
        finally { setBuilding(false); }
      }
    } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { if (id) load(); }, [id, load]);

  // Lazy-generate the cooking narrative the first time the cook tab is shown and
  // a merge exists. Cached server-side; this only pays an AI call when needed.
  const fetchNarrative = useCallback(async () => {
    if (narrativeState !== 'idle') return;
    setNarrativeState('loading');
    try {
      const res = await fetch(`/api/my/meals/${id}/narrative`, { method: 'POST' });
      if (res.ok) {
        const d = await res.json();
        if (d.narrative) { setNarrative(d.narrative); setNarrativeState('done'); return; }
      }
      setNarrativeState('failed');
    } catch {
      setNarrativeState('failed');
    }
  }, [id, narrativeState]);

  useEffect(() => {
    if (mode === 'cook' && data && (data.merged?.scheduled?.length ?? 0) > 0) {
      fetchNarrative();
    }
  }, [mode, data, fetchNarrative]);

  if (loading) {
    return <div className="max-w-3xl mx-auto px-4 md:px-8 py-10" style={{ ...MONO, fontSize: 12, color: 'var(--muted)' }}>
      <Loader2 size={14} className="animate-spin inline mr-2" /> Loading…
    </div>;
  }
  if (!data) {
    return <div className="max-w-3xl mx-auto px-4 md:px-8 py-10" style={{ color: 'var(--muted)' }}>Meal not found.</div>;
  }

  const empty = data.components.length === 0;
  const hasMerge = !!(data.merged && (data.merged.scheduled?.length ?? 0) > 0);

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-10">
      {/* Print-only masthead (hidden on screen). */}
      <PrintHeader title={data.title} subtitle={[data.servings != null ? `Serves ${data.servings}` : null, hasMerge && data.mergedTotalMinutes != null ? `${data.mergedTotalMinutes} min` : null].filter(Boolean).join('  ·  ')} url={typeof window !== 'undefined' ? window.location.href : undefined} />

      {/* Breadcrumb (hidden in print) */}
      <div className="no-print" style={{ ...MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Link href="/my/meals" style={{ color: 'var(--muted)', textDecoration: 'none' }} className="hover:text-[var(--accent)]">Meals</Link>
        <span>/</span>
        <span>Recipe</span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 12 }}>
          <PrintButton title={data.title} />
          <Link href={`/my/meals/${id}`} style={{ color: 'var(--accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }} className="hover:underline">
            <Pencil size={12} /> Edit meal
          </Link>
        </span>
      </div>

      {/* Hero */}
      <h1 style={{ ...SERIF, fontSize: 34, color: 'var(--fg)', marginBottom: 8, fontWeight: 400 }}>{data.title}</h1>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', ...MONO, fontSize: 11, color: 'var(--muted)', marginBottom: 4, letterSpacing: '0.04em' }}>
        {data.servings != null && <span>Serves {data.servings}</span>}
        {hasMerge && data.mergedTotalMinutes != null
          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Clock size={11} /> {data.mergedTotalMinutes} min, start to serve</span>
          : data.approxTotalMinutes != null && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Clock size={11} /> ~{data.approxTotalMinutes} min total</span>}
        <span>{data.components.length} component{data.components.length !== 1 ? 's' : ''}</span>
      </div>
      {building && (
        <p style={{ fontSize: 11.5, color: 'var(--muted)', fontStyle: 'italic', marginBottom: 24, maxWidth: 520, lineHeight: 1.6, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Loader2 size={12} className="animate-spin" /> Preparing your cook-together plan…
        </p>
      )}
      {!building && !hasMerge && !empty && (
        <p style={{ fontSize: 11.5, color: 'var(--muted)', fontStyle: 'italic', marginBottom: 24, maxWidth: 520, lineHeight: 1.6 }}>
          Add timed steps to your dishes to generate a cook-together plan.
        </p>
      )}
      {!building && hasMerge && <div style={{ marginBottom: 20 }} />}

      {empty ? (
        <div style={{ border: `1px dashed var(--border)`, padding: '40px 24px', textAlign: 'center', color: 'var(--muted)' }}>
          <p style={{ ...MONO, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 12 }}>This meal has no components yet</p>
          <Link href={`/my/meals/${id}`} style={{ ...MONO, fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }} className="hover:underline">Compose it →</Link>
        </div>
      ) : (
        <>
          {/* View-mode toggle */}
          <div className="no-print" style={{ display: 'inline-flex', border: B, borderRadius: 7, overflow: 'hidden', marginBottom: 28 }}>
            {hasMerge && <button onClick={() => setMode('cook')} style={toggle(mode === 'cook')}>Cook together</button>}
            <button onClick={() => setMode('sections')} style={toggle(mode === 'sections')}>By dish</button>
            <button onClick={() => setMode('separate')} style={toggle(mode === 'separate')}>Dishes separately</button>
          </div>

          {/* ── COOK TOGETHER (L2 narrative over L1 timeline) ── */}
          {mode === 'cook' && hasMerge && (
            <>
              <section style={{ marginBottom: 30 }}>
                <CombinedIngredients items={data.combinedIngredients} />
              </section>

              {/* Method: prose (L2) by default; toggle to the timed step list (L1). */}
              <section>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <SectionTitle>Cook it together</SectionTitle>
                  {narrativeState === 'done' && (
                    <button onClick={() => setShowSteps(s => !s)}
                      style={{ ...MONO, fontSize: 10, color: 'var(--muted)', background: 'none', border: B, borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}>
                      {showSteps ? 'Read as method' : 'Show timed steps'}
                    </button>
                  )}
                </div>

                {/* Narrative loading */}
                {narrativeState === 'loading' && (
                  <div style={{ ...MONO, fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0 16px' }}>
                    <Loader2 size={13} className="animate-spin" /> Writing the method…
                  </div>
                )}

                {/* Narrative prose (default when done and not toggled to steps) */}
                {narrativeState === 'done' && narrative && !showSteps && (
                  <div>
                    {narrative.intro ? (
                      <p style={{ fontSize: 14.5, color: 'var(--muted)', fontStyle: 'italic', marginBottom: 16, lineHeight: 1.6 }}>{narrative.intro}</p>
                    ) : null}
                    <div style={{ borderTop: B }}>
                      {narrative.steps.map((s) => (
                        <div key={s.n} style={{ display: 'flex', gap: 14, padding: '12px 0', borderBottom: B }}>
                          <span style={{ ...MONO, fontSize: 12, color: '#b3b0a8', flexShrink: 0, width: 22, textAlign: 'right' }}>{s.n}</span>
                          <div style={{ fontSize: 15, color: 'var(--fg)', lineHeight: 1.65 }}>{s.text}</div>
                        </div>
                      ))}
                    </div>
                    {narrative.outro ? (
                      <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 16, lineHeight: 1.6 }}>{narrative.outro}</p>
                    ) : null}
                  </div>
                )}

                {/* The timed step list — shown when toggled, or as fallback if the
                    narrative failed or is still idle. Always available. */}
                {(showSteps || narrativeState === 'failed' || narrativeState === 'idle') && (
                  <CookTimeline merged={data.merged!} bare />
                )}
                {narrativeState === 'failed' && (
                  <p style={{ fontSize: 11.5, color: 'var(--muted)', fontStyle: 'italic', marginTop: 10 }}>
                    Showing the timed steps — the written method couldn’t be generated just now.
                  </p>
                )}
              </section>
            </>
          )}

          {/* ── BY DISH (L0 sections + combined ingredients) ── */}
          {(mode === 'sections' || (mode === 'cook' && !hasMerge)) && (
            <>
              <section style={{ marginBottom: 36 }}>
                <CombinedIngredients items={data.combinedIngredients} />
              </section>
              {data.components.map(c => <DishSection key={c.componentId} c={c} showIngredients={false} />)}
            </>
          )}

          {/* ── DISHES SEPARATELY (per-dish, full) ── */}
          {mode === 'separate' && (
            data.components.map(c => <DishSection key={c.componentId} c={c} showIngredients={true} />)
          )}
        </>
      )}
    </div>
  );
}

// One dish rendered as a labelled section (used by "By dish" and "Separately").
function DishSection({ c, showIngredients }: { c: Component; showIngredients: boolean }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
        <h2 style={{ ...SERIF, fontSize: 23, color: 'var(--fg)', fontWeight: 400 }}>
          {c.slug ? <Link href={`/recipes/${c.slug}`} style={{ color: 'inherit', textDecoration: 'none' }} className="hover:text-[var(--accent)]">{c.title}</Link> : c.title}
        </h2>
        <span style={{ ...MONO, fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#b3b0a8', border: B, padding: '2px 8px', borderRadius: 999 }}>
          {TYPE_LABEL[c.type]}
        </span>
      </div>
      <div style={{ ...MONO, fontSize: 11, color: 'var(--muted)', marginBottom: 16 }}>
        {[c.cuisine, c.totalTimeMinutes ? `${c.totalTimeMinutes} min` : null,
          (c.servingsTarget ?? c.baseServings) ? `serves ${c.servingsTarget ?? c.baseServings}` : null]
          .filter(Boolean).join(' · ')}
      </div>
      {showIngredients && <ComponentIngredientList steps={c.steps} />}
      <StepGroups steps={c.steps} />
    </section>
  );
}

// ── The L1 cook-together timeline ──────────────────────────────────────────
// One ordered list of steps across all dishes, scheduled backward from serving.
// Each step shows which dish it belongs to, a relative "start" label, duration/
// temp, and a "meanwhile" tag when it fills another dish's passive window. Holds
// (keep-warm) render distinctly.
function CookTimeline({ merged, bare }: { merged: MergedPayload; bare?: boolean }) {
  const steps = merged.scheduled ?? [];
  if (steps.length === 0) {
    return <div style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic' }}>No timed steps to schedule.</div>;
  }
  const fmtOffset = (s: number) => {
    if (s <= 0) return 'at serving';
    const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
    if (h > 0) return `${h}h${m.toString().padStart(2, '0')} before`;
    if (m > 0) return `${m} min before`;
    return 'just before';
  };
  let n = 0;
  return (
    <section>
      {!bare && <SectionTitle>Cook it together</SectionTitle>}
      {!bare && (
        <p style={{ fontSize: 11.5, color: 'var(--muted)', fontStyle: 'italic', marginBottom: 16, maxWidth: 540, lineHeight: 1.6 }}>
          One plan for the whole meal, timed so everything is ready together. Steps from different dishes are interleaved — start each when its time comes.
        </p>
      )}
      <div style={{ borderTop: B }}>
        {steps.map((s) => {
          const isHold = s.type === 'hold';
          const nonBlocking = s.type === 'machine' || s.type === 'passive';
          if (!isHold) n += 1;
          return (
            <div key={s.id} style={{
              display: 'flex', gap: 14, padding: '12px 0', borderBottom: B,
              background: isHold ? 'var(--accent-subtle)' : 'transparent',
            }}>
              <span style={{ ...MONO, fontSize: 12, color: '#b3b0a8', flexShrink: 0, width: 26, textAlign: 'right' }}>
                {isHold ? '⏸' : n}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 3 }}>
                  <span style={{ ...MONO, fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)' }}>
                    {s.dishTitle}
                  </span>
                  {s.meanwhile && !isHold && (
                    <span style={{ ...MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', border: B, padding: '1px 6px', borderRadius: 999 }}>
                      meanwhile
                    </span>
                  )}
                  {nonBlocking && (
                    <span style={{ ...MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                      hands-free
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 14.5, color: 'var(--fg)', lineHeight: 1.6 }}>{s.instruction}</div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 5, ...MONO, fontSize: 10.5, color: 'var(--muted)' }}>
                  <span>{fmtOffset(s.startOffsetSeconds)}</span>
                  {s.temperatureCelsius ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Flame size={10} /> {s.temperatureCelsius}°C</span> : null}
                  {s.durationSeconds ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Clock size={10} /> {Math.round(s.durationSeconds / 60)} min</span> : null}
                  {s.ingredients?.map((ing, k) => (
                    <span key={k}>{ing.name}{ing.quantityValue ? ` (${fmtQty(ing.quantityValue, ing.quantityUnit)})` : ''}</span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// Combined shopping list rendered as the recipe page's bordered table
// (mirrors RecipeDisplay's Ingredients table: # · Product · Qty · Unit), so the
// meal recipe shares the real recipe's visual language instead of a bare list.
function CombinedIngredients({ items }: { items: CombinedIng[] }) {
  const th: React.CSSProperties = {
    padding: '8px 14px', ...MONO, fontSize: 9, textTransform: 'uppercase',
    letterSpacing: '0.18em', color: 'var(--muted)', borderRight: B, textAlign: 'left',
    whiteSpace: 'nowrap',
  };
  const td: React.CSSProperties = { padding: '9px 14px', color: 'var(--fg)', verticalAlign: 'middle', borderRight: B };
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <span style={{ ...MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', color: 'var(--muted)' }}>Ingredients</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span style={{ ...MONO, fontSize: 9, color: 'var(--muted)' }}>{items.length} items · everything you need</span>
      </div>

      {/* mobile: stacked rows */}
      <div className="md:hidden" style={{ border: B }}>
        {items.map((ing, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderBottom: i < items.length - 1 ? B : 'none' }}>
            <span style={{ ...MONO, fontSize: 10, color: 'var(--muted)', width: 20, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
            <span style={{ fontWeight: 500, fontSize: 13, flex: 1, minWidth: 0 }}>{ing.name}</span>
            <span style={{ ...MONO, fontSize: 12, color: 'var(--fg)', flexShrink: 0 }}>
              {ing.mixedUnits ? 'across dishes' : fmtQty(ing.quantityValue, ing.quantityUnit)}
            </span>
          </div>
        ))}
      </div>

      {/* desktop: bordered table */}
      <div className="hidden md:block" style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', border: B, width: '100%', fontSize: 12, minWidth: 420 }}>
          <thead>
            <tr style={{ background: 'var(--surface-hover)' }}>
              <th style={{ ...th, width: 36 }}>#</th>
              <th style={th}>Product</th>
              <th style={{ ...th, width: 120, textAlign: 'right', borderRight: 'none' }}>Quantity</th>
            </tr>
          </thead>
          <tbody>
            {items.map((ing, i) => (
              <tr key={i} style={{ borderTop: B }}>
                <td style={{ ...td, ...MONO, fontSize: 11, color: 'var(--muted)', textAlign: 'right', width: 36 }}>{i + 1}</td>
                <td style={{ ...td, fontWeight: 500 }}>{ing.name}</td>
                <td style={{ ...td, ...MONO, color: ing.mixedUnits ? 'var(--muted)' : 'var(--fg)', textAlign: 'right', borderRight: 'none' }}>
                  {ing.mixedUnits ? 'across dishes' : fmtQty(ing.quantityValue, ing.quantityUnit)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ ...MONO, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#9a978f', marginBottom: 10 }}>{children}</div>;
}
function toggle(active: boolean): React.CSSProperties {
  return { padding: '6px 14px', fontSize: 11, fontFamily: 'var(--font-mono)', border: 'none', cursor: 'pointer',
    background: active ? 'var(--surface)' : 'transparent', color: active ? 'var(--accent)' : 'var(--muted)' };
}

// Per-component ingredient list (only shown in "separately" mode).
function ComponentIngredientList({ steps }: { steps: Step[] }) {
  const ings = steps.flatMap(s => s.ingredients);
  if (ings.length === 0) return null;
  return (
    <div style={{ marginBottom: 18 }}>
      <SectionTitle>Ingredients</SectionTitle>
      <div style={{ borderTop: B }}>
        {ings.map((ing, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '7px 2px', borderBottom: B }}>
            <span style={{ fontSize: 14, color: 'var(--fg)' }}>{ing.name}{ing.prep ? <span style={{ color: 'var(--muted)' }}>, {ing.prep}</span> : null}</span>
            <span style={{ ...MONO, fontSize: 11.5, color: 'var(--muted)' }}>{fmtQty(ing.quantityValue, ing.quantityUnit)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Steps grouped by group_label (the sub-recipe's own grouping), rendered as the
// recipe view does. Steps with no group fall under an implicit single flow.
function StepGroups({ steps }: { steps: Step[] }) {
  if (steps.length === 0) {
    return <div style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic' }}>No steps recorded for this dish.</div>;
  }
  // Preserve order; collect groups in first-seen order.
  const order: string[] = [];
  const byGroup: Record<string, Step[]> = {};
  for (const s of steps) {
    const key = s.group ?? '__flow__';
    if (!order.includes(key)) order.push(key);
    (byGroup[key] ??= []).push(s);
  }
  const multi = order.length > 1 || (order.length === 1 && order[0] !== '__flow__');

  let n = 0;
  return (
    <div>
      {order.map(key => (
        <div key={key} style={{ marginBottom: 18 }}>
          {multi && key !== '__flow__' && (
            <div style={{ ...MONO, fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 8 }}>{key}</div>
          )}
          {byGroup[key].map(s => {
            n += 1;
            return (
              <div key={s.id} style={{ display: 'flex', gap: 14, padding: '10px 0', borderBottom: B }}>
                <span style={{ ...MONO, fontSize: 12, color: '#b3b0a8', flexShrink: 0, width: 22, textAlign: 'right' }}>{n}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14.5, color: 'var(--fg)', lineHeight: 1.6 }}>{s.instruction}</div>
                  {(s.durationMinutes || s.temperatureCelsius || s.ingredients.length > 0) && (
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 5, ...MONO, fontSize: 10.5, color: 'var(--muted)' }}>
                      {s.temperatureCelsius ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Flame size={10} /> {s.temperatureCelsius}°C</span> : null}
                      {s.durationMinutes ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Clock size={10} /> {s.durationMinutes} min</span> : null}
                      {s.ingredients.map((ing, k) => (
                        <span key={k}>{ing.name}{ing.quantityValue ? ` (${fmtQty(ing.quantityValue, ing.quantityUnit)})` : ''}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
