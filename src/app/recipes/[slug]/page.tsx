'use client';
import React, { useState, use } from 'react';
import { formatDuration } from '@/lib/utils';
import { Bookmark, Zap } from 'lucide-react';
import type { RecipeStep, RecipeIngredientRef, Recipe, ApplianceStepSettings } from '@/types';
import { APPLIANCES } from '@/lib/appliances';
import { calculateRecipeTiming } from '@/lib/recipe-timing';
import { calculateRecipeNutrition, type IngredientNutrition } from '@/lib/recipe-nutrition';

function useChecklist(count: number) {
  const [checked, setChecked] = useState<boolean[]>(Array(count).fill(false));
  const toggle = (i: number) => setChecked(p => p.map((v, idx) => idx === i ? !v : v));
  return { checked, toggle };
}

// ── Appliance settings badge ──────────────────────────────────
function ApplianceBadge({ settings }: { settings: ApplianceStepSettings }) {
  const appliance = APPLIANCES.find(a => a.id === settings.applianceId);
  const mode      = appliance?.modes.find(m => m.id === settings.applianceModeId);
  if (!appliance || !mode) return null;

  // Build a compact summary of the settings
  const parts: string[] = [];
  for (const control of mode.controls) {
    const val = settings.settings[control.id];
    if (val == null) continue;
    if (control.type === 'toggle') {
      if (val) parts.push(control.label);
    } else {
      parts.push(`${val}${control.unit ?? ''}`);
    }
  }

  return (
    <div
      style={{
        display: 'inline-flex', flexDirection: 'column', gap: 2,
        padding: '4px 8px', border: '1px solid var(--accent)',
        background: 'var(--accent-subtle)', marginTop: 4,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Zap size={9} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--accent)', fontWeight: 600 }}>
          {appliance.model}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)' }}>·</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg)' }}>{mode.label}</span>
      </div>
      {parts.length > 0 && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg)', paddingLeft: 13 }}>
          {parts.join(' · ')}
        </span>
      )}
    </div>
  );
}

// ── Compact appliance cell for table ─────────────────────────
function ApplianceCell({ settings }: { settings: ApplianceStepSettings }) {
  const appliance = APPLIANCES.find(a => a.id === settings.applianceId);
  const mode      = appliance?.modes.find(m => m.id === settings.applianceModeId);
  if (!appliance || !mode) return <span>—</span>;

  const parts: string[] = [];
  for (const control of mode.controls) {
    const val = settings.settings[control.id];
    if (val == null) continue;
    if (control.type === 'toggle') { if (val) parts.push(control.label); }
    else parts.push(`${val}${control.unit ?? ''}`);
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 1 }}>
        <Zap size={8} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--accent)', fontWeight: 600 }}>
          {appliance.model}
        </span>
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg)', display: 'block' }}>{mode.label}</span>
      {parts.length > 0 && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', display: 'block' }}>
          {parts.join(' · ')}
        </span>
      )}
    </div>
  );
}

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
      durationSeconds: s.duration_seconds ?? undefined,
      temperature: s.temperature_celsius
        ? { value: s.temperature_celsius, unit: 'celsius' as const }
        : undefined,
      applianceSettings: s.appliance_settings ?? undefined,
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
    versionId:          rv?.id ?? undefined,
    title:              rv?.title ?? row.title,
    description:        rv?.description  ?? row.description  ?? undefined,
    cuisine:            rv?.cuisine      ?? row.cuisine      ?? undefined,
    tags:               rv?.tags         ?? row.tags         ?? undefined,
    servings:           rv?.base_servings ?? row.servings,
    difficulty:         rv?.difficulty   ?? row.difficulty,
    totalTimeSeconds:   rv?.total_time_seconds   ?? row.total_time_seconds   ?? 0,
    activeTimeSeconds:  rv?.active_time_seconds  ?? row.active_time_seconds  ?? undefined,
    passiveTimeSeconds: rv?.passive_time_seconds ?? row.passive_time_seconds ?? undefined,
    ingredients,
    steps,
    equipment,
    nutrition:          rv?.nutrition ?? row.nutrition ?? undefined,
    ratings:            undefined,
    createdAt:          row.created_at,
    updatedAt:          row.updated_at,
  };
}

