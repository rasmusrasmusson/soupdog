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
interface MealRecipe {
  id: string; slug: string; title: string; servings: number | null;
  approxTotalMinutes: number | null; approxActiveMinutes: number | null;
  components: Component[]; combinedIngredients: CombinedIng[];
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
  const [separate, setSeparate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/my/meals/${id}/recipe`);
      if (res.ok) setData(await res.json());
    } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { if (id) load(); }, [id, load]);

  if (loading) {
    return <div className="max-w-3xl mx-auto px-4 md:px-8 py-10" style={{ ...MONO, fontSize: 12, color: 'var(--muted)' }}>
      <Loader2 size={14} className="animate-spin inline mr-2" /> Loading…
    </div>;
  }
  if (!data) {
    return <div className="max-w-3xl mx-auto px-4 md:px-8 py-10" style={{ color: 'var(--muted)' }}>Meal not found.</div>;
  }

  const empty = data.components.length === 0;

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-10">
      {/* Breadcrumb */}
      <div style={{ ...MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 18 }}>
        <Link href="/my/meals" style={{ color: 'var(--muted)', textDecoration: 'none' }} className="hover:text-[var(--accent)]">Meals</Link>
        <span style={{ margin: '0 8px' }}>/</span>
        <span>Recipe</span>
        <Link href={`/my/meals/${id}`} style={{ float: 'right', color: 'var(--accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }} className="hover:underline">
          <Pencil size={12} /> Edit meal
        </Link>
      </div>

      {/* Hero */}
      <h1 style={{ ...SERIF, fontSize: 34, color: 'var(--fg)', marginBottom: 8, fontWeight: 400 }}>{data.title}</h1>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', ...MONO, fontSize: 11, color: 'var(--muted)', marginBottom: 4, letterSpacing: '0.04em' }}>
        {data.servings != null && <span>Serves {data.servings}</span>}
        {data.approxTotalMinutes != null && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Clock size={11} /> ~{data.approxTotalMinutes} min total</span>}
        <span>{data.components.length} component{data.components.length !== 1 ? 's' : ''}</span>
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--muted)', fontStyle: 'italic', marginBottom: 24, maxWidth: 520, lineHeight: 1.6 }}>
        Times are approximate — this view lists the dishes together; smart scheduling that overlaps and shares prep is coming.
      </p>

      {empty ? (
        <div style={{ border: `1px dashed var(--border)`, padding: '40px 24px', textAlign: 'center', color: 'var(--muted)' }}>
          <p style={{ ...MONO, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 12 }}>This meal has no components yet</p>
          <Link href={`/my/meals/${id}`} style={{ ...MONO, fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }} className="hover:underline">Compose it →</Link>
        </div>
      ) : (
        <>
          {/* Toggle */}
          <div style={{ display: 'inline-flex', border: B, borderRadius: 7, overflow: 'hidden', marginBottom: 28 }}>
            <button onClick={() => setSeparate(false)} style={toggle(!separate)}>Together</button>
            <button onClick={() => setSeparate(true)} style={toggle(separate)}>Dishes separately</button>
          </div>

          {!separate && (
            <section style={{ marginBottom: 36 }}>
              <SectionTitle>Everything you need</SectionTitle>
              <div style={{ borderTop: B }}>
                {data.combinedIngredients.map((ing, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 2px', borderBottom: B }}>
                    <span style={{ fontSize: 14.5, color: 'var(--fg)' }}>{ing.name}</span>
                    <span style={{ ...MONO, fontSize: 12, color: 'var(--muted)' }}>
                      {ing.mixedUnits ? 'across dishes' : fmtQty(ing.quantityValue, ing.quantityUnit)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Components as labelled sections */}
          {data.components.map(c => (
            <section key={c.componentId} style={{ marginBottom: 40 }}>
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

              {separate && (
                <ComponentIngredientList steps={c.steps} />
              )}

              <StepGroups steps={c.steps} />
            </section>
          ))}
        </>
      )}
    </div>
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
