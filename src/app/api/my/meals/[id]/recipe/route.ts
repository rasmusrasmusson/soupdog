// src/app/api/my/meals/[id]/recipe/route.ts
// GET — the Level-0 unified recipe for a meal: each component rendered as a
// labelled section (the component's dish title as the group), PLUS a combined
// ingredient list deduplicated across components by ingredient name.
//
// L0 is deliberately deterministic and cheap: it does NOT reorder, schedule, or
// merge prep (that is L1, a later phase). It reuses the existing step-group
// grammar so a composed meal opens as ONE coherent page instead of N tabs.
// The "see dishes separately" data is the same payload — the client toggles
// between a merged ingredient list and per-component sections.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sourceHashForDishes, dishesFromComponentRows } from '@/lib/meal-merge';

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // Meal meta + ownership + must be a meal.
  const { data: meal, error: mErr } = await db
    .from('recipe_canonicals')
    .select(`id, slug, composition_level, recipe_versions!current_version_id ( title, base_servings )`)
    .eq('id', id)
    .eq('author_id', user.id)
    .eq('composition_level', 'meal')
    .single();
  if (mErr || !meal) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const mv = Array.isArray(meal.recipe_versions) ? meal.recipe_versions[0] : meal.recipe_versions;

  // Ordered components, each with its sub-recipe's full current version (steps + ingredients).
  const { data: comps } = await db
    .from('meal_component')
    .select(`
      id, component_type, position, servings_target, note, component_canonical_id,
      recipe_canonicals!component_canonical_id (
        id, slug,
        recipe_versions!current_version_id (
          id, title, cuisine, total_time_seconds, active_time_seconds, base_servings,
          version_steps (
            id, order_index, step_type, group_label, instruction,
            duration_seconds, temperature_celsius, appliance_settings
          ),
          version_ingredients (
            id, order_index, quantity_value, quantity_unit, food_state, prep_note, optional, step_id,
            ingredients!ingredient_id ( id, slug, name, nutrition_per_100g )
          )
        )
      )
    `)
    .eq('meal_canonical_id', id)
    .order('position', { ascending: true });

  // Build per-component sections + a combined ingredient list.
  // Combined list dedupes by lowercased ingredient name, summing quantities only
  // when units match (mixed units are listed separately to stay honest — L1 will
  // unify units properly).
  const combinedMap = new Map<string, { name: string; unit: string; value: number; mixed: boolean }>();
  let totalActiveSeconds = 0;
  let totalSeconds = 0;

  const components = (comps ?? []).map((c: any) => {
    const can = Array.isArray(c.recipe_canonicals) ? c.recipe_canonicals[0] : c.recipe_canonicals;
    const cv  = can && (Array.isArray(can.recipe_versions) ? can.recipe_versions[0] : can.recipe_versions);

    const vIngs = cv?.version_ingredients ?? [];
    // Steps sorted, with their step-linked ingredients attached.
    const steps = (cv?.version_steps ?? [])
      .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))
      .map((s: any) => {
        const stepIngs = vIngs
          .filter((vi: any) => vi.step_id === s.id)
          .map((vi: any) => ({
            name:          vi.ingredients?.name ?? '',
            quantityValue: vi.quantity_value ?? 0,
            quantityUnit:  vi.quantity_unit ?? 'g',
            prep:          vi.prep_note ?? null,
          }));
        return {
          id:                 s.id,
          group:              (s.group_label && s.group_label !== '__default__') ? s.group_label : null,
          stepType:           s.step_type,
          instruction:        s.instruction,
          durationMinutes:    s.duration_seconds ? Math.round(s.duration_seconds / 60) : null,
          temperatureCelsius: s.temperature_celsius ?? null,
          ingredients:        stepIngs,
        };
      });

    // Component-level ingredient list (top-level rows + step rows), for the combined list.
    for (const vi of vIngs) {
      const nm = (vi.ingredients?.name ?? '').trim();
      if (!nm) continue;
      const key = nm.toLowerCase();
      const unit = vi.quantity_unit ?? 'g';
      const val  = vi.quantity_value ?? 0;
      const cur = combinedMap.get(key);
      if (!cur) combinedMap.set(key, { name: nm, unit, value: val, mixed: false });
      else if (cur.unit === unit) cur.value += val;
      else cur.mixed = true;
    }

    if (cv?.active_time_seconds) totalActiveSeconds += cv.active_time_seconds;
    if (cv?.total_time_seconds)  totalSeconds += cv.total_time_seconds;

    return {
      componentId:   c.id,
      type:          c.component_type,
      title:         cv?.title ?? '(untitled)',
      cuisine:       cv?.cuisine ?? null,
      slug:          can?.slug ?? null,
      canonicalId:   c.component_canonical_id,
      servingsTarget: c.servings_target ?? null,
      baseServings:  cv?.base_servings ?? null,
      note:          c.note ?? null,
      totalTimeMinutes: cv?.total_time_seconds ? Math.round(cv.total_time_seconds / 60) : null,
      steps,
    };
  });

  const combinedIngredients = Array.from(combinedMap.values())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(x => ({
      name: x.name,
      // Hide a summed quantity if units were mixed across components (honest L0).
      quantityValue: x.mixed ? null : x.value,
      quantityUnit:  x.mixed ? null : x.unit,
      mixedUnits:    x.mixed,
    }));

  // Materialised L1 merge, if built. The page renders this as the "Cook together"
  // timeline. We also report whether it's STALE (the meal's components/timings
  // changed since it was built) or MISSING, so the page can auto-rebuild on view
  // — the user never has to manually "merge".
  const { data: mergedRow } = await db
    .from('meal_merged_recipe')
    .select('payload, total_seconds, built_at, source_hash')
    .eq('meal_canonical_id', id)
    .single();

  // Current hash from live components (identical computation to the build route).
  const currentHash = sourceHashForDishes(dishesFromComponentRows(comps ?? []));
  const hasComponents = (comps ?? []).length > 0;
  const mergeMissing = hasComponents && !mergedRow?.payload;
  const mergeStale = hasComponents && !!mergedRow?.payload && mergedRow.source_hash !== currentHash;

  return NextResponse.json({
    id:        meal.id,
    slug:      meal.slug,
    title:     mv?.title ?? 'Meal',
    servings:  mv?.base_servings ?? null,
    // NOTE: L0 sums component times as a rough upper bound — it does NOT yet model
    // overlap/parallelism (that's L1's backward schedule). Labelled as approximate
    // in the UI so it doesn't mislead.
    approxTotalMinutes: totalSeconds ? Math.round(totalSeconds / 60) : null,
    approxActiveMinutes: totalActiveSeconds ? Math.round(totalActiveSeconds / 60) : null,
    components,
    combinedIngredients,
    // L1 timeline (null if not built yet) + freshness flags for auto-rebuild.
    merged: mergedRow?.payload ?? null,
    mergedTotalMinutes: mergedRow?.total_seconds ? Math.round(mergedRow.total_seconds / 60) : null,
    mergeMissing,
    mergeStale,
  });
}
