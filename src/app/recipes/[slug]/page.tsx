// src/app/recipes/[slug]/page.tsx
'use client';
import React, { useState, useEffect, use } from 'react';
import { formatDuration } from '@/lib/utils';
import { calculateRecipeTiming } from '@/lib/recipe-timing';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import { PrintButton } from '@/components/recipe/PrintRecipe';
import { RecipePrintLayout } from '@/components/recipe/RecipePrintLayout';
import type { RecipeStep, RecipeIngredientRef, Recipe, SubRecipeRef } from '@/types';
import { calculateRecipeNutrition, type IngredientNutrition } from '@/lib/recipe-nutrition';
import { RecipeDisplay } from '@/components/recipe/RecipeDisplay';
import { useAssistantContext } from '@/components/assistant/AssistantProvider';
import { NutrientDetailModal } from '@/components/recipe/NutrientDetailModal';
import RecipePeoplePanel from '@/components/recipe/RecipePeoplePanel';
import { RecipePeopleProvider, useRecipePeople } from '@/components/recipe/RecipePeopleContext';

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
      className="no-print"
      style={{
        fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        border: `1px solid ${saved ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 6, padding: '5px 12px', cursor: 'pointer',
        background: saved ? 'var(--accent-subtle)' : 'none',
        color: saved ? 'var(--accent)' : 'var(--muted)',
        flexShrink: 0, transition: 'all 0.15s', opacity: loading ? 0.6 : 1,
      }}
      title={saved ? 'Remove from saved' : 'Save recipe'}
    >
      {saved
        ? <><BookmarkCheck size={12} strokeWidth={1.5} /> Saved</>
        : <><Bookmark size={12} strokeWidth={1.5} /> Save</>
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
      taskCategory: (Array.isArray(s.tasks) ? s.tasks[0]?.category : s.tasks?.category) ?? undefined,
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
    servedItems:        Array.isArray(rv?.served_items) ? rv.served_items : undefined,
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

// Multi-dish meals: load the LINKED sub-recipes (version_sub_recipes) and, for those
// flagged expand_by_default, their child steps — so the meal page can render each
// reused dish as an attributed, expandable section (hybrid display). Mirrors
// attachIntermediates: a flat post-map augmentation that leaves the main query alone.
// Linked dishes are SEALED blocks (a reused recipe slotted in) — their tasks are NOT
// merged into the meal's unified DAG (only inline dishes are merged, by the engine).
async function attachLinkedDishes(supabase: any, recipe: Recipe): Promise<Recipe> {
  const versionId = recipe.recipeVersionId;
  if (!versionId) return recipe;

  const { data: links, error } = await supabase
    .from('version_sub_recipes')
    .select('child_canonical_id, child_version_id, used_as_ingredient_label, expand_by_default, optional')
    .eq('parent_version_id', versionId);

  if (error || !Array.isArray(links) || links.length === 0) return recipe;

  const subRecipes: SubRecipeRef[] = [];
  for (const ln of links) {
    // resolve the child canonical (slug + title) — title comes from its current version
    const { data: canon } = await supabase
      .from('recipe_canonicals')
      .select('id, slug, current_version_id')
      .eq('id', ln.child_canonical_id)
      .maybeSingle();
    if (!canon) continue;

    const childVersionId = ln.child_version_id ?? canon.current_version_id;
    let title = ln.used_as_ingredient_label ?? canon.slug;
    let childSteps: RecipeStep[] | undefined;

    if (childVersionId) {
      // title + steps + ingredients from the child version
      const { data: cv } = await supabase
        .from('recipe_versions')
        .select('title, version_ingredients ( quantity_value, quantity_unit, step_id, ingredients!ingredient_id ( name ) ), version_steps ( id, order_index, step_type, group_label, instruction, notes, duration_seconds, temperature_celsius, appliance_settings, task_id, tasks ( name, display_template, single_tool, category ) )')
        .eq('id', childVersionId)
        .maybeSingle();
      if (cv?.title) title = ln.used_as_ingredient_label ?? cv.title;

      // expand the child's steps inline only when flagged
      if (ln.expand_by_default && Array.isArray(cv?.version_steps)) {
        // map child step_id → first introduced ingredient name (mirrors the host
        // display's stepIngMap, which the linked dish doesn't have access to)
        const ingByStep = new Map<string, string>();
        for (const vi of (cv.version_ingredients ?? [])) {
          const sid = vi.step_id; if (!sid || ingByStep.has(sid)) continue;
          const nm = Array.isArray(vi.ingredients) ? vi.ingredients[0]?.name : vi.ingredients?.name;
          if (nm) ingByStep.set(sid, nm);
        }
        childSteps = cv.version_steps
          .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))
          .map((s: any) => ({
            id: s.id, order: s.order_index, type: s.step_type,
            group: s.group_label ?? undefined, instruction: s.instruction,
            notes: s.notes ?? undefined,
            durationSeconds: s.duration_seconds ?? undefined,
            temperature: s.temperature_celsius ? { value: s.temperature_celsius, unit: 'celsius' as const } : undefined,
            taskName: (Array.isArray(s.tasks) ? s.tasks[0]?.name : s.tasks?.name) ?? undefined,
            taskTemplate: (Array.isArray(s.tasks) ? s.tasks[0]?.display_template : s.tasks?.display_template) ?? undefined,
            taskSingleTool: (Array.isArray(s.tasks) ? s.tasks[0]?.single_tool : s.tasks?.single_tool) ?? false,
            taskCategory: (Array.isArray(s.tasks) ? s.tasks[0]?.category : s.tasks?.category) ?? undefined,
            firstIngredientName: ingByStep.get(s.id) ?? undefined,
          }));
      }
    }

    subRecipes.push({
      recipeId:        canon.id,
      recipeSlug:      canon.slug,
      title,
      usedAsIngredient: ln.used_as_ingredient_label ?? undefined,
      optional:        ln.optional ?? false,
      expandByDefault: ln.expand_by_default ?? false,
      steps:           childSteps,
    });
  }

  return subRecipes.length ? { ...recipe, subRecipes } : recipe;
}

// ── Recipe nutrition section ──────────────────────────────────
// Same palette + monogram as the <Participants> component, so the nutrition
// selector discs match the "Who's eating" avatars exactly.
const AV_PALETTE: Record<string, string> = {
  olive: '#5a6b52', sage: '#7d8c6a', clay: '#a8634a', slate: '#5c6b72',
  plum: '#6d5168', teal: '#3f6b63', ochre: '#9c7a3c', rose: '#9c5f6b',
};
function avatarDisc(id: string, colorKey: string | null, initials: string | null, name: string) {
  let bg: string;
  if (colorKey && AV_PALETTE[colorKey]) bg = AV_PALETTE[colorKey];
  else {
    let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
    const keys = Object.keys(AV_PALETTE);
    bg = AV_PALETTE[keys[Math.abs(h) % keys.length]];
  }
  let mono: string;
  const o = initials?.trim();
  if (o) mono = o.slice(0, 3).toUpperCase();
  else {
    const parts = (name ?? '').trim().split(/\s+/);
    mono = ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
  }
  return { bg, mono };
}

// Reads the shared people list (inside RecipePeopleProvider) and passes real
// people's names to the print layout for the "For …" line. Filters the persona.
const PERSONA_ADULT_ID = '00000000-0000-0000-0000-0000000000a1';
function PrintLayoutWithPeople({ recipe, url }: { recipe: Recipe; url?: string }) {
  const rp = useRecipePeople();
  const names = (rp?.people ?? [])
    .filter((p: any) => p.personId !== PERSONA_ADULT_ID)
    .map((p: any) => p.name)
    .filter(Boolean);
  return <RecipePrintLayout recipe={recipe} url={url} peopleNames={names} />;
}

// ── End-of-recipe serving instruction ────────────────────────────────────────
// The EXECUTION moment: after the steps, before nutrition (cooking flow is
// primary; nutrition is reference). The people section up top is the PLANNING
// moment ("who am I cooking for"); this is "now serve it this way". Reads the
// shared people match (plating split) — shown only when ≥2 eaters with DIFFERING
// shares, so there's an actual division to instruct. One dish for now (the
// dish×eater matrix arrives with composition).
function ServingBlock() {
  const rp = useRecipePeople();
  const plating = rp?.match?.plating ?? [];
  if (plating.length < 2) return null;                          // 0–1 eaters: nothing to divide
  const shares = plating.map(p => p.share);
  const allEqual = shares.every(s => Math.abs(s - shares[0]) < 0.001);
  if (allEqual) return null;                                    // equal portions: no instruction needed
  const sorted = plating.slice().sort((a, b) => b.share - a.share);

  return (
    <div className="px-4 md:px-8 pt-2 pb-6">
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '18px 20px', background: 'var(--surface)' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--muted)', marginBottom: 10 }}>
          Serving
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sorted.map(p => (
            <li key={p.personId} style={{ fontFamily: 'var(--font-serif, var(--font-display))', fontSize: 14, color: 'var(--fg)', lineHeight: 1.5 }}>
              <span style={{ fontWeight: 500 }}>{p.name}</span>
              <span style={{ color: 'var(--muted)' }}> — {p.phrase}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

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
  const [activeCat, setActiveCat] = React.useState<string | null>(null); // null = headline only
  const [modalNutrient, setModalNutrient] = React.useState<{ key: string; amount: number } | null>(null);

  // Per-person view: the shared people + match come from RecipePeopleProvider
  // (same source as the Cook-for panel — they never drift). One person shown at
  // a time; switching re-scales the whole section to that person's portion.
  const rp = useRecipePeople();
  const match = rp?.match ?? null;
  const rpPeople = rp?.people ?? [];
  const [activePerson, setActivePerson] = React.useState<string | null>(null);
  React.useEffect(() => {
    const first = match?.perParticipant?.[0]?.personId ?? null;
    setActivePerson(prev => {
      // keep current selection if still present, else default to first
      if (prev && match?.perParticipant?.some((p: any) => p.personId === prev)) return prev;
      return first;
    });
  }, [match]);

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

  // Per-person scaling: the active participant's portion = their plating share
  // × recommendedServings of the dish. We scale the per-serving figures by that
  // factor so the whole section reflects that person's plate. factor falls back
  // to 1 (per-serving) if no match/person. Also pull their daily targets for the
  // "% of day" badges on the headline macros.
  const activeP = match?.perParticipant?.find((p: any) => p.personId === activePerson) ?? null;
  const personFactor = activeP ? (activeP.share * (match?.recommendedServings || 0)) : 1;
  const dailyTargets: Record<string, number | null> = activeP?.dailyTargets ?? {};
  const TARGET_KEY: Record<string, string> = { calories: 'calories', protein: 'protein', fat: 'fat', carbohydrates: 'carbohydrates', fiber: 'fiber' };
  // displayN = per-serving × factor (or unscaled per-serving when no person).
  const displayN: Record<string, number> = {};
  for (const [k, v] of Object.entries(n)) {
    if (typeof v === 'number') displayN[k] = v * personFactor;
  }
  const perPersonMode = !!activeP;

  const hasCalc   = result?.confidence !== 'insufficient' && (n?.calories ?? 0) > 0;
  const hasStored = storedNutrition?.calories;
  if (!hasCalc && !hasStored) return null;

  // Nutrient metadata (from the API) lets us group/label/order the full set.
  const meta: { key: string; name: string; category: string; unit: string; display_order: number }[] =
    apiResult?.nutrientMeta ?? [];
  const metaByKey = Object.fromEntries(meta.map(m => [m.key, m]));

  // Roll fatty-acid isomers up into Omega-6 / Omega-3 (USDA stores isomers, not
  // the sums). n-6 = linoleic (18:2) + arachidonic (20:4) etc; n-3 = ALA (18:3)
  // + EPA (20:5) + DHA (22:6) etc. We detect by key/name containing the marker.
  const omega6 = sumIsomers(displayN, metaByKey, ['n-6', '18:2', '20:4', 'linoleic', 'arachidonic']);
  const omega3 = sumIsomers(displayN, metaByKey, ['n-3', '18:3', '20:5', '22:6', 'linolenic', 'epa', 'dha']);

  // The HEADLINE nutrients shown by default (familiar label order).
  const HEADLINE: [string, string, string][] = [
    ['calories', 'Calories', 'kcal'],
    ['protein', 'Protein', 'g'],
    ['fat', 'Fat', 'g'],
    ['saturated_fat', '  Saturated', 'g'],
    ['carbohydrates', 'Carbohydrates', 'g'],
    ['sugar', '  Sugar', 'g'],
    ['fiber', '  Fiber', 'g'],
    ['sodium', 'Sodium', 'mg'],
  ];
  const headlineRows = HEADLINE
    .map(([k, label, unit]) => [label, displayN?.[k], unit, k] as [string, number | undefined, string, string])
    .filter(([, v]) => v != null && (v as number) > 0);

  // The FULL set, grouped by category (everything not in headline), for the expander.
  const HEADLINE_KEYS = new Set(HEADLINE.map(h => h[0]));
  const CATEGORY_ORDER = ['macro', 'vitamin', 'mineral', 'fatty_acid', 'other'];
  const CATEGORY_LABEL: Record<string, string> = {
    macro: 'Macronutrients', vitamin: 'Vitamins', mineral: 'Minerals',
    fatty_acid: 'Fats & fatty acids', other: 'Other',
  };
  const grouped: Record<string, [string, number, string, string][]> = {};
  for (const [key, val] of Object.entries(displayN)) {
    if (typeof val !== 'number' || val <= 0) continue;
    if (HEADLINE_KEYS.has(key)) continue;
    const m = metaByKey[key];
    const cat = m?.category ?? 'other';
    (grouped[cat] ??= []).push([m?.name ?? key, val, m?.unit ?? 'g', m?.key ?? key]);
  }
  // Inject the rolled-up omegas at the top of the fatty-acid group.
  if (omega6 > 0 || omega3 > 0) {
    grouped['fatty_acid'] = [
      ...(omega6 > 0 ? [['Omega-6 (total)', omega6, 'g', ''] as [string, number, string, string]] : []),
      ...(omega3 > 0 ? [['Omega-3 (total)', omega3, 'g', ''] as [string, number, string, string]] : []),
      ...(grouped['fatty_acid'] ?? []),
    ];
  }
  const fullCount = Object.values(grouped).reduce((a, g) => a + g.length, 0);

  const phaseLabel = loading ? 'calculating…'
    : phase === 'post-cooking'
    ? `Estimated · post-cooking · ${result.coveredPct}% ingredients covered`
    : `Estimated · pre-cooking · ${result.coveredPct}% ingredients covered`;

  const confidenceColor = loading ? MUT
    : phase === 'post-cooking'    ? 'var(--accent)'
    : result?.confidence === 'partial' ? '#b45309'
    : MUT;

  const numCell = (value: number, unit: string) => {
    // Precision should match the estimate's confidence — 2 decimals on
    // averaged USDA data reads as false precision. kcal/mg/µg → whole numbers;
    // grams → whole, but 1 decimal below 1 g where it carries real meaning.
    const u = (unit || '').toLowerCase();
    let display: string;
    if (u === 'kcal' || u === 'mg' || u === 'µg' || u === 'mcg' || u === 'iu') {
      display = Math.round(value).toLocaleString();
    } else if (u === 'g') {
      display = value < 1
        ? value.toLocaleString(undefined, { maximumFractionDigits: 1 })
        : Math.round(value).toLocaleString();
    } else {
      display = value.toLocaleString(undefined, { maximumFractionDigits: 1 });
    }
    return (
      <span style={{ fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>
        {display}
        <span style={{ color: MUT, marginLeft: 3 }}>{unit}</span>
      </span>
    );
  };

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', color: MUT }}>Nutrition</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span style={{ fontFamily: MONO, fontSize: 9, color: MUT }}>{perPersonMode ? `${match?.perParticipant?.find((p:any)=>p.personId===activePerson)?.name ?? 'per serving'}’s portion` : 'per serving'}</span>
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

      {/* Person selector — disc-only avatars (consistent with the Cook-for
          panel); one active at a time, switching re-scales to their portion. */}
      {(match?.perParticipant?.length ?? 0) > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, alignItems: 'center' }}>
          {match?.perParticipant?.map((p: any) => {
            const on = activePerson === p.personId;
            const rpp = rpPeople.find((x: any) => x.personId === p.personId);
            const disc = avatarDisc(p.personId, rpp?.avatarColor ?? null, rpp?.avatarInitials ?? null, p.name);
            return (
              <button key={p.personId} onClick={() => setActivePerson(p.personId)} title={p.name}
                aria-label={p.name} aria-pressed={on}
                style={{
                  width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', padding: 0,
                  background: disc.bg, color: '#fff',
                  fontFamily: MONO, fontSize: 11,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: on ? '2px solid var(--fg)' : '2px solid transparent',
                  outline: on ? '2px solid var(--bg)' : 'none', outlineOffset: on ? '-4px' : 0,
                  opacity: on ? 1 : 0.55, transition: 'opacity 0.12s ease, border 0.12s ease',
                }}>
                {disc.mono}
              </button>
            );
          })}
        </div>
      )}
      <div className="overflow-x-auto">
        <table style={{ ...tbl, minWidth: 260 }}>
          <thead>
            <tr style={thead}>
              <th style={{ padding: '8px 14px', fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: MUT, textAlign: 'left', borderRight: B }}>Nutrient</th>
              <th style={{ padding: '8px 14px', fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: MUT, textAlign: 'right' }}>Per serving</th>
            </tr>
          </thead>
          <tbody>
            {headlineRows.map(([label, value, unit, nkey]) => (
              <tr key={label} style={{ borderTop: B }}>
                <td style={{ ...td, borderRight: B, paddingLeft: label.startsWith('  ') ? 28 : 14, color: label.startsWith('  ') ? MUT : 'var(--fg)' }}>
                  {nkey ? (
                    <button onClick={() => setModalNutrient({ key: nkey, amount: (value as number) })}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit',
                        color: 'inherit', textAlign: 'left', textDecoration: 'underline',
                        textDecorationColor: 'var(--border)', textUnderlineOffset: '2px' }}
                      className="hover:text-[var(--accent)] transition-colors">
                      {label.trim()}
                    </button>
                  ) : label.trim()}
                </td>
                <td style={{ ...td, textAlign: 'right' }}>
                  {numCell(value as number, unit)}
                  {perPersonMode && (() => {
                    const tk = TARGET_KEY[nkey];
                    const tgt = tk ? dailyTargets[tk] : null;
                    if (!tgt || tgt <= 0) return null;
                    const pct = Math.round(((value as number) / tgt) * 100);
                    return <span style={{ fontFamily: MONO, fontSize: 9, color: MUT, marginLeft: 8 }}>{pct}% of day</span>;
                  })()}
                </td>
              </tr>
            ))}

            {activeCat && grouped[activeCat]?.length && (
              <React.Fragment>
                <tr style={{ borderTop: B, background: 'var(--surface-hover)' }}>
                  <td colSpan={2} style={{ ...td, fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.16em', color: MUT }}>
                    {CATEGORY_LABEL[activeCat] ?? activeCat}
                  </td>
                </tr>
                {grouped[activeCat].map(([label, value, unit, nkey]) => (
                  <tr key={activeCat + label} style={{ borderTop: B }}>
                    <td style={{ ...td, borderRight: B }}>
                      {nkey ? (
                        <button onClick={() => setModalNutrient({ key: nkey, amount: value })}
                          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit',
                            color: 'inherit', textAlign: 'left', textDecoration: 'underline',
                            textDecorationColor: 'var(--border)', textUnderlineOffset: '2px' }}
                          className="hover:text-[var(--accent)] transition-colors">
                          {label}
                        </button>
                      ) : label}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>{numCell(value, unit)}</td>
                  </tr>
                ))}
              </React.Fragment>
            )}
          </tbody>
        </table>
      </div>

      {fullCount > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {CATEGORY_ORDER.filter(c => grouped[c]?.length).map(cat => {
            const on = activeCat === cat;
            return (
              <button key={cat}
                onClick={() => setActiveCat(on ? null : cat)}
                style={{
                  fontFamily: MONO, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
                  cursor: 'pointer', padding: '5px 11px', borderRadius: 999,
                  border: on ? '1px solid var(--accent)' : B,
                  background: on ? 'var(--accent)' : 'transparent',
                  color: on ? '#fff' : 'var(--muted)',
                  transition: 'all 0.12s ease',
                }}>
                {CATEGORY_LABEL[cat] ?? cat}
                <span style={{ marginLeft: 6, opacity: 0.7 }}>{grouped[cat].length}</span>
              </button>
            );
          })}
        </div>
      )}

      {modalNutrient && (
        <NutrientDetailModal
          nutrientKey={modalNutrient.key}
          amount={modalNutrient.amount}
          amountLabel={perPersonMode ? 'in this portion' : 'per serving'}
          onClose={() => setModalNutrient(null)}
        />
      )}
    </section>
  );
}

// Sum the fatty-acid isomers whose key or name matches any marker, into a single
// omega total. USDA stores isomers (18:2, 18:3, …); the rolled-up omega-6/-3 are
// the sums of their respective n-6 / n-3 families.
function sumIsomers(
  perServing: Record<string, number | undefined>,
  metaByKey: Record<string, { name: string; category: string }>,
  markers: string[],
): number {
  let total = 0;
  for (const [key, val] of Object.entries(perServing)) {
    if (typeof val !== 'number' || val <= 0) continue;
    const m = metaByKey[key];
    if (m?.category !== 'fatty_acid') continue;
    const hay = `${key} ${m?.name ?? ''}`.toLowerCase();
    if (markers.some(mk => hay.includes(mk))) total += val;
  }
  return Math.round(total * 100) / 100;
}


function RecipeView({ recipe, canonicalId, concepts, isAuthor }: { recipe: Recipe; canonicalId?: string | null; concepts?: { memberId: string; conceptId: string; name: string }[]; isAuthor?: boolean }) {
  const ingChecks  = useChecklist(recipe.ingredients.length);
  const stepChecks = useChecklist(recipe.steps.length);
  const toolChecks = useChecklist(recipe.equipment?.length ?? 0);
  const [servings, setServings] = useState(recipe.servings);
  const [addedIngs, setAddedIngs] = useState<Record<string, boolean>>({});
  const toggleAddedIng = (key: string) => setAddedIngs(p => ({ ...p, [key]: !p[key] }));

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
    ['TOTAL TIME',  displayTotalSeconds > 0 ? formatDuration(displayTotalSeconds) : '—'],
    // Active time left blank until derived from the task graph — the stored AI
    // estimate is unreliable (could be > total). See Time Model design note.
    ['ACTIVE TIME', ''],
    ['DIFFICULTY',  cap(recipe.difficulty)],
    ['RATING',      recipe.ratings ? `${(recipe.ratings as any).average.toFixed(1)} / 5` : '—'],
    ['CUISINE',     cap(recipe.cuisine)],
  ];

  return (
    <>
    <RecipePeopleProvider versionId={(recipe as any).recipeVersionId}>
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

          {/* Meta stats — below the intro (time/difficulty/cuisine glance) */}
          <div className="grid border border-[var(--border)] text-[11px] mt-5"
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
        </div>

        {/* Who's eating + per-person nutrition (what-if; nothing scheduled).
            Sits high — "who's eating" frames the page. */}
        <div className="px-4 md:px-8">
          <RecipePeoplePanel versionId={(recipe as any).recipeVersionId} />
        </div>

        {/* Inline controls: progress (desktop). Servings is driven by who's
            eating now, so the manual stepper is gone. */}
        <div className="hidden md:flex items-center gap-6 px-8 py-3 border-b border-[var(--border)] no-print">
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

        {/* Serving instruction — the execution moment, after the steps and
            before nutrition (cooking flow primary; nutrition is reference). */}
        <ServingBlock />

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
      </div>
    </div>

    {/* Dedicated cookbook print layout (renders only when printing). */}
    <PrintLayoutWithPeople recipe={recipe} url={typeof window !== 'undefined' ? window.location.href : undefined} />
    </RecipePeopleProvider>
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
              served_items,
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
                tasks ( name, display_template, single_tool, category )
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
          setRecipe(await attachLinkedDishes(supabase, await attachIntermediates(supabase, mapNewSchemaRecipe(data))));
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
              served_items,
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
                tasks ( name, display_template, single_tool, category )
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
            setRecipe(await attachLinkedDishes(supabase, await attachIntermediates(supabase, mapNewSchemaRecipe(shaped))));
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