// ── Map legacy-schema DB row to Recipe type ───────────────────
function mapLegacyRecipe(row: any): Recipe {
  const ingredients: RecipeIngredientRef[] = (row.recipe_ingredients ?? [])
    .sort((a: any, b: any) => a.order_index - b.order_index)
    .map((ri: any) => ({
      ingredientId:   ri.ingredients?.id   ?? ri.ingredient_id,
      ingredientSlug: ri.ingredients?.slug ?? '',
      name:           ri.ingredients?.name ?? '',
      quantity: { value: ri.quantity_value, unit: ri.quantity_unit },
      state:    ri.food_state ?? undefined,
      prep:     ri.prep_note  ?? undefined,
      optional: ri.optional   ?? false,
    }));

  const steps: RecipeStep[] = (row.recipe_steps ?? [])
    .sort((a: any, b: any) => a.order_index - b.order_index)
    .map((s: any) => ({
      id:          s.id,
      order:       s.order_index,
      type:        s.step_type,
      group:       s.notes ?? undefined,
      instruction: s.instruction,
      durationSeconds: s.duration_seconds ?? undefined,
      temperature: s.temperature_celsius
        ? { value: s.temperature_celsius, unit: 'celsius' as const }
        : undefined,
    }));

  const equipment: any[] = (row.recipe_equipment ?? [])
    .map((re: any) => ({
      equipmentId:  re.equipment?.id   ?? '',
      name:         re.equipment?.name ?? '',
      required:     re.required,
      alternatives: re.alternatives ?? undefined,
    }));

  return {
    id:                 row.id,
    slug:               row.slug,
    version:            row.version,
    title:              row.title,
    description:        row.description  ?? undefined,
    cuisine:            row.cuisine      ?? undefined,
    tags:               row.tags         ?? undefined,
    servings:           row.servings,
    difficulty:         row.difficulty,
    totalTimeSeconds:   row.total_time_seconds,
    activeTimeSeconds:  row.active_time_seconds  ?? undefined,
    passiveTimeSeconds: row.passive_time_seconds ?? undefined,
    ingredients,
    steps,
    equipment,
    nutrition:          row.nutrition ?? undefined,
    ratings:            undefined,
    createdAt:          row.created_at,
    updatedAt:          row.updated_at,
  };
}

// ── Recipe nutrition section ──────────────────────────────────

