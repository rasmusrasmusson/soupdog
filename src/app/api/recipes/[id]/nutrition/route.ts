// src/app/api/recipes/[id]/nutrition/route.ts
// Returns post-cooking nutrition for a recipe version,
// applying USDA retention factors per step task.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { applyRetentionFactors, calculateRecipeNutrition } from '@/lib/recipe-nutrition';

export async function GET(
  _req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = context.params;
  const { id } = await params;
  const supabase = await createClient();
  const db = supabase as any;

  // ── Fetch version ingredients with retention data ─────────
  const { data: vis, error: viErr } = await db
    .from('version_ingredients')
    .select(`
      id, quantity_value, quantity_unit, step_id,
      ingredients!ingredient_id (
        id, name, category,
        density_g_per_ml, typical_unit_weight_g,
        retention_category_id
      )
    `)
    .eq('version_id', id);

  if (viErr) return NextResponse.json({ error: viErr.message }, { status: 500 });

  // ── Per-ingredient nutrition from the resolved evidence-graded view ───────
  // (replaces the old ingredients.nutrition_per_100g blob; the view returns the
  //  best-graded value per nutrient — currently all e0/ai, identical to the blob.)
  const ingredientIds = [...new Set(
    (vis ?? []).map((vi: any) => vi.ingredients?.id).filter(Boolean)
  )];
  const nutritionByIngredient: Record<string, Record<string, number>> = {};
  if (ingredientIds.length > 0) {
    const { data: nutRows } = await db
      .from('ingredient_nutrition_current')
      .select('ingredient_id, nutrient_key, amount_per_100g')
      .in('ingredient_id', ingredientIds);
    for (const r of (nutRows ?? [])) {
      (nutritionByIngredient[r.ingredient_id] ??= {})[r.nutrient_key] =
        Number(r.amount_per_100g);
    }
  }

  // ── Fetch steps with task slugs ────────────────────────────
  const { data: steps } = await db
    .from('version_steps')
    .select('id, task_id')
    .eq('version_id', id);

  // Get task slugs for all step task_ids
  const taskIds = [...new Set((steps ?? []).map((s: any) => s.task_id).filter(Boolean))];
  let taskSlugMap: Record<string, string> = {};
  if (taskIds.length > 0) {
    const { data: tasks } = await db
      .from('tasks')
      .select('id, slug')
      .in('id', taskIds);
    for (const t of (tasks ?? [])) taskSlugMap[t.id] = t.slug;
  }

  const stepTaskMap = (steps ?? [])
    .filter((s: any) => s.task_id)
    .map((s: any) => ({
      stepId:   s.id,
      taskSlug: taskSlugMap[s.task_id] ?? 'boil',
    }));

  // ── Collect all retention category IDs needed ─────────────
  const retCatIds = [...new Set(
    (vis ?? [])
      .map((vi: any) => vi.ingredients?.retention_category_id)
      .filter(Boolean)
  )];

  // Build retention factor map: retCatId -> taskSlug -> nutrient -> pct
  const retMap: Record<string, Record<string, Record<string, number>>> = {};

  if (retCatIds.length > 0) {
    const { data: factors } = await db
      .from('cooking_retention_factors')
      .select('retention_category_id, nutrient, retention_pct')
      .in('retention_category_id', retCatIds);

    const { data: categories } = await db
      .from('retention_categories')
      .select('id, soupdog_task')
      .in('id', retCatIds);

    const catTaskMap: Record<string, string> = {};
    for (const c of (categories ?? [])) {
      if (c.soupdog_task) catTaskMap[c.id] = c.soupdog_task;
    }

    for (const f of (factors ?? [])) {
      const catId   = f.retention_category_id;
      const task    = catTaskMap[catId] ?? 'default';
      if (!retMap[catId])          retMap[catId] = {};
      if (!retMap[catId][task])    retMap[catId][task] = {};
      retMap[catId][task][f.nutrient] = f.retention_pct;
    }
  }

  // ── Build ingredient nutrition objects ────────────────────
  const ingredients = (vis ?? []).map((vi: any) => {
    const ing      = vi.ingredients ?? {};
    const retCatId = ing.retention_category_id;
    const retFactors = retCatId ? retMap[retCatId] : undefined;
    const nutrition = ing.id ? nutritionByIngredient[ing.id] : undefined;

    return {
      name:               ing.name ?? '',
      quantityValue:      vi.quantity_value,
      quantityUnit:       vi.quantity_unit,
      category:           ing.category,
      densityGPerMl:      ing.density_g_per_ml,
      typicalUnitWeightG: ing.typical_unit_weight_g,
      nutritionPer100g:   (nutrition && Object.keys(nutrition).length > 0) ? nutrition : undefined,
      stepId:             vi.step_id,
      retentionFactors:   retFactors,
    };
  });

  // ── Fetch servings from version ────────────────────────────
  const { data: version } = await db
    .from('recipe_versions')
    .select('base_servings')
    .eq('id', id)
    .single();
  const servings = version?.base_servings ?? 4;

  // ── Calculate ─────────────────────────────────────────────
  const hasRetention = stepTaskMap.length > 0 &&
    ingredients.some((i: any) => i.retentionFactors);

  const result = hasRetention
    ? applyRetentionFactors(ingredients, stepTaskMap, servings)
    : calculateRecipeNutrition(ingredients, servings);

  const phase = hasRetention ? 'post-cooking' : 'pre-cooking';

  // ── Nutrient metadata for grouped display (name/category/unit/order) ──
  // Lets the UI group the 50+ nutrients into macro/vitamin/mineral/fatty_acid
  // sections, label them, and order them — instead of a hardcoded row list.
  const { data: nutrientMeta } = await db
    .from('nutrient')
    .select('key, name, category, unit, display_order')
    .order('display_order', { ascending: true });

  return NextResponse.json({ ...result, phase, nutrientMeta: nutrientMeta ?? [] });
}
