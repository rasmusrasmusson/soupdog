import type { Recipe, RecipeIngredientRef, RecipeStep, EquipmentRef } from '@/types';

export function mapRecipeFromDB(row: any): Recipe {
  const equipmentNameMap: Record<string, string> = {};
  (row.recipe_equipment ?? []).forEach((re: any) => {
    const id = re.equipment?.id ?? re.equipment_id;
    const name = re.equipment?.name ?? '';
    if (id) equipmentNameMap[id] = name;
  });

  // Build ingredient map by id for step ref lookups
  const ingredientMap: Record<string, { slug: string; name: string }> = {};
  (row.recipe_ingredients ?? []).forEach((ri: any) => {
    const id = ri.ingredients?.id ?? ri.ingredient_id;
    if (id) ingredientMap[id] = {
      slug: ri.ingredients?.slug ?? '',
      name: ri.ingredients?.name ?? '',
    };
  });

  const ingredients: RecipeIngredientRef[] = (row.recipe_ingredients ?? [])
    .sort((a: any, b: any) => a.order_index - b.order_index)
    .map((ri: any) => ({
      ingredientId:   ri.ingredients?.id   ?? ri.ingredient_id,
      ingredientSlug: ri.ingredients?.slug ?? '',
      name:           ri.ingredients?.name ?? '',
      quantity: { value: ri.quantity_value, unit: ri.quantity_unit },
      state:    ri.food_state  ?? undefined,
      prep:     ri.prep_note   ?? undefined,
      optional: ri.optional    ?? false,
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
      tools: (s.equipment_ids ?? [])
        .map((id: string) => equipmentNameMap[id])
        .filter(Boolean),
      // Resolve step_ingredient_refs -> ingredient IDs
      ingredients: (s.step_ingredient_refs ?? [])
        .sort((a: any, b: any) => a.order_index - b.order_index)
        .map((ref: any) => ref.ingredient_id)
        .filter(Boolean),
    }));

  const equipment: EquipmentRef[] = (row.recipe_equipment ?? [])
    .map((re: any) => ({
      equipmentId:  re.equipment?.id   ?? '',
      name:         re.equipment?.name ?? '',
      required:     re.required,
      alternatives: re.alternatives ?? undefined,
    }));

  return {
    id: row.id, slug: row.slug, version: row.version,
    title: row.title, description: row.description ?? undefined,
    cuisine: row.cuisine ?? undefined, tags: row.tags ?? undefined,
    servings: row.servings, difficulty: row.difficulty,
    totalTimeSeconds: row.total_time_seconds,
    activeTimeSeconds: row.active_time_seconds ?? undefined,
    passiveTimeSeconds: row.passive_time_seconds ?? undefined,
    ingredients, steps, equipment,
    nutrition: row.nutrition ?? undefined,
    ratings: undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