function RecipeNutritionSection({ versionId, ingredients, servings, storedNutrition }: {
  versionId?: string;
  ingredients: RecipeIngredientRef[];
  servings: number;
  storedNutrition?: any;
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

  // Phase 1 fallback while API loads or if no versionId
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
                  {value}<span style={{ color: MUT, marginLeft: 3 }}>{unit}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RecipeView({ recipe }: { recipe: Recipe }) {
  const ingChecks  = useChecklist(recipe.ingredients.length);
  const stepChecks = useChecklist(recipe.steps.length);
  const [servings, setServings] = useState(recipe.servings);
  const [addedIngs, setAddedIngs] = useState<Record<string, boolean>>({});
  const toggleAddedIng = (key: string) => setAddedIngs(p => ({ ...p, [key]: !p[key] }));

  // Build step → ingredients map from stepId on each ingredient
  const stepIngMap = React.useMemo(() => {
    const map: Record<string, RecipeIngredientRef[]> = {};
    for (const ing of recipe.ingredients) {
      if (!ing.stepId) continue;
      if (!map[ing.stepId]) map[ing.stepId] = [];
      map[ing.stepId].push(ing);
    }
    return map;
  }, [recipe.ingredients]);

  // Top-level ingredients (no step link) for the Ingredients section
  const topIngredients = recipe.ingredients.filter(i => !i.stepId);
  // Show the top-level list only if it has content; otherwise show all ingredients
  const displayIngredients = topIngredients.length > 0 ? topIngredients : recipe.ingredients;

  const groups: { label: string; steps: (RecipeStep & { globalIndex: number })[] }[] = [];
  recipe.steps.forEach((step, i) => {
    const label = step.group ?? 'General';
    let g = groups.find(g => g.label === label);
    if (!g) { g = { label, steps: [] }; groups.push(g); }
    g.steps.push({ ...step, globalIndex: i });
  });

  // Critical-path timing
  const timing = calculateRecipeTiming(recipe.steps);
  // Use calculated total if stored value is 0 but steps have durations
  const displayTotalSeconds = recipe.totalTimeSeconds > 0
    ? recipe.totalTimeSeconds
    : timing.totalSeconds;

  const B    = '1px solid var(--border)';
  const MONO = 'var(--font-mono)';
  const MUT  = 'var(--muted)';
  const tbl: React.CSSProperties   = { borderCollapse: 'collapse', border: B, width: '100%', fontSize: 12 };
  const thead: React.CSSProperties = { background: 'var(--surface-hover)' };
  const td: React.CSSProperties    = { padding: '9px 14px', color: 'var(--fg)', verticalAlign: 'middle' };

  const metaItems: [string, string][] = [
    ['RECIPE ID',   recipe.id.split('-')[0].toUpperCase()],
    ['YIELD',       `${servings} servings`],
    ['TOTAL TIME',  displayTotalSeconds > 0 ? formatDuration(displayTotalSeconds) : '—'],
    ['ACTIVE TIME', recipe.activeTimeSeconds ? formatDuration(recipe.activeTimeSeconds) : '—'],
    ['DIFFICULTY',  recipe.difficulty],
    ['RATING',      recipe.ratings ? `${(recipe.ratings as any).average.toFixed(1)} / 5` : '—'],
    ['CUISINE',     recipe.cuisine ?? '—'],
  ];

  return (
    <div className="flex h-full">
      <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">

        {/* Title + meta */}
        <div className="px-4 md:px-8 pt-6 pb-5 border-b border-[var(--border)]">
          <div className="flex items-start justify-between gap-4 mb-4">
            <h1 className="font-display text-[24px] md:text-[28px] font-normal leading-tight text-[var(--fg)]">
              {recipe.title}
            </h1>
            <button className="flex items-center gap-1.5 border border-[var(--border)] px-3 py-1.5 text-[11px] font-mono text-[var(--fg)] hover:border-[var(--accent)] transition-colors flex-shrink-0">
              <Bookmark size={11} strokeWidth={1.5} /> Bookmark
            </button>
          </div>
          <div className="hidden md:grid border border-[var(--border)] text-[11px]"
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
          <div className="md:hidden border border-[var(--border)]"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '1px', background: 'var(--border)' }}>
            {metaItems.map(([label, value]) => (
              <div key={label} style={{ background: 'var(--surface)', padding: '8px 12px' }}>
                <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.15em', color: MUT, marginBottom: 3 }}>{label}</div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--fg)', fontWeight: 500 }}>{value}</div>
              </div>
            ))}
          </div>
          {recipe.description && (
            <p className="mt-3 text-[12px] text-[var(--muted)] leading-relaxed max-w-2xl">{recipe.description}</p>
          )}
        </div>

        <div className="px-4 md:px-8 py-6 space-y-8">

          {/* Ingredients */}
          <section>
            <SectionHeader title="Ingredients" meta={`${displayIngredients.length} items · ${servings} servings`} />
            <div className="md:hidden border border-[var(--border)] divide-y divide-[var(--border)]">
              {displayIngredients.map((ing, i) => (
                <div key={ing.ingredientId + i} className="flex items-center gap-3 px-3 py-2.5"
                  style={{ opacity: ingChecks.checked[i] ? 0.4 : 1, background: ingChecks.checked[i] ? 'var(--surface-hover)' : undefined }}>
                  <Checkbox checked={ingChecks.checked[i]} onChange={() => ingChecks.toggle(i)} />
                  <span style={{ fontFamily: MONO, fontSize: 10, color: MUT, width: 20, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                  <span style={{ fontWeight: 500, fontSize: 13, flex: 1, minWidth: 0 }}>{ing.name}</span>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--fg)', flexShrink: 0 }}>{ing.quantity.value}{ing.quantity.unit}</span>
                  {ing.prep && <span style={{ fontFamily: MONO, fontSize: 10, color: MUT, flexShrink: 0, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ing.prep}</span>}
                </div>
              ))}
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table style={{ ...tbl, minWidth: 480 }}>
                <thead>
                  <tr style={thead}>
                    <Th w={36} /><Th w={32}>#</Th><Th>Product</Th>
                    <Th w={90} right>Qty</Th><Th w={70}>Unit</Th>
                    <Th>Prep / Notes</Th><Th w={80} center>State</Th>
                  </tr>
                </thead>
                <tbody>
                  {displayIngredients.map((ing, i) => (
                    <tr key={ing.ingredientId + i} style={{ borderTop: B, opacity: ingChecks.checked[i] ? 0.4 : 1, background: ingChecks.checked[i] ? 'var(--surface-hover)' : undefined }}>
                      <td style={{ ...td, borderRight: B, textAlign: 'center' }}><Checkbox checked={ingChecks.checked[i]} onChange={() => ingChecks.toggle(i)} /></td>
                      <td style={{ ...td, borderRight: B, fontFamily: MONO, fontSize: 10, color: MUT, textAlign: 'center' }}>{i + 1}</td>
                      <td style={{ ...td, borderRight: B, fontWeight: 500 }}>
                        <a href={`/ingredients/${ing.ingredientSlug}`} style={{ color: 'var(--fg)', textDecoration: 'none' }} className="hover:text-[var(--accent)] transition-colors">{ing.name}</a>
                        {ing.optional && <span style={{ marginLeft: 8, fontSize: 10, color: MUT, fontFamily: MONO }}>(opt)</span>}
                      </td>
                      <td style={{ ...td, borderRight: B, textAlign: 'right', fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>{ing.quantity.value}</td>
                      <td style={{ ...td, borderRight: B, fontFamily: MONO, fontSize: 11, color: MUT }}>{ing.quantity.unit}</td>
                      <td style={{ ...td, borderRight: B, color: MUT }}>{ing.prep ?? '—'}</td>
                      <td style={{ ...td, textAlign: 'center', fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', color: MUT }}>{ing.state ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Equipment */}
          {recipe.equipment && recipe.equipment.length > 0 && (
            <section>
              <SectionHeader title="Equipment" />
              <div className="overflow-x-auto">
                <table style={{ ...tbl, minWidth: 300 }}>
                  <thead><tr style={thead}><Th>Tool</Th><Th w={90} center>Required</Th><Th>Alternatives</Th></tr></thead>
                  <tbody>
                    {recipe.equipment.map(eq => (
                      <tr key={eq.equipmentId} style={{ borderTop: B }}>
                        <td style={{ ...td, borderRight: B, fontWeight: 500 }}>{eq.name}</td>
                        <td style={{ ...td, borderRight: B, textAlign: 'center', fontFamily: MONO, fontSize: 10, color: MUT }}>{eq.required ? '✓' : '—'}</td>
                        <td style={{ ...td, color: MUT }}>{eq.alternatives?.join(', ') ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Procedure */}
          <section>
            <SectionHeader title="Procedure" meta={`${recipe.steps.length} steps`} />

            {/* Mobile */}
            <div className="md:hidden border border-[var(--border)] divide-y divide-[var(--border)]">
              {groups.map((group, gi) => (
                <React.Fragment key={group.label}>
                  <div style={{ padding: '6px 12px', background: 'var(--surface-hover)', fontFamily: MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--fg)', fontWeight: 600, borderTop: gi > 0 ? `2px solid var(--border)` : undefined, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{group.label}</span>
                    {timing.groupSeconds[group.label] > 0 && (
                      <span style={{ fontWeight: 400, color: MUT }}>
                        {formatDuration(timing.groupSeconds[group.label])}
                      </span>
                    )}
                  </div>
                  {group.steps.map(step => {
                    const gIdx = step.globalIndex;
                    const done = stepChecks.checked[gIdx];
                    const stepIngs = stepIngMap[step.id] ?? [];
                    return (
                      <div key={step.id} style={{ padding: '10px 12px', opacity: done ? 0.4 : 1, background: done ? 'var(--surface-hover)' : undefined }}>
                        <div className="flex items-start gap-3">
                          <Checkbox checked={done} onChange={() => stepChecks.toggle(gIdx)} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--fg)', margin: 0 }}>{step.instruction}</p>
                            {/* Per-step ingredient pills */}
                            {stepIngs.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {stepIngs.map((ing: RecipeIngredientRef) => {
                                  const key = `${step.id}-${ing.ingredientId}`;
                                  const added = addedIngs[key];
                                  return (
                                    <button key={key} onClick={() => toggleAddedIng(key)}
                                      style={{ fontFamily: MONO, fontSize: 10, padding: '2px 8px', borderRadius: 3, border: `1px solid ${added ? 'var(--accent)' : 'var(--border)'}`, background: added ? 'var(--accent-subtle)' : 'var(--surface)', color: added ? 'var(--accent-text)' : 'var(--fg)', cursor: 'pointer', transition: 'all 0.15s', textDecoration: added ? 'line-through' : 'none' }}>
                                      {ing.name} · {ing.quantity.value}{ing.quantity.unit}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                            {/* Appliance settings */}
                            {step.applianceSettings && (
                              <div className="mt-2">
                                <ApplianceBadge settings={step.applianceSettings} />
                              </div>
                            )}
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {step.durationSeconds && <span style={{ fontFamily: MONO, fontSize: 10, color: MUT }}>⏱ {formatDuration(step.durationSeconds)}</span>}
                              {step.temperature && <span style={{ fontFamily: MONO, fontSize: 10, color: MUT }}>{step.temperature.value}°{step.temperature.unit === 'celsius' ? 'C' : 'F'}</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
              <div style={{ padding: '8px 12px', background: 'var(--surface-hover)', display: 'flex', justifyContent: 'space-between', borderTop: '2px solid var(--border)' }}>
                <span style={{ fontFamily: MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em', color: MUT }}>Total Time</span>
                <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: 'var(--fg)' }}>{displayTotalSeconds > 0 ? formatDuration(displayTotalSeconds) : '—'}</span>
              </div>
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table style={{ ...tbl, minWidth: 640 }}>
                <thead>
                  <tr style={thead}>
                    <Th w={36} /><Th>Product</Th><Th w={80} right>Qty</Th>
                    <Th w={50}>Unit</Th><Th w={160}>Appliance / Setting</Th>
                    <Th w={70} right>Time</Th><Th>Instruction</Th>
                  </tr>
                </thead>
                {groups.map((group, gi) => (
                  <React.Fragment key={group.label}>
                    <tbody>
                      <tr>
                        <td colSpan={7} style={{ padding: '7px 14px', background: 'var(--surface-hover)', borderTop: gi === 0 ? B : `2px solid var(--border)`, borderBottom: B, fontFamily: MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--fg)', fontWeight: 600 }}>
                          <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>{group.label}</span>
                            {timing.groupSeconds[group.label] > 0 && (
                              <span style={{ fontWeight: 400, color: MUT, textTransform: 'none', letterSpacing: 0 }}>
                                {formatDuration(timing.groupSeconds[group.label])}
                              </span>
                            )}
                          </span>
                        </td>
                      </tr>
                      {group.steps.map(step => {
                        const gIdx = step.globalIndex;
                        const done = stepChecks.checked[gIdx];
                        const stepIngs = stepIngMap[step.id] ?? [];
                        const rowCount = Math.max(1, stepIngs.length);

                        return stepIngs.length === 0 ? (
                          <tr key={step.id} style={{ borderTop: B, opacity: done ? 0.4 : 1, background: done ? 'var(--surface-hover)' : undefined, verticalAlign: 'top' }}>
                            <td style={{ ...td, borderRight: B, textAlign: 'center', verticalAlign: 'middle' }}><Checkbox checked={done} onChange={() => stepChecks.toggle(gIdx)} /></td>
                            <td style={{ ...td, borderRight: B, color: MUT, fontFamily: MONO, fontSize: 10 }}>—</td>
                            <td style={{ ...td, borderRight: B, textAlign: 'right', fontFamily: MONO, color: MUT }}>—</td>
                            <td style={{ ...td, borderRight: B, fontFamily: MONO, fontSize: 11, color: MUT }}>—</td>
                            <td style={{ ...td, borderRight: B, fontSize: 11 }}>
                              {step.applianceSettings
                                ? <ApplianceCell settings={step.applianceSettings} />
                                : step.temperature
                                  ? <span style={{ fontFamily: MONO, fontSize: 11 }}>{step.temperature.value}°{step.temperature.unit === 'celsius' ? 'C' : 'F'}</span>
                                  : <span style={{ color: MUT }}>—</span>
                              }
                            </td>
                            <td style={{ ...td, borderRight: B, textAlign: 'right', fontFamily: MONO, fontSize: 11, fontVariantNumeric: 'tabular-nums', color: step.durationSeconds ? 'var(--fg)' : MUT }}>
                              {step.durationSeconds ? formatDuration(step.durationSeconds) : '—'}
                            </td>
                            <td style={{ ...td, lineHeight: 1.55 }}>{step.instruction}</td>
                          </tr>
                        ) : (
                          stepIngs.map((ing: RecipeIngredientRef, rowIdx: number) => (
                            <tr key={`${step.id}-${rowIdx}`} style={{ borderTop: rowIdx === 0 ? B : `1px dashed var(--border)`, opacity: done ? 0.4 : 1, background: done ? 'var(--surface-hover)' : undefined, verticalAlign: rowIdx === 0 ? 'top' : 'middle' }}>
                              {rowIdx === 0 && <td rowSpan={rowCount} style={{ ...td, borderRight: B, textAlign: 'center', verticalAlign: 'middle' }}><Checkbox checked={done} onChange={() => stepChecks.toggle(gIdx)} /></td>}
                              <td style={{ ...td, borderRight: B, fontWeight: 500 }}>
                                <a href={`/ingredients/${ing.ingredientSlug}`} style={{ color: 'var(--fg)', textDecoration: 'none' }} className="hover:text-[var(--accent)] transition-colors">{ing.name}</a>
                              </td>
                              <td style={{ ...td, borderRight: B, textAlign: 'right', fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>{ing.quantity.value}</td>
                              <td style={{ ...td, borderRight: B, fontFamily: MONO, fontSize: 11, color: MUT }}>{ing.quantity.unit}</td>
                              {rowIdx === 0 && (
                                <td rowSpan={rowCount} style={{ ...td, borderRight: B, fontSize: 11, verticalAlign: 'top' }}>
                                  {step.applianceSettings
                                    ? <ApplianceCell settings={step.applianceSettings} />
                                    : step.temperature
                                      ? <span style={{ fontFamily: MONO, fontSize: 11 }}>{step.temperature.value}°{step.temperature.unit === 'celsius' ? 'C' : 'F'}</span>
                                      : <span style={{ color: MUT }}>—</span>
                                  }
                                </td>
                              )}
                              {rowIdx === 0 && (
                                <td rowSpan={rowCount} style={{ ...td, borderRight: B, textAlign: 'right', fontFamily: MONO, fontSize: 11, fontVariantNumeric: 'tabular-nums', color: step.durationSeconds ? 'var(--fg)' : MUT, verticalAlign: 'top' }}>
                                  {step.durationSeconds ? formatDuration(step.durationSeconds) : '—'}
                                </td>
                              )}
                              {rowIdx === 0 && (
                                <td rowSpan={rowCount} style={{ ...td, lineHeight: 1.55, verticalAlign: 'top' }}>{step.instruction}</td>
                              )}
                            </tr>
                          ))
                        );
                      })}
                    </tbody>
                  </React.Fragment>
                ))}
                <tfoot>
                  <tr style={{ borderTop: `2px solid var(--border)`, background: 'var(--surface-hover)' }}>
                    <td colSpan={6} style={{ ...td, fontFamily: MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em', color: MUT }}>Total Time</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: MONO, fontWeight: 600, color: 'var(--fg)' }}>{displayTotalSeconds > 0 ? formatDuration(displayTotalSeconds) : '—'}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {/* Nutrition — calculated from ingredients */}
          <RecipeNutritionSection
            versionId={(recipe as any).versionId}
            ingredients={recipe.ingredients}
            servings={servings}
            storedNutrition={recipe.nutrition}
          />

          <div className="md:hidden h-16" />
        </div>
      </div>

      {/* Right panel */}
      <aside className="hidden md:block w-48 flex-shrink-0 border-l border-[var(--border)] sticky top-0 h-full overflow-y-auto bg-[var(--surface)] text-[12px]">
        <PanelSection title="Progress">
          <ProgressBar label="Ingredients" done={ingChecks.checked.filter(Boolean).length} total={recipe.ingredients.length} />
          <div className="mt-2"><ProgressBar label="Steps" done={stepChecks.checked.filter(Boolean).length} total={recipe.steps.length} /></div>
        </PanelSection>
        <PanelSection title="Servings">
          <div className="flex items-center border border-[var(--border)]">
            <button onClick={() => setServings(s => Math.max(1, s-1))} className="w-8 h-8 font-mono text-[var(--muted)] hover:text-[var(--fg)] border-r border-[var(--border)] flex items-center justify-center hover:bg-[var(--surface-hover)] transition-colors">−</button>
            <span className="flex-1 text-center font-mono tabular-nums text-[13px]">{servings}</span>
            <button onClick={() => setServings(s => s+1)} className="w-8 h-8 font-mono text-[var(--muted)] hover:text-[var(--fg)] border-l border-[var(--border)] flex items-center justify-center hover:bg-[var(--surface-hover)] transition-colors">+</button>
          </div>
        </PanelSection>
        <PanelSection title="Recipe Information">
          <table className="w-full text-[11px]">
            <tbody>
              {[['Version',`v${recipe.version}`],['Cuisine',recipe.cuisine??'—'],['Difficulty',recipe.difficulty],['Updated',new Date(recipe.updatedAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})]].map(([k,v])=>(
                <tr key={k} className="border-b border-[var(--border-subtle)] last:border-0">
                  <td className="py-1.5 text-[var(--muted)] font-mono text-[10px]">{k}</td>
                  <td className="py-1.5 text-[var(--fg)] text-right">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </PanelSection>
      </aside>

      {/* Mobile sticky bar */}
      <div className="md:hidden fixed bottom-[56px] left-0 right-0 z-10 bg-[var(--surface)] border-t border-[var(--border)] px-4 py-2 flex items-center gap-4">
        <div className="flex-1 min-w-0"><ProgressBar label="Ingredients" done={ingChecks.checked.filter(Boolean).length} total={recipe.ingredients.length} /></div>
        <div className="flex-1 min-w-0"><ProgressBar label="Steps" done={stepChecks.checked.filter(Boolean).length} total={recipe.steps.length} /></div>
        <div className="flex items-center border border-[var(--border)] flex-shrink-0">
          <button onClick={() => setServings(s => Math.max(1, s-1))} className="w-7 h-7 font-mono text-[var(--muted)] border-r border-[var(--border)] flex items-center justify-center hover:bg-[var(--surface-hover)] transition-colors text-[13px]">−</button>
          <span className="px-2 font-mono tabular-nums text-[12px]">{servings}</span>
          <button onClick={() => setServings(s => s+1)} className="w-7 h-7 font-mono text-[var(--muted)] border-l border-[var(--border)] flex items-center justify-center hover:bg-[var(--surface-hover)] transition-colors text-[13px]">+</button>
        </div>
      </div>
    </div>
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

  React.useEffect(() => {
    async function load() {
      setLoading(true); setError(null);
      try {
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient() as any;

        const { data, error: dbError } = await supabase
          .from('recipes')
          .select(`
            *,
            recipe_versions (
              id, title, description, cuisine, tags, base_servings,
              difficulty, total_time_seconds, active_time_seconds,
              version_ingredients (
                id, order_index, quantity_value, quantity_unit,
                food_state, prep_note, optional, step_id,
                ingredients!ingredient_id ( id, slug, name, category,
                  nutrition_per_100g, density_g_per_ml, typical_unit_weight_g,
                  retention_category_id )
              ),
              version_steps (
                id, order_index, step_type, group_label, instruction,
                duration_seconds, temperature_celsius, appliance_settings
              ),
              version_equipment (
                id, required,
                equipment ( id, slug, name )
              )
            ),
            recipe_ingredients (
              id, order_index, quantity_value, quantity_unit,
              food_state, prep_note, optional,
              ingredients ( id, slug, name )
            ),
            recipe_steps (
              id, order_index, step_type, instruction,
              duration_seconds, temperature_celsius, notes
            ),
            recipe_equipment (
              id, required, alternatives,
              equipment ( id, slug, name )
            )
          `)
          .eq('slug', slug)
          .eq('is_published', true)
          .single();

        if (dbError) throw dbError;

        if (data) {
          const rv = data.recipe_versions;
          const hasNewData = rv && (
            (rv.version_ingredients?.length > 0) ||
            (rv.version_steps?.length > 0)
          );
          setRecipe(hasNewData ? mapNewSchemaRecipe(data) : mapLegacyRecipe(data));
          setLoading(false);
          return;
        }
      } catch (err) {
        console.error('[RecipePage]', err);
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

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <span className="font-mono text-[11px] text-[var(--muted)] uppercase tracking-widest">Loading…</span>
    </div>
  );
  if (error || !recipe) return (
    <div className="p-8 font-mono text-[12px] text-[var(--muted)]">{error ?? 'Recipe not found.'}</div>
  );
  return <RecipeView recipe={recipe} />;
}

function Th({ children, w, right, center }: { children?: React.ReactNode; w?: number; right?: boolean; center?: boolean }) {
  return <th style={{ padding: '8px 14px', fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--muted)', borderRight: '1px solid var(--border)', textAlign: right ? 'right' : center ? 'center' : 'left', width: w, whiteSpace: 'nowrap' }} className="last:border-r-0">{children}</th>;
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange} role="checkbox" aria-checked={checked}
      className="w-4 h-4 border border-[var(--border)] flex items-center justify-center hover:border-[var(--accent)] transition-colors flex-shrink-0"
      style={{ background: checked ? 'var(--accent)' : 'var(--surface)' }}>
      {checked && <span style={{ color: '#fff', fontSize: 9, lineHeight: 1, fontFamily: 'var(--font-mono)' }}>✓</span>}
    </button>
  );
}

function SectionHeader({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="flex items-center gap-3 mb-2">
      <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--muted)]">{title}</span>
      <div className="flex-1 h-px bg-[var(--border)]" />
      {meta && <span className="font-mono text-[9px] text-[var(--muted)]">{meta}</span>}
    </div>
  );
}

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-[var(--border)]">
      <div className="px-4 py-2 bg-[var(--surface-hover)] border-b border-[var(--border)]">
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--muted)]">{title}</span>
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

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
