// src/lib/recipe-actions.ts
'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

export interface RecipeFormData {
  title:              string;
  description:        string;
  cuisine:            string;
  tags:               string;
  servings:           number;
  difficulty:         string;
  totalTimeMinutes:   number;
  activeTimeMinutes:  number;
  ingredients: {
    ingredientId:  string;
    name:          string;
    quantityValue: number;
    quantityUnit:  string;
    prepNote:      string;
    optional:      boolean;
  }[];
  steps: {
    stepType:           string;
    instruction:        string;
    groupLabel:         string;
    durationMinutes:    number;
    temperatureCelsius: number;
    stepTools?: {
      equipmentId:       string;
      name:              string;
      applianceId?:      string;
      applianceModeId?:  string;
      applianceSettings?: Record<string, string | number>;
    }[];
    stepIngredients?: {
      ingredientId:  string;
      name:          string;
      quantityValue: number;
      quantityUnit:  string;
      prepNote:      string;
    }[];
  }[];
  equipmentIds: string[];
}

async function resolveIngredient(supabase: any, name: string, ingredientId: string): Promise<string | null> {
  if (ingredientId) return ingredientId;
  if (!name.trim()) return null;
  const ingSlug = slugify(name) + '-' + Date.now().toString(36).slice(-4);
  const { data } = await supabase
    .from('ingredients')
    .insert({ slug: ingSlug, name: name.trim(), category: 'other' })
    .select('id')
    .single();
  return data?.id ?? null;
}

async function insertStepsAndIngredients(supabase: any, versionId: string, data: RecipeFormData) {
  const stepIngredientIds = new Set<string>();

  for (let i = 0; i < data.steps.length; i++) {
    const step = data.steps[i];
    if (!step.instruction.trim()) continue;

    const { data: stepRow } = await supabase
      .from('version_steps')
      .insert({
        version_id:          versionId,
        order_index:         i + 1,
        step_type:           step.stepType || 'human',
        instruction:         step.instruction.trim(),
        group_label:         step.groupLabel?.trim() || null,
        duration_seconds:    step.durationMinutes ? step.durationMinutes * 60 : null,
        temperature_celsius: step.temperatureCelsius || null,
      } as any)
      .select('id')
      .single();

    if (step.stepIngredients?.length) {
      for (let j = 0; j < step.stepIngredients.length; j++) {
        const si = step.stepIngredients[j];
        if (!si.name.trim() && !si.ingredientId) continue;
        const ingredientId = await resolveIngredient(supabase, si.name, si.ingredientId);
        if (!ingredientId) continue;
        stepIngredientIds.add(ingredientId);
        await supabase.from('version_ingredients').insert({
          version_id:     versionId,
          ingredient_id:  ingredientId,
          quantity_value: si.quantityValue || 0,
          quantity_unit:  si.quantityUnit || 'g',
          prep_note:      si.prepNote?.trim() || null,
          optional:       false,
          order_index:    j + 1,
        } as any);
      }
    }
  }

  // Top-level ingredients not already saved via steps
  for (let i = 0; i < data.ingredients.length; i++) {
    const ing = data.ingredients[i];
    if (!ing.name.trim() && !ing.ingredientId) continue;
    const ingredientId = await resolveIngredient(supabase, ing.name, ing.ingredientId);
    if (!ingredientId) continue;
    if (stepIngredientIds.has(ingredientId)) continue;
    await supabase.from('version_ingredients').insert({
      version_id:     versionId,
      ingredient_id:  ingredientId,
      quantity_value: ing.quantityValue || 0,
      quantity_unit:  ing.quantityUnit || 'g',
      prep_note:      ing.prepNote?.trim() || null,
      optional:       ing.optional,
      order_index:    1000 + i,
    } as any);
  }

  for (const equipmentId of data.equipmentIds) {
    if (!equipmentId) continue;
    await supabase.from('version_equipment').insert({
      version_id: versionId, equipment_id: equipmentId, required: true,
    } as any);
  }
}

