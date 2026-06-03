// src/app/api/my/meals/[id]/build/route.ts
// POST — build (materialise) the merged "unified" recipe for a meal and store it
// in meal_merged_recipe. Called automatically when the editor saves, and on demand
// via a "rebuild" action. Reads each component's current-version steps + per-step
// ingredients, runs the deterministic L1 scheduler (src/lib/meal-merge.ts), and
// upserts the result. Cheap reads later; this is the expensive write.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { mergeMeal, sourceHashForDishes, dishesFromComponentRows, type MergeInputDish } from '@/lib/meal-merge';

export async function POST(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // Ownership + must be a meal.
  const { data: meal } = await db
    .from('recipe_canonicals')
    .select('id, composition_level')
    .eq('id', id)
    .eq('author_id', user.id)
    .eq('composition_level', 'meal')
    .single();
  if (!meal) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Components + each sub-recipe's full current version (steps + ingredients).
  const { data: comps } = await db
    .from('meal_component')
    .select(`
      component_type, position, component_canonical_id,
      recipe_canonicals!component_canonical_id (
        id,
        recipe_versions!current_version_id (
          id, title,
          version_steps ( id, order_index, step_type, group_label, instruction, duration_seconds, temperature_celsius, appliance_settings ),
          version_ingredients ( quantity_value, quantity_unit, prep_note, step_id, ingredients!ingredient_id ( name ) )
        )
      )
    `)
    .eq('meal_canonical_id', id)
    .order('position', { ascending: true });

  // Shape into MergeInputDish[] (shared helper — identical to the recipe route's
  // staleness computation, so hashes always match).
  const dishes: MergeInputDish[] = dishesFromComponentRows(comps ?? []);

  // Run the deterministic merge.
  const result = mergeMeal(dishes);

  // A stable source hash so we can detect staleness (recipe view recomputes it).
  const sourceHash = sourceHashForDishes(dishes);

  // Upsert (1:1 by meal_canonical_id).
  const { error: upErr } = await db
    .from('meal_merged_recipe')
    .upsert({
      meal_canonical_id: id,
      payload: result,
      source_hash: sourceHash,
      total_seconds: result.totalSeconds,
      built_at: new Date().toISOString(),
    }, { onConflict: 'meal_canonical_id' });

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, totalSeconds: result.totalSeconds, stepCount: result.scheduled.length });
}
