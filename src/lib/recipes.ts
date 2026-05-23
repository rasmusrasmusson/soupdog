import { createClient } from '@/lib/supabase/server';
import type { Recipe, RecipeIngredientRef, RecipeStep, EquipmentRef } from '@/types';

// ── Fetch all published recipes ──────────────────────────────
export async function getRecipes(): Promise<Recipe[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('recipes')
    .select(`
      *,
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
    .eq('is_published', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching recipes:', error);
    return [];
  }

  return (data ?? []).map(mapRecipe);
}

// ── Fetch single recipe by slug ───────────────────────────────
export async function getRecipeBySlug(slug: string): Promise<Recipe | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('recipes')
    .select(`
      *,
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

  if (error || !data) return null;
  return mapRecipe(data);
}

// ── Search recipes ────────────────────────────────────────────
export async function searchRecipes(query: string): Promise<Recipe[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('is_published', true)
    .or(`title.ilike.%${query}%,description.ilike.%${query}%,cuisine.ilike.%${query}%`)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return [];
  return (data ?? []).map((r: any) => mapRecipe({ ...r, recipe_ingredients: [], recipe_steps: [], recipe_equipment: [] }));
}

// ── Map DB row to Recipe type ─────────────────────────────────
function mapRecipe(row: any): Recipe {
  const ingredients: RecipeIngredientRef[] = (row.recipe_ingredients ?? [])
    .sort((a: any, b: any) => a.order_index - b.order_index)
    .map((ri: any) => ({
      ingredientId:   ri.ingredients?.id   ?? ri.ingredient_id,
      ingredientSlug: ri.ingredients?.slug ?? '',
      name:           ri.ingredients?.name ?? '',
      quantity: {
        value: ri.quantity_value,
        unit:  ri.quantity_unit,
      },
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
        ? { value: s.temperature_celsius, unit: 'celsius' }
        : undefined,
    }));

  const equipment: EquipmentRef[] = (row.recipe_equipment ?? [])
    .map((re: any) => ({
      equipmentId:  re.equipment?.id   ?? '',
      name:         re.equipment?.name ?? '',
      required:     re.required,
      alternatives: re.alternatives ?? undefined,
    }));

  return {
    id:                  row.id,
    slug:                row.slug,
    version:             row.version,
    title:               row.title,
    description:         row.description  ?? undefined,
    cuisine:             row.cuisine      ?? undefined,
    tags:                row.tags         ?? undefined,
    servings:            row.servings,
    difficulty:          row.difficulty,
    totalTimeSeconds:    row.total_time_seconds,
    activeTimeSeconds:   row.active_time_seconds  ?? undefined,
    passiveTimeSeconds:  row.passive_time_seconds ?? undefined,
    ingredients,
    steps,
    equipment,
    nutrition:           row.nutrition    ?? undefined,
    ratings:             undefined, // will come from ratings table later
    createdAt:           row.created_at,
    updatedAt:           row.updated_at,
  };
}
