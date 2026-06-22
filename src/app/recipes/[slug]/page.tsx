// src/app/recipes/[slug]/page.tsx
'use client';
import React, { useState, useEffect, use } from 'react';
import { formatDuration } from '@/lib/utils';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import { PrintButton } from '@/components/recipe/PrintRecipe';
import { RecipePrintLayout } from '@/components/recipe/RecipePrintLayout';
import type { RecipeStep, RecipeIngredientRef, Recipe } from '@/types';
import { calculateRecipeTiming } from '@/lib/recipe-timing';
import { calculateRecipeNutrition, type IngredientNutrition } from '@/lib/recipe-nutrition';
import { RecipeDisplay } from '@/components/recipe/RecipeDisplay';
import { useAssistantContext } from '@/components/assistant/AssistantProvider';

function useChecklist(count: number) {
  const [checked, setChecked] = useState<boolean[]>(Array(count).fill(false));
  const toggle = (i: number) => setChecked(p => p.map((v, idx) => idx === i ? !v : v));
  return { checked, toggle };
}

// ── Appliance settings badge ──────────────────────────────────

// ── Bookmark button ───────────────────────────────────────────
function BookmarkButton({ canonicalId }: { canonicalId: string }) {
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/my/saved-recipes')
      .then(r => r.ok ? r.json() : [])
      .then((list: any[]) => {
        setSaved(list.some((s: any) => s.canonicalId === canonicalId));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [canonicalId]);

  const toggle = async () => {
    if (loading) return;
    setLoading(true);
    if (saved) {
      await fetch(`/api/my/saved-recipes/${canonicalId}`, { method: 'DELETE' });
      setSaved(false);
    } else {
      await fetch('/api/my/saved-recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canonicalId }),
      });
      setSaved(true);
    }
    setLoading(false);
  };

  return (
    <button onClick={toggle}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        border: `1px solid ${saved ? 'var(--accent)' : 'var(--border)'}`,
        padding: '6px 12px', fontSize: 11, cursor: 'pointer',
        fontFamily: 'var(--font-mono)', background: saved ? 'var(--accent-subtle)' : 'transparent',
        color: saved ? 'var(--accent)' : 'var(--fg)',
        flexShrink: 0, transition: 'all 0.15s', opacity: loading ? 0.6 : 1,
      }}
      title={saved ? 'Remove from saved' : 'Save recipe'}
    >
      {saved
        ? <><BookmarkCheck size={11} strokeWidth={1.5} /> Saved</>
        : <><Bookmark size={11} strokeWidth={1.5} /> Save</>
      }
    </button>
  );
}

