// src/lib/recipe-actions.ts
// Server-side functions for creating and updating recipes (new schema)
'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

// ── Helpers ───────────────────────────────────────────────────
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}


export interface RecipeFormData {
  title:              string;
  description:        string;
  cuisine:            string;
  tags:               string;       // comma-separated
  servings:           number;
  difficulty:         string;
  totalTimeMinutes:   number;
  activeTimeMinutes:  number;
  ingredients: {
    ingredientId:   string;
    name:           string;         // used if no ingredientId (new ingredient)
    quantityValue:  number;
    quantityUnit:   string;
    prepNote:       string;
    optional:       boolean;
  }[];
  steps: {
    stepType:    string;
    instruction: string;
    groupLabel:  string;
    durationMinutes: number;
    temperatureCelsius: number;
  }[];
  equipmentIds: string[];
}

// ── Create a new recipe (canonical + version + associations) ──
export async function createRecipe(data: RecipeFormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const slug = slugify(data.title) + '-' + Date.now().toString(36);

  // 1. Create canonical
  const { data: canonicalRaw, error: canonicalError } = await (supabase as any)
    .from('recipe_canonicals')
    .insert({
      slug,
      author_id:    user.id,
      is_published: false,  // drafts until explicitly published
      source:       'human_authored',
    } as any)
    .select()
    .single();

  if (canonicalError || !canonicalRaw) throw canonicalError;
  const canonical = canonicalRaw as any;

  // 2. Create version
  const { data: versionRaw, error: versionError } = await (supabase as any)
    .from('recipe_versions')
    .insert({
      canonical_id:          canonical.id,
      version_number:        1,
      title:                 data.title.trim(),
      description:           data.description.trim() || null,
      cuisine:               data.cuisine.trim() || null,
      tags:                  data.tags ? data.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      base_servings:         data.servings,
      difficulty:            data.difficulty,
      total_time_seconds:    (data.totalTimeMinutes || 0) * 60,
      active_time_seconds:   (data.activeTimeMinutes || 0) * 60,
      passive_time_seconds:  Math.max(0, ((data.totalTimeMinutes || 0) - (data.activeTimeMinutes || 0))) * 60,
      is_canonical_version:  true,
    } as any)
    .select()
    .single();

  if (versionError || !versionRaw) {
    await (supabase as any).from('recipe_canonicals').delete().eq('id', canonical.id);
    throw versionError;
  }
  const version = versionRaw as any;

  // 3. Update canonical to point at version
  await (supabase as any)
    .from('recipe_canonicals')
    .update({ current_version_id: version.id })
    .eq('id', canonical.id);

  // 4. Insert/resolve ingredients and create version_ingredients
  for (let i = 0; i < data.ingredients.length; i++) {
    const ing = data.ingredients[i];
    if (!ing.name.trim() && !ing.ingredientId) continue;

    let ingredientId = ing.ingredientId;

    // If no existing ingredient matched, create one
    if (!ingredientId && ing.name.trim()) {
      const ingSlug = slugify(ing.name) + '-' + Date.now().toString(36).slice(-4);
      const { data: newIngRaw } = await (supabase as any)
        .from('ingredients')
        .insert({ slug: ingSlug, name: ing.name.trim(), category: 'other' })
        .select()
        .single();
      ingredientId = (newIngRaw as any)?.id;
    }

    if (!ingredientId) continue;

    await (supabase as any).from('version_ingredients').insert({
      version_id:     version.id,
      ingredient_id:  ingredientId,
      quantity_value: ing.quantityValue || 0,
      quantity_unit:  ing.quantityUnit || 'g',
      prep_note:      ing.prepNote.trim() || null,
      optional:       ing.optional,
      order_index:    i + 1,
    } as any);

  // 5. Insert steps
  for (let i = 0; i < data.steps.length; i++) {
    const step = data.steps[i];
    if (!step.instruction.trim()) continue;

    await (supabase as any).from('version_steps').insert({
      version_id:          version.id,
      order_index:         i + 1,
      step_type:           step.stepType || 'human',
      instruction:         step.instruction.trim(),
      group_label:         step.groupLabel.trim() || null,
      duration_seconds:    step.durationMinutes ? step.durationMinutes * 60 : null,
      temperature_celsius: step.temperatureCelsius || null,
    } as any);
  }

  // 6. Insert equipment links
  for (const equipmentId of data.equipmentIds) {
    if (!equipmentId) continue;
    await (supabase as any).from('version_equipment').insert({
      version_id:   version.id,
      equipment_id: equipmentId,
      required:     true,
    } as any);
  }

  // 7. Create canonical execution variant
  await (supabase as any).from('execution_variants').insert({
    version_id:           version.id,
    servings:             data.servings,
    unit_system:          'si',
    is_canonical_variant: true,
    author_id:            user.id,
  } as any);

  // 8. Mirror to legacy recipes table for compatibility
  await (supabase as any).from('recipes').insert({
    slug,
    version:           1,
    title:             data.title.trim(),
    description:       data.description.trim() || null,
    cuisine:           data.cuisine.trim() || null,
    tags:              data.tags ? data.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    servings:          data.servings,
    difficulty:        data.difficulty as any,
    total_time_seconds: (data.totalTimeMinutes || 0) * 60,
    active_time_seconds: (data.activeTimeMinutes || 0) * 60,
    passive_time_seconds: Math.max(0, ((data.totalTimeMinutes || 0) - (data.activeTimeMinutes || 0))) * 60,
    author_id:         user.id,
    is_published:      false,
    recipe_version_id: version.id,
  });

  redirect(`/my/recipes`);
}

// ── Update existing recipe (creates new version) ──────────────
export async function updateRecipe(canonicalId: string, versionId: string, data: RecipeFormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Get current version number
  const { data: currentVersion } = await (supabase as any)
    .from('recipe_versions')
    .select('version_number')
    .eq('id', versionId)
    .single();

  const newVersionNumber = (currentVersion?.version_number ?? 1) + 1;

  // Create new version
  const { data: versionRaw2, error: versionError } = await (supabase as any)
    .from('recipe_versions')
    .insert({
      canonical_id:          canonicalId,
      parent_version_id:     versionId,
      version_number:        newVersionNumber,
      change_summary:        'Updated via editor',
      title:                 data.title.trim(),
      description:           data.description.trim() || null,
      cuisine:               data.cuisine.trim() || null,
      tags:                  data.tags ? data.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      base_servings:         data.servings,
      difficulty:            data.difficulty,
      total_time_seconds:    (data.totalTimeMinutes || 0) * 60,
      active_time_seconds:   (data.activeTimeMinutes || 0) * 60,
      passive_time_seconds:  Math.max(0, ((data.totalTimeMinutes || 0) - (data.activeTimeMinutes || 0))) * 60,
      is_canonical_version:  true,
    } as any)
    .select()
    .single();

  if (versionError || !versionRaw2) throw versionError;
  const version = versionRaw2 as any;

  // Mark previous version as non-canonical
  await (supabase as any)
    .from('recipe_versions')
    .update({ is_canonical_version: false })
    .eq('id', versionId);

  // Update canonical pointer
  await (supabase as any)
    .from('recipe_canonicals')
    .update({ current_version_id: version.id })
    .eq('id', canonicalId);

  // Re-insert ingredients, steps, equipment (same as create)
  for (let i = 0; i < data.ingredients.length; i++) {
    const ing = data.ingredients[i];
    if (!ing.name.trim() && !ing.ingredientId) continue;

    let ingredientId = ing.ingredientId;
    if (!ingredientId && ing.name.trim()) {
      const ingSlug = slugify(ing.name) + '-' + Date.now().toString(36).slice(-4);
      const { data: newIngRaw } = await (supabase as any)
        .from('ingredients')
        .insert({ slug: ingSlug, name: ing.name.trim(), category: 'other' })
        .select()
        .single();
      ingredientId = (newIngRaw as any)?.id;
    }
    if (!ingredientId) continue;

    await (supabase as any).from('version_ingredients').insert({
      version_id: version.id, ingredient_id: ingredientId,
      quantity_value: ing.quantityValue || 0, quantity_unit: ing.quantityUnit || 'g',
      prep_note: ing.prepNote.trim() || null, optional: ing.optional, order_index: i + 1,
    } as any);
  }

  for (let i = 0; i < data.steps.length; i++) {
    const step = data.steps[i];
    if (!step.instruction.trim()) continue;
    await (supabase as any).from('version_steps').insert({
      version_id: version.id, order_index: i + 1,
      step_type: step.stepType || 'human', instruction: step.instruction.trim(),
      group_label: step.groupLabel.trim() || null,
      duration_seconds: step.durationMinutes ? step.durationMinutes * 60 : null,
      temperature_celsius: step.temperatureCelsius || null,
    } as any);
  }

  for (const equipmentId of data.equipmentIds) {
    if (!equipmentId) continue;
    await (supabase as any).from('version_equipment').insert({
      version_id: version.id, equipment_id: equipmentId, required: true,
    } as any);
  }

  redirect(`/my/recipes`);
}

// ── Publish / unpublish ───────────────────────────────────────
export async function togglePublishRecipe(canonicalId: string, publish: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  await (supabase as any)
    .from('recipe_canonicals')
    .update({ is_published: publish })
    .eq('id', canonicalId)
    .eq('author_id', user.id);
}

// ── Delete recipe ─────────────────────────────────────────────
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

