// src/lib/snapshot-to-recipe.ts
//
// Maps a cooking session's FROZEN timeline snapshot into the `Recipe` shape that
// <RecipeDisplay> renders — so a live cooking session shows through the SAME recipe
// table (ingredients column, tools column, procedure) as any other recipe.
//
// A meal is a recipe: one list of items producing one end product. The snapshot is
// that list, frozen at session start. "Merge" was only how the list was authored;
// here it is simply a recipe. Tools are carried on each snapshot step (the start
// route attaches them from appliance_settings); we surface them via
// applianceSettings.stepTools, exactly as dag-to-recipe does.
//
// Step grouping uses the dish title so the cook still sees which dish a step belongs
// to (as a section header) without it being a separate recipe.

import type { Recipe, RecipeStep, RecipeIngredientRef } from '@/types';

interface SnapStepIngredient { name: string; quantityValue?: number; quantityUnit?: string; prep?: string | null }
interface SnapStep {
  id: string;
  dishTitle: string;
  dishCanonicalId: string;
  group: string | null;
  type: 'human' | 'machine' | 'passive' | 'hold';
  instruction: string;
  durationSeconds: number;
  temperatureCelsius: number | null;
  ingredients?: SnapStepIngredient[];
  startOffsetSeconds: number;
  endOffsetSeconds: number;
  isHold: boolean;
  meanwhile: boolean;
  tools?: { name: string }[];   // attached by the cooking-session start route
}
interface Snapshot {
  totalSeconds: number;
  scheduled: SnapStep[];
  hasDurations?: boolean;
}

export interface SnapshotRecipeMeta {
  title?: string;
  servings?: number | null;
  cuisine?: string | null;
}

export function snapshotToRecipe(snapshot: Snapshot, meta: SnapshotRecipeMeta = {}): Recipe {
  const scheduled = snapshot?.scheduled ?? [];
  const steps: RecipeStep[] = [];
  const ingredients: RecipeIngredientRef[] = [];

  let order = 0;
  for (const s of scheduled) {
    // Holds (keep-warm) are scheduling artifacts, not cook actions — skip in the recipe.
    if (s.isHold || s.type === 'hold') continue;
    order += 1;

    const tools = (s.tools ?? []).filter(t => t?.name);
    steps.push({
      id:          s.id,
      order,
      type:        s.type === 'machine' ? 'machine' : s.type === 'passive' ? 'passive' : 'human',
      // Group by dish so each dish reads as its own section within the one recipe.
      group:       s.dishTitle?.trim() || undefined,
      instruction: s.instruction,
      durationSeconds: s.durationSeconds || undefined,
      temperature: s.temperatureCelsius != null ? { value: s.temperatureCelsius, unit: '°C' } : undefined,
      applianceSettings: tools.length ? ({ stepTools: tools.map(t => ({ name: t.name })) } as any) : undefined,
    });

    for (const ing of s.ingredients ?? []) {
      if (!ing?.name?.trim()) continue;
      ingredients.push({
        ingredientId:   `${s.id}:${ing.name}`,   // synthetic — snapshot has no ingredient ids
        ingredientSlug: '',
        name:           ing.name.trim(),
        quantity:       { value: ing.quantityValue ?? 0, unit: ing.quantityUnit ?? '' },
        prep:           ing.prep?.trim() || undefined,
        optional:       false,
        stepId:         s.id,
      });
    }
  }

  const now = new Date().toISOString();
  return {
    id:               'session',
    slug:             'session',
    version:          1,
    title:            meta.title ?? 'Meal',
    cuisine:          meta.cuisine || undefined,
    servings:         meta.servings ?? 4,
    difficulty:       'medium',
    totalTimeSeconds: snapshot?.totalSeconds ?? 0,
    ingredients,
    steps,
    createdAt:        now,
    updatedAt:        now,
  };
}

// The procedure in RecipeDisplay assigns each step a sequential globalIndex in render
// order (skipping nothing — we already dropped holds). The cooking screen needs to map
// that display index back to the snapshot step id to persist progress. Since
// snapshotToRecipe preserves order and drops holds consistently, the recipe's
// steps[i].id IS the snapshot step id at display index i. This helper makes that
// explicit for the page.
export function stepIdsInDisplayOrder(recipe: Recipe): string[] {
  return recipe.steps.map(s => s.id);
}