// ── Author: re-bind this recipe's steps to newer concepts ─────────────────────
// Concept binding is frozen at save time, so concepts added later (e.g. "Slice
// cucumber") don't retroactively attach. This button dry-runs the re-specialisation
// on mount and ONLY appears when the AUTHOR has something to update on THIS recipe.
// Author-only: a super admin viewing someone else's recipe never sees it (the endpoint
// enforces the same — author pushes updates into their own recipe, nobody else's).
function RespecialiseButton({ canonicalId, isAuthor }: { canonicalId: string; isAuthor: boolean }) {
  const [busy, setBusy] = useState(false);
  const [changes, setChanges] = useState<{ stepOrder: number; instruction: string; from: string | null; to: string }[] | null>(null);
  const [hasChanges, setHasChanges] = useState(false); // null/false until the mount check says yes
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // On mount (author only), quietly dry-run to learn whether anything would change.
  // Only then do we render the button. No AI — a cheap DB-only check.
  useEffect(() => {
    if (!isAuthor || !canonicalId) return;
    let cancelled = false;
    fetch(`/api/admin/recipes/${canonicalId}/respecialise`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d && (d.changeCount ?? 0) > 0) { setHasChanges(true); setChanges(d.changes ?? []); } })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isAuthor, canonicalId]);

  if (!isAuthor || !hasChanges) return null;

  const apply = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/admin/recipes/${canonicalId}/respecialise?apply=true`, { method: 'POST' });
      const d = await r.json();
      if (!r.ok) setMsg(d.error ?? 'Failed');
      else {
        setMsg(`Updated ${d.updated} step${d.updated === 1 ? '' : 's'}…`);
        // small polish: reload so the change is visible immediately
        setTimeout(() => window.location.reload(), 700);
      }
    } catch { setMsg('Apply failed'); }
    setBusy(false);
  };

  return (
    <span style={{ position: 'relative', flexShrink: 0 }}>
      <button onClick={() => setOpen(o => !o)} disabled={busy}
        style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--border)',
          padding: '6px 12px', fontSize: 11, cursor: busy ? 'default' : 'pointer',
          fontFamily: 'var(--font-mono)', background: 'transparent', color: 'var(--accent)', opacity: busy ? 0.6 : 1 }}
        title="Newer technique versions are available for this recipe">
        Re-specialise
      </button>
      {open && changes && (
        <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, width: 320, zIndex: 60,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 14,
          boxShadow: '0 6px 24px rgba(0,0,0,0.10)', fontFamily: 'var(--font-mono)' }}>
          <div style={{ fontSize: 11, color: 'var(--fg)', marginBottom: 8, fontWeight: 600 }}>
            {changes.length} step{changes.length === 1 ? '' : 's'} would change:
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            {changes.map((c, i) => (
              <div key={i} style={{ fontSize: 11, lineHeight: 1.4 }}>
                <span style={{ color: 'var(--muted)' }}>#{c.stepOrder}</span>{' '}
                <span style={{ color: 'var(--muted)' }}>{c.from ?? '—'}</span>
                <span style={{ color: 'var(--accent)' }}> → {c.to}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={apply} disabled={busy}
              style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '6px 14px',
                fontSize: 11, cursor: busy ? 'default' : 'pointer', fontFamily: 'var(--font-mono)' }}>
              {busy ? 'Applying…' : 'Apply'}
            </button>
            <button onClick={() => setOpen(false)}
              style={{ background: 'transparent', color: 'var(--muted)', border: 'none', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}>
              Cancel
            </button>
          </div>
          {msg && <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 8 }}>{msg}</div>}
        </div>
      )}
    </span>
  );
}

// ── Appliance cell (compact) ──────────────────────────────────


// ── Map new-schema DB row to Recipe type ──────────────────────
function mapNewSchemaRecipe(row: any): Recipe {
  const rv = row.recipe_versions;

  const ingredients: RecipeIngredientRef[] = (rv?.version_ingredients ?? [])
    .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))
    .map((vi: any) => ({
      ingredientId:   vi.ingredients?.id   ?? vi.ingredient_id,
      ingredientSlug: vi.ingredients?.slug ?? '',
      name:           vi.ingredients?.name ?? '',
      category:       vi.ingredients?.category ?? undefined,
      quantity: { value: vi.quantity_value, unit: vi.quantity_unit },
      state:    vi.food_state  ?? undefined,
      prep:     vi.prep_note   ?? undefined,
      optional: vi.optional    ?? false,
      stepId:   vi.step_id     ?? undefined,
      nutritionPer100g:    vi.ingredients?.nutrition_per_100g    ?? undefined,
      densityGPerMl:       vi.ingredients?.density_g_per_ml      ?? undefined,
      typicalUnitWeightG:  vi.ingredients?.typical_unit_weight_g ?? undefined,
    }));

  const steps: RecipeStep[] = (rv?.version_steps ?? [])
    .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))
    .map((s: any) => ({
      id:          s.id,
      order:       s.order_index,
      type:        s.step_type,
      group:       s.group_label ?? undefined,
      instruction: s.instruction,
      notes:       s.notes ?? undefined,
      durationSeconds: s.duration_seconds ?? undefined,
      temperature: s.temperature_celsius
        ? { value: s.temperature_celsius, unit: 'celsius' as const }
        : undefined,
      applianceSettings: s.appliance_settings ?? undefined,
      taskId:      s.task_id ?? undefined,
      taskName:    (Array.isArray(s.tasks) ? s.tasks[0]?.name : s.tasks?.name) ?? undefined,
      taskTemplate: (Array.isArray(s.tasks) ? s.tasks[0]?.display_template : s.tasks?.display_template) ?? undefined,
      taskSingleTool: (Array.isArray(s.tasks) ? s.tasks[0]?.single_tool : s.tasks?.single_tool) ?? false,
    }));

  const equipment: any[] = (rv?.version_equipment ?? [])
    .map((ve: any) => ({
      equipmentId:  ve.equipment?.id   ?? '',
      name:         ve.equipment?.name ?? '',
      required:     ve.required ?? true,
      alternatives: ve.alternatives ?? undefined,
    }));

  return {
    id:                 row.id,
    slug:               row.slug,
    version:            row.version ?? 1,
    recipeVersionId:    rv?.id ?? undefined,
    title:              rv?.title ?? row.title,
    description:        rv?.description  ?? row.description  ?? undefined,
    cuisine:            rv?.cuisine      ?? row.cuisine      ?? undefined,
    tags:               rv?.tags         ?? row.tags         ?? undefined,
    servings:           rv?.base_servings ?? row.servings,
    difficulty:         rv?.difficulty   ?? row.difficulty,
    totalTimeSeconds:   rv?.total_time_seconds   ?? row.total_time_seconds   ?? 0,
    activeTimeSeconds:  rv?.active_time_seconds  ?? row.active_time_seconds  ?? undefined,
    passiveTimeSeconds: rv?.passive_time_seconds ?? row.passive_time_seconds ?? undefined,
    heroImageUrl:       rv?.hero_image_url ?? row.hero_image_url ?? undefined,
    ingredients,
    steps,
    equipment,
    nutrition:          rv?.nutrition ?? row.nutrition ?? undefined,
    ratings:            undefined,
    createdAt:          row.created_at,
    updatedAt:          row.updated_at,
  };
}

// ── Layer 2: thread upstream intermediate names onto consuming steps ──────────
// Each DAG edge (version_step_dependencies) carries the producer's intermediate name
// in `consumes_intermediate_label` (written at save time). A combine/transform step
// has no own ingredient by design, so its [ingredient] tag would otherwise be stripped
// — leaving a bare "Add" / "Toss". Here we fetch the incoming edges for this recipe's
// steps and attach the ordered list of labelled intermediates to each step, so the
// display layer can fill "Add the diced onion and hot oil".
//
// Done as its own small query (NOT a nested select) on purpose: the dependencies table
// has two FKs to version_steps (step_id, depends_on_step_id), which makes a nested
// embed FK-alias-fragile; a flat query keyed by the step ids we already have is robust
// and leaves the (critical, every-recipe) main query untouched.
async function attachIntermediates(supabase: any, recipe: Recipe): Promise<Recipe> {
  const stepIds = recipe.steps.map(s => s.id).filter(Boolean);
  if (stepIds.length === 0) return recipe;

  const { data: edges, error } = await supabase
    .from('version_step_dependencies')
    .select('step_id, depends_on_step_id, consumes_intermediate_label')
    .in('step_id', stepIds);

  if (error || !Array.isArray(edges) || edges.length === 0) return recipe;

  // producer step → its order_index, so we can present intermediates in a stable,
  // natural order (the order the producers appear in the recipe).
  const orderByStepId = new Map<string, number>();
  for (const s of recipe.steps) orderByStepId.set(s.id, s.order ?? 0);

  // consuming step id → [{ label, producerOrder }]
  const byStep = new Map<string, { label: string; producerOrder: number }[]>();
  for (const e of edges) {
    const label = (e.consumes_intermediate_label ?? '').trim();
    if (!label) continue; // edges from un-named producers (e.g. "bring to a boil") carry null
    const arr = byStep.get(e.step_id) ?? [];
    arr.push({ label, producerOrder: orderByStepId.get(e.depends_on_step_id) ?? 0 });
    byStep.set(e.step_id, arr);
  }

  const steps = recipe.steps.map(s => {
    const list = byStep.get(s.id);
    if (!list || list.length === 0) return s;
    const consumedIntermediates = list
      .sort((a, b) => a.producerOrder - b.producerOrder)
      .map(x => x.label);
    return { ...s, consumedIntermediates };
  });

  return { ...recipe, steps };
}

// ── Recipe nutrition section ──────────────────────────────────
function RecipeNutritionSection({ versionId, ingredients, servings, storedNutrition, onComputed }: {
  versionId?: string;
  ingredients: RecipeIngredientRef[];
  servings: number;
  storedNutrition?: any;
  onComputed?: (perServing: any, atServings: number) => void;
}) {
  const MONO = 'var(--font-mono)';
  const MUT  = 'var(--muted)';
  const B    = '1px solid var(--border)';
  const tbl: React.CSSProperties   = { borderCollapse: 'collapse', border: B, width: '100%', fontSize: 12 };
  const thead: React.CSSProperties = { background: 'var(--surface-hover)' };
  const td: React.CSSProperties    = { padding: '8px 14px', color: 'var(--fg)', verticalAlign: 'middle' };

  const [apiResult, setApiResult] = React.useState<any>(null);
  const [loading,   setLoading]   = React.useState(false);

  React.useEffect(() => {
    if (!versionId) return;
    setLoading(true);
    fetch(`/api/recipes/${versionId}/nutrition`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setApiResult(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [versionId]);

  const fallback = calculateRecipeNutrition(
    ingredients.map(ing => ({
      name:               ing.name,
      quantityValue:      ing.quantity.value,
      quantityUnit:       ing.quantity.unit,
      category:           (ing as any).category,
      densityGPerMl:      (ing as any).densityGPerMl,
      typicalUnitWeightG: (ing as any).typicalUnitWeightG,
      nutritionPer100g:   (ing as any).nutritionPer100g,
    })),
    servings
  );

  const result = apiResult ?? fallback;
  const phase  = apiResult?.phase ?? 'pre-cooking';
  const n      = result?.perServing ?? {};

  // Report the per-serving figures up so the assistant context can use the
  // SAME numbers the user sees (keyed by servings so re-scaling stays in sync).
  const reportedRef = React.useRef<string>('');
  React.useEffect(() => {
    if (!onComputed) return;
    const key = JSON.stringify({ n, servings });
    if (key === reportedRef.current) return;
    reportedRef.current = key;
    if ((n?.calories ?? 0) > 0) onComputed(n, servings);
  }, [n, servings, onComputed]);

  const hasCalc   = result?.confidence !== 'insufficient' && (n?.calories ?? 0) > 0;
  const hasStored = storedNutrition?.calories;
  if (!hasCalc && !hasStored) return null;

  const rows: [string, number | undefined, string][] = [
    ['Calories',      n?.calories,      'kcal'],
    ['Protein',       n?.protein,       'g'],
    ['Fat',           n?.fat,           'g'],
    ['  Saturated',   n?.saturated_fat, 'g'],
    ['Carbohydrates', n?.carbohydrates, 'g'],
    ['  Sugar',       n?.sugar,         'g'],
    ['  Fiber',       n?.fiber,         'g'],
    ['Sodium',        n?.sodium,        'mg'],
    ['Potassium',     n?.potassium,     'mg'],
    ['Vitamin C',     n?.vitamin_c,     'mg'],
    ['Iron',          n?.iron,          'mg'],
    ['Calcium',       n?.calcium,       'mg'],
  ];

  const phaseLabel = loading ? 'calculating…'
    : phase === 'post-cooking'
    ? `Estimated · post-cooking · ${result.coveredPct}% ingredients covered`
    : `Estimated · pre-cooking · ${result.coveredPct}% ingredients covered`;

  const confidenceColor = loading ? MUT
    : phase === 'post-cooking'    ? 'var(--accent)'
    : result?.confidence === 'partial' ? '#b45309'
    : MUT;

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', color: MUT }}>Nutrition</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span style={{ fontFamily: MONO, fontSize: 9, color: MUT }}>per serving</span>
      </div>
      <div style={{
        marginBottom: 8, padding: '4px 10px',
        background: 'var(--surface-hover)', border: B,
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ fontFamily: MONO, fontSize: 9, color: confidenceColor }}>
          {phaseLabel}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table style={{ ...tbl, minWidth: 260 }}>
          <thead>
            <tr style={thead}>
              <th style={{ padding: '8px 14px', fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: MUT, textAlign: 'left', borderRight: B }}>Nutrient</th>
              <th style={{ padding: '8px 14px', fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: MUT, textAlign: 'right' }}>Per serving</th>
            </tr>
          </thead>
          <tbody>
            {rows.filter(([, v]) => v != null && (v as number) > 0).map(([label, value, unit]) => (
              <tr key={label} style={{ borderTop: B }}>
                <td style={{ ...td, borderRight: B, paddingLeft: label.startsWith('  ') ? 28 : 14, color: label.startsWith('  ') ? MUT : 'var(--fg)' }}>
                  {label.trim()}
                </td>
                <td style={{ ...td, textAlign: 'right', fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>
                  {typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : value}<span style={{ color: MUT, marginLeft: 3 }}>{unit}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}


function RecipeView({ recipe, canonicalId, concepts, isAuthor }: { recipe: Recipe; canonicalId?: string | null; concepts?: { memberId: string; conceptId: string; name: string }[]; isAuthor?: boolean }) {
  const ingChecks  = useChecklist(recipe.ingredients.length);
  const stepChecks = useChecklist(recipe.steps.length);
  const toolChecks = useChecklist(recipe.equipment?.length ?? 0);
  const [servings, setServings] = useState(recipe.servings);
  const [addedIngs, setAddedIngs] = useState<Record<string, boolean>>({});
  const toggleAddedIng = (key: string) => setAddedIngs(p => ({ ...p, [key]: !p[key] }));
  const changeServings = (delta: number) => setServings((prev: number) => Math.max(1, prev + delta));

  // Live per-serving nutrition reported up from RecipeNutritionSection (the same
  // figures shown on the page). Falls back to stored nutrition if present.
  const [liveNutrition, setLiveNutrition] = useState<{ perServing: any; atServings: number } | null>(null);

  // Publish rich page context to the global assistant, so it can answer
  // questions about THIS recipe (nutrition, ingredients, steps) — including
  // per-portion maths based on the currently selected servings.
  const baseServings = recipe.servings || 1;
  const nut: any = liveNutrition?.perServing ?? recipe.nutrition ?? {};
  const nutServings = liveNutrition?.atServings ?? baseServings;
  useAssistantContext({
    entityType: 'recipe',
    entityName: recipe.title,
    summary: recipe.description,
    facts: {
      cuisine: recipe.cuisine,
      difficulty: recipe.difficulty,
      baseServings,
      currentServings: servings,
      ingredients: recipe.ingredients.map((i: any) =>
        [i.name, i.quantity?.value, i.quantity?.unit].filter(Boolean).join(' ').trim()
      ),
      steps: recipe.steps.map((s: any, i: number) => `${i + 1}. ${s.instruction ?? ''}`.trim()).slice(0, 30),
      nutrition: (nut.calories || nut.protein || nut.carbohydrates) ? {
        note: `These nutrition values are PER SERVING, calculated at ${nutServings} servings. The user currently has servings set to ${servings}. Scale per-portion figures accordingly if they differ.`,
        calories: nut.calories, protein: nut.protein,
        carbohydrates: nut.carbohydrates, fat: nut.fat,
        saturatedFat: nut.saturated_fat, fiber: nut.fiber,
        sugar: nut.sugar, sodium: nut.sodium,
      } : undefined,
    },
  });


  // Presentation (ingredients/tools/steps) lives in the shared <RecipeDisplay>.
  // The shell keeps only what it needs for the meta grid + sidebar.
  const timing = calculateRecipeTiming(recipe.steps);
  const displayTotalSeconds = recipe.totalTimeSeconds > 0
    ? recipe.totalTimeSeconds
    : timing.totalSeconds;

  const B    = '1px solid var(--border)';
  const MONO = 'var(--font-mono)';
  const MUT  = 'var(--muted)';

  const cap = (s: string | null | undefined) => {
    const t = (s ?? '').trim();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : '—';
  };
  const metaItems: [string, string][] = [
    ['YIELD',       `${servings.toLocaleString()} servings`],
    ['TOTAL TIME',  displayTotalSeconds > 0 ? formatDuration(displayTotalSeconds) : '—'],
    ['ACTIVE TIME', recipe.activeTimeSeconds ? formatDuration(recipe.activeTimeSeconds) : '—'],
    ['DIFFICULTY',  cap(recipe.difficulty)],
    ['RATING',      recipe.ratings ? `${(recipe.ratings as any).average.toFixed(1)} / 5` : '—'],
    ['CUISINE',     cap(recipe.cuisine)],
  ];


  return (
    <>
    <div className="flex h-full screen-only">
      <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">

        {/* Title + meta — intro region matches the ingredient page:
            title + "also known as" + description on the left, hero floated
            top-right. Meta stats sit BELOW the intro, not between title and
            description. */}
        <div className="px-4 md:px-8 pt-6 pb-5 border-b border-[var(--border)]">

          {/* Intro region: lead left, hero right (when present) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: recipe.heroImageUrl ? 'minmax(0,1fr) 184px' : '1fr',
              gap: 24,
              alignItems: 'start',
            }}>
            <div>
              <div className="flex items-start justify-between gap-4 mb-2">
                <h1 className="font-display text-[24px] md:text-[28px] font-normal leading-tight text-[var(--fg)]">
                  {recipe.title}
                </h1>
                <span className="flex items-center gap-3 flex-shrink-0 no-print">
                  <PrintButton title={recipe.title} />
                  <BookmarkButton canonicalId={canonicalId ?? recipe.id} />
                  <RespecialiseButton canonicalId={canonicalId ?? recipe.id} isAuthor={!!isAuthor} />
                </span>
              </div>

              {(concepts?.length ?? 0) > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap mb-3">
                  <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">Also known as</span>
                  {concepts!.map(c => (
                    <span key={c.memberId} className="text-[12px] text-[var(--fg-secondary)] border border-[var(--border)] px-2 py-0.5 bg-[var(--surface)]">{c.name}</span>
                  ))}
                </div>
              )}

              {recipe.description && (
                <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--fg-secondary)', margin: 0 }}>
                  {recipe.description}
                </p>
              )}
            </div>

            {/* Hero — same treatment as the ingredient page (square, surface bg) */}
            {recipe.heroImageUrl && (
              <div style={{ position: 'relative', width: '100%', aspectRatio: '1/1',
                overflow: 'hidden', border: B, background: 'var(--surface-hover)' }}>
                <img src={recipe.heroImageUrl} alt={recipe.title}
                  style={{ width: '100%', height: '100%', objectFit: 'cover',
                    objectPosition: 'center', display: 'block' }} />
              </div>
            )}
          </div>

          {/* Meta stats — below the intro */}
          <div className="hidden md:grid border border-[var(--border)] text-[11px] mt-5"
            style={{ gridTemplateColumns: `repeat(${metaItems.length}, minmax(0, 1fr))` }}>
            {metaItems.map(([label, value], i) => (
              <div key={label} className={i < metaItems.length - 1 ? 'border-r border-[var(--border)]' : ''}>
                <div className="px-3 py-1.5 bg-[var(--surface-hover)] border-b border-[var(--border)]">
                  <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--muted)]">{label}</span>
                </div>
                <div className="px-3 py-2 font-mono text-[11px] text-[var(--fg)]">{value}</div>
              </div>
            ))}
          </div>
          <div className="md:hidden border border-[var(--border)] mt-5"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '1px', background: 'var(--border)' }}>
            {metaItems.map(([label, value]) => (
              <div key={label} style={{ background: 'var(--surface)', padding: '8px 12px' }}>
                <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.15em', color: MUT, marginBottom: 3 }}>{label}</div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--fg)', fontWeight: 500 }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Inline controls: servings + progress (desktop). Replaces the old
            right-hand panel now that the assistant owns the right rail. */}
        <div className="hidden md:flex items-center gap-6 px-8 py-3 border-b border-[var(--border)] no-print">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--muted)]">Servings</span>
            <div className="flex items-center border border-[var(--border)]">
              <button onClick={() => changeServings(-1)} className="w-7 h-7 font-mono text-[var(--muted)] hover:text-[var(--fg)] border-r border-[var(--border)] flex items-center justify-center hover:bg-[var(--surface-hover)] transition-colors">−</button>
              <span className="px-3 font-mono tabular-nums text-[13px] text-[var(--fg)]">{servings}</span>
              <button onClick={() => changeServings(+1)} className="w-7 h-7 font-mono text-[var(--muted)] hover:text-[var(--fg)] border-l border-[var(--border)] flex items-center justify-center hover:bg-[var(--surface-hover)] transition-colors">+</button>
            </div>
          </div>
          <div className="flex-1 flex items-center gap-5 min-w-0">
            <div className="flex-1 min-w-0"><ProgressBar label="Ingredients" done={ingChecks.checked.filter(Boolean).length} total={recipe.ingredients.length} /></div>
            {(recipe.equipment?.length ?? 0) > 0 && (
              <div className="flex-1 min-w-0"><ProgressBar label="Tools" done={toolChecks.checked.filter(Boolean).length} total={recipe.equipment?.length ?? 0} /></div>
            )}
            <div className="flex-1 min-w-0"><ProgressBar label="Steps" done={stepChecks.checked.filter(Boolean).length} total={recipe.steps.length} /></div>
          </div>
        </div>

        <RecipeDisplay
          recipe={recipe}
          linkIngredients
          showHero={false}
          interactive={{ ingChecks, stepChecks, servings }}
        />

        <div className="px-4 md:px-8 pb-6">

          {/* Nutrition */}
          <RecipeNutritionSection
            versionId={(recipe as any).recipeVersionId}
            ingredients={recipe.ingredients}
            servings={servings}
            storedNutrition={recipe.nutrition}
            onComputed={(perServing, atServings) => setLiveNutrition({ perServing, atServings })}
          />

          <div className="md:hidden h-16" />
        </div>
      </div>

      {/* (Old right panel removed — servings/progress are now inline, and the
          assistant occupies the right rail globally. Recipe info was a
          duplicate of the meta grid.) */}

      {/* Mobile sticky bar */}
      <div className="md:hidden fixed bottom-[56px] left-0 right-0 z-10 bg-[var(--surface)] border-t border-[var(--border)] px-4 py-2 flex items-center gap-4 no-print">
        <div className="flex-1 min-w-0"><ProgressBar label="Ingredients" done={ingChecks.checked.filter(Boolean).length} total={recipe.ingredients.length} /></div>
        <div className="flex-1 min-w-0"><ProgressBar label="Tools" done={toolChecks.checked.filter(Boolean).length} total={recipe.equipment?.length ?? 0} /></div>
        <div className="flex-1 min-w-0"><ProgressBar label="Steps" done={stepChecks.checked.filter(Boolean).length} total={recipe.steps.length} /></div>
        <div className="flex items-center border border-[var(--border)] flex-shrink-0">
          <button onClick={() => changeServings(-1)} className="w-7 h-7 font-mono text-[var(--muted)] border-r border-[var(--border)] flex items-center justify-center hover:bg-[var(--surface-hover)] transition-colors text-[13px]">−</button>
          <span className="px-2 font-mono tabular-nums text-[12px]">
            {servings}
          </span>
          <button onClick={() => changeServings(+1)} className="w-7 h-7 font-mono text-[var(--muted)] border-l border-[var(--border)] flex items-center justify-center hover:bg-[var(--surface-hover)] transition-colors text-[13px]">+</button>
        </div>
      </div>
    </div>

    {/* Dedicated cookbook print layout (renders only when printing). */}
    <RecipePrintLayout recipe={recipe} url={typeof window !== 'undefined' ? window.location.href : undefined} />
    </>
  );
}

export default function RecipePage({ params }: { params: Promise<{ slug: string }> }) {
  return <RecipePageClient params={params} />;
}

function RecipePageClient({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [recipe, setRecipe]   = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [isDraft,    setIsDraft]    = useState(false);
  const [isAuthor,   setIsAuthor]   = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [canonicalId, setCanonicalId] = useState<string | null>(null);
  const [concepts, setConcepts] = useState<{ memberId: string; conceptId: string; name: string }[]>([]);

  React.useEffect(() => {
    async function load() {
      setLoading(true); setError(null);

      // Get current user once — used in both query attempts
      const { createClient: createClientForUser } = await import('@/lib/supabase/client');
      const supabaseForUser = createClientForUser() as any;
      const { data: { user } } = await supabaseForUser.auth.getUser();

      try {
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient() as any;

        const { data, error: dbError } = await supabase
          .from('recipes')
          .select(`
            *,
            recipe_versions (
              id, title, description, cuisine, tags, base_servings,
              difficulty, total_time_seconds, active_time_seconds, hero_image_url,
              version_ingredients (
                id, order_index, quantity_value, quantity_unit,
                food_state, prep_note, optional, step_id,
                ingredients!ingredient_id ( id, slug, name, category,
                  nutrition_per_100g, density_g_per_ml, typical_unit_weight_g,
                  retention_category_id )
              ),
              version_steps (
                id, order_index, step_type, group_label, instruction, notes,
                duration_seconds, temperature_celsius, appliance_settings, task_id,
                tasks ( name, display_template, single_tool )
              ),
              version_equipment (
                id, required,
                equipment ( id, slug, name )
              )
            )
          `)
          .eq('slug', slug)
          .single();

        if (!dbError && data) {
          // If draft, only show to author
          if (!data.is_published) {
            if (!user || data.author_id !== user.id) {
              setError('Recipe not found.');
              setLoading(false);
              return;
            }
            setIsDraft(true);
          }
          if (user && data.author_id === user.id) {
            setIsAuthor(true);
          }
          // Look up the canonical ID via slug — needed for publish/unpublish AND
          // for the bookmark/save button (so it saves under the true canonical,
          // not the recipes-mirror row id). Done for all viewers, not just author.
          {
            const { data: can } = await supabase
              .from('recipe_canonicals')
              .select('id')
              .eq('slug', data.slug)
              .single();
            setCanonicalId(can?.id ?? data.id);
          }
          setRecipe(await attachIntermediates(supabase, mapNewSchemaRecipe(data)));
          setLoading(false);
          return;
        }
      } catch (err) {
        console.error('[RecipePage primary]', err);
      }

      // Second attempt: query recipe_canonicals directly
      try {
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient() as any;

        const { data: canonical, error: canonErr } = await supabase
          .from('recipe_canonicals')
          .select('id, slug, created_at, updated_at, current_version_id, is_published, author_id')
          .eq('slug', slug)
          .single();

        if (!canonErr && canonical?.current_version_id) {
          // Draft check
          if (!canonical.is_published) {
            if (!user || canonical.author_id !== user.id) {
              setError('Recipe not found.');
              setLoading(false);
              return;
            }
            setIsDraft(true);
          }
          if (user && canonical.author_id === user.id) {
            setIsAuthor(true);
            setCanonicalId(canonical.id);
          }
          const { data: version, error: verErr } = await supabase
            .from('recipe_versions')
            .select(`
              id, title, description, cuisine, tags, base_servings,
              difficulty, total_time_seconds, active_time_seconds, hero_image_url,
              version_ingredients (
                id, order_index, quantity_value, quantity_unit,
                food_state, prep_note, optional, step_id,
                ingredients!ingredient_id ( id, slug, name, category,
                  nutrition_per_100g, density_g_per_ml, typical_unit_weight_g,
                  retention_category_id )
              ),
              version_steps (
                id, order_index, step_type, group_label, instruction, notes,
                duration_seconds, temperature_celsius, appliance_settings, task_id,
                tasks ( name, display_template, single_tool )
              ),
              version_equipment (
                id, required,
                equipment ( id, slug, name )
              )
            `)
            .eq('id', canonical.current_version_id)
            .single();

          if (!verErr && version) {
            const shaped = {
              ...canonical,
              version: 1,
              recipe_versions: version,
            };
            setRecipe(await attachIntermediates(supabase, mapNewSchemaRecipe(shaped)));
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        console.error('[RecipePage canonical]', err);
      }

      // Fallback: sample data
      const { sampleRecipes } = await import('@/data/sample-recipes');
      const r = sampleRecipes.find(r => r.slug === slug) ?? null;
      if (!r) setError('Recipe not found.');
      setRecipe(r);
      setLoading(false);
    }
    load();
  }, [slug]);

  // Load concept names (global "also known as") once we know the canonical id.
  React.useEffect(() => {
    if (!canonicalId) return;
    fetch(`/api/admin/concepts?entityType=recipe&entityId=${encodeURIComponent(canonicalId)}`)
      .then(r => r.ok ? r.json() : { concepts: [] })
      .then(d => setConcepts(Array.isArray(d.concepts) ? d.concepts : []))
      .catch(() => {});
  }, [canonicalId]);

  const handlePublish = async () => {
    if (!canonicalId) return;
    setPublishing(true);
    try {
      const res = await fetch(`/api/my/recipes/${canonicalId}/publish`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publish: true }),
      });
      if (res.ok) {
        sessionStorage.setItem('soupdog_published', recipe?.title ?? 'Recipe');
        window.location.href = '/my/recipes';
      }
    } finally {
      setPublishing(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <span className="font-mono text-[11px] text-[var(--muted)] uppercase tracking-widest">Loading…</span>
    </div>
  );
  if (error || !recipe) return (
    <div className="p-8 font-mono text-[12px] text-[var(--muted)]">{error ?? 'Recipe not found.'}</div>
  );
  return (
    <>
      {isDraft && isAuthor && (
        <div style={{
          background: '#fef3c7', borderBottom: '1px solid #f59e0b',
          padding: '10px 24px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 16,
        }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#92400e' }}>
            This recipe is saved as a draft — only you can see it.
          </span>
          <button
            onClick={handlePublish}
            disabled={publishing}
            style={{
              padding: '6px 16px', border: 'none', background: '#92400e',
              color: '#fff', fontFamily: 'var(--font-mono)', fontSize: 11,
              cursor: publishing ? 'not-allowed' : 'pointer',
              opacity: publishing ? 0.7 : 1, flexShrink: 0,
            }}>
            {publishing ? 'Publishing…' : 'Publish recipe'}
          </button>
        </div>
      )}
      <RecipeView recipe={recipe} canonicalId={canonicalId} concepts={concepts} isAuthor={isAuthor} />
    </>
  );
}

// ── Helper components ─────────────────────────────────────────




function ProgressBar({ label, done, total }: { label: string; done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--muted)]">{label}</span>
        <span className="font-mono text-[10px] text-[var(--muted)]">{done}/{total}</span>
      </div>
      <div className="h-1 bg-[var(--border)] w-full">
        <div className="h-1 bg-[var(--accent)] transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