export async function createRecipe(data: RecipeFormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const slug = slugify(data.title) + '-' + Date.now().toString(36);

  const { data: canonicalRaw, error: canonicalError } = await (supabase as any)
    .from('recipe_canonicals')
    .insert({ slug, author_id: user.id, is_published: false, source: 'human_authored' } as any)
    .select().single();
  if (canonicalError || !canonicalRaw) throw canonicalError;
  const canonical = canonicalRaw as any;

  const { data: versionRaw, error: versionError } = await (supabase as any)
    .from('recipe_versions')
    .insert({
      canonical_id: canonical.id, version_number: 1,
      title: data.title.trim(), description: data.description.trim() || null,
      cuisine: data.cuisine.trim() || null,
      tags: data.tags ? data.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      base_servings: data.servings, difficulty: data.difficulty,
      total_time_seconds:   (data.totalTimeMinutes || 0) * 60,
      active_time_seconds:  (data.activeTimeMinutes || 0) * 60,
      passive_time_seconds: Math.max(0, ((data.totalTimeMinutes || 0) - (data.activeTimeMinutes || 0))) * 60,
      is_canonical_version: true,
    } as any)
    .select().single();
  if (versionError || !versionRaw) {
    await (supabase as any).from('recipe_canonicals').delete().eq('id', canonical.id);
    throw versionError;
  }
  const version = versionRaw as any;

  await (supabase as any).from('recipe_canonicals').update({ current_version_id: version.id }).eq('id', canonical.id);

  await insertStepsAndIngredients(supabase as any, version.id, data);

  await (supabase as any).from('execution_variants').insert({
    version_id: version.id, servings: data.servings,
    unit_system: 'si', is_canonical_variant: true, author_id: user.id,
  } as any);

  await (supabase as any).from('recipes').insert({
    slug, version: 1,
    title: data.title.trim(), description: data.description.trim() || null,
    cuisine: data.cuisine.trim() || null,
    tags: data.tags ? data.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    servings: data.servings, difficulty: data.difficulty as any,
    total_time_seconds:   (data.totalTimeMinutes || 0) * 60,
    active_time_seconds:  (data.activeTimeMinutes || 0) * 60,
    passive_time_seconds: Math.max(0, ((data.totalTimeMinutes || 0) - (data.activeTimeMinutes || 0))) * 60,
    author_id: user.id, is_published: false, recipe_version_id: version.id,
  });

  redirect(`/my/recipes`);
}

export async function updateRecipe(canonicalId: string, versionId: string, data: RecipeFormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: currentVersion } = await (supabase as any)
    .from('recipe_versions').select('version_number').eq('id', versionId).single();
  const newVersionNumber = (currentVersion?.version_number ?? 1) + 1;

  const { data: versionRaw2, error: versionError } = await (supabase as any)
    .from('recipe_versions')
    .insert({
      canonical_id: canonicalId, parent_version_id: versionId,
      version_number: newVersionNumber, change_summary: 'Updated via editor',
      title: data.title.trim(), description: data.description.trim() || null,
      cuisine: data.cuisine.trim() || null,
      tags: data.tags ? data.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      base_servings: data.servings, difficulty: data.difficulty,
      total_time_seconds:   (data.totalTimeMinutes || 0) * 60,
      active_time_seconds:  (data.activeTimeMinutes || 0) * 60,
      passive_time_seconds: Math.max(0, ((data.totalTimeMinutes || 0) - (data.activeTimeMinutes || 0))) * 60,
      is_canonical_version: true,
    } as any)
    .select().single();
  if (versionError || !versionRaw2) throw versionError;
  const version = versionRaw2 as any;

  await (supabase as any).from('recipe_versions').update({ is_canonical_version: false }).eq('id', versionId);
  await (supabase as any).from('recipe_canonicals').update({ current_version_id: version.id }).eq('id', canonicalId);

  await insertStepsAndIngredients(supabase as any, version.id, data);

  await (supabase as any).from('recipes').update({
    title: data.title.trim(), description: data.description.trim() || null,
    cuisine: data.cuisine.trim() || null,
    tags: data.tags ? data.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    servings: data.servings, difficulty: data.difficulty as any,
    total_time_seconds:   (data.totalTimeMinutes || 0) * 60,
    active_time_seconds:  (data.activeTimeMinutes || 0) * 60,
    passive_time_seconds: Math.max(0, ((data.totalTimeMinutes || 0) - (data.activeTimeMinutes || 0))) * 60,
    recipe_version_id: version.id, version: newVersionNumber,
  }).eq('recipe_version_id', versionId);

  redirect(`/my/recipes`);
}

export async function togglePublishRecipe(canonicalId: string, publish: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  await (supabase as any)
    .from('recipe_canonicals')
    .update({ is_published: publish })
    .eq('id', canonicalId)
    .eq('author_id', user.id);

  // Sync publish state to legacy mirror
  const { data: versions } = await (supabase as any)
    .from('recipe_versions').select('id').eq('canonical_id', canonicalId);
  const versionIds = (versions ?? []).map((r: any) => r.id);
  if (versionIds.length > 0) {
    await (supabase as any)
      .from('recipes')
      .update({ is_published: publish })
      .in('recipe_version_id', versionIds);
  }
}

export async function deleteRecipe(canonicalId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  await (supabase as any)
    .from('recipe_canonicals')
    .delete()
    .eq('id', canonicalId)
    .eq('author_id', user.id);

  redirect('/my/recipes');
}
