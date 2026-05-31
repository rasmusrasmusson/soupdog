// src/app/api/my/recipes/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { calculateTotalSecondsForSave } from '@/lib/recipe-timing';

async function estimateNutrition(name: string): Promise<any | null> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `Estimate USDA nutrition per 100g for "${name}" (raw/uncooked unless it's a processed food). Respond with ONLY a JSON object, no markdown:\n{"calories":number,"protein":number,"fat":number,"saturated_fat":number,"carbohydrates":number,"sugar":number,"fiber":number,"sodium":number}`,
        }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.content?.[0]?.text ?? '';
    const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    return JSON.parse(clean);
  } catch { return null; }
}

// GET /api/my/recipes/[id]
export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const db = supabase as any;

  const { data, error } = await db
    .from('recipe_canonicals')
    .select(`
      id, slug, is_published,
      recipe_versions!current_version_id (
        id, title, description, cuisine, tags, base_servings,
        difficulty, total_time_seconds, active_time_seconds,
        version_steps (
          id, order_index, step_type, group_label, instruction,
          duration_seconds, temperature_celsius, appliance_settings
        ),
        version_ingredients (
          id, order_index, quantity_value, quantity_unit,
          food_state, prep_note, optional, step_id,
          ingredients!ingredient_id ( id, slug, name )
        ),
        version_equipment (
          id, required,
          equipment ( id, slug, name )
        )
      )
    `)
    .eq('id', id)
    .eq('author_id', user.id)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const rv = Array.isArray(data.recipe_versions) ? data.recipe_versions[0] : data.recipe_versions;

  const allVersionIngredients = rv?.version_ingredients ?? [];

  const steps = (rv?.version_steps ?? [])
    .sort((a: any, b: any) => a.order_index - b.order_index)
    .map((s: any) => {
      // Find ingredients linked to this step
      const stepIngs = allVersionIngredients
        .filter((vi: any) => vi.step_id === s.id)
        .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))
        .map((vi: any) => ({
          id:            vi.id,
          ingredientId:  vi.ingredients?.id ?? '',
          name:          vi.ingredients?.name ?? '',
          quantityValue: vi.quantity_value ?? 0,
          quantityUnit:  vi.quantity_unit ?? 'g',
          prepNote:      vi.prep_note ?? '',
        }));

      return {
        id:                 s.id,
        instruction:        s.instruction,
        durationMinutes:    Math.round((s.duration_seconds ?? 0) / 60),
        temperatureCelsius: s.temperature_celsius ?? 0,
        taskFamily:         s.appliance_settings?.taskFamily ?? undefined,
        taskId:             s.appliance_settings?.taskId ?? undefined,
        taskName:           s.appliance_settings?.taskName ?? undefined,
        taskType:           s.appliance_settings?.taskType ?? undefined,
        groupLabel:         s.group_label && s.group_label !== '__default__' ? s.group_label : '',
        stepIngredients:    stepIngs,
        stepTools:          s.appliance_settings?.stepTools ?? [],
        groupToolInstances: s.appliance_settings?.groupToolInstances ?? undefined,
      };
    });

  const ingredients = (rv?.version_ingredients ?? [])
    .sort((a: any, b: any) => a.order_index - b.order_index)
    .filter((vi: any) => !vi.step_id)
    .map((vi: any) => ({
      ingredientId:   vi.ingredients?.id ?? '',
      ingredientSlug: vi.ingredients?.slug ?? '',
      name:           vi.ingredients?.name ?? '',
      quantityValue:  vi.quantity_value,
      quantityUnit:   vi.quantity_unit,
      prepNote:       vi.prep_note ?? '',
      optional:       vi.optional ?? false,
    }));

  return NextResponse.json({
    canonicalId:       data.id,
    versionId:         rv?.id ?? '',
    slug:              data.slug,
    isPublished:       data.is_published,
    title:             rv?.title ?? '',
    description:       rv?.description ?? '',
    cuisine:           rv?.cuisine ?? '',
    tags:              (rv?.tags ?? []).join(', '),
    servings:          rv?.base_servings ?? 4,
    difficulty:        rv?.difficulty ?? 'medium',
    totalTimeMinutes:  Math.round((rv?.total_time_seconds ?? 0) / 60),
    activeTimeMinutes: Math.round((rv?.active_time_seconds ?? 0) / 60),
    ingredients,
    steps,
    equipmentIds:      (rv?.version_equipment ?? []).map((ve: any) => ve.equipment?.id).filter(Boolean),
  });
}

// PUT /api/my/recipes/[id]
export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const data = await req.json();
  const db = supabase as any;

  // Verify ownership
  const { data: canonical } = await db
    .from('recipe_canonicals')
    .select('id, slug')
    .eq('id', id)
    .eq('author_id', user.id)
    .single();

  if (!canonical) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const totalTimeSeconds = calculateTotalSecondsForSave(data.steps ?? []);

  // Get next version number — find max existing version and increment
  const { data: existingVersions } = await db
    .from('recipe_versions')
    .select('version_number')
    .eq('canonical_id', id)
    .order('version_number', { ascending: false })
    .limit(1);
  const nextVersion = ((existingVersions?.[0]?.version_number) ?? 0) + 1;

  // Create new version
  const { data: version, error: verErr } = await db
    .from('recipe_versions')
    .insert({
      canonical_id:         id,
      version_number:       nextVersion,
      title:                data.title?.trim(),
      description:          data.description?.trim() || null,
      cuisine:              data.cuisine?.trim() || null,
      tags:                 data.tags ? data.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
      base_servings:        data.servings ?? 4,
      difficulty:           data.difficulty ?? 'medium',
      total_time_seconds:   totalTimeSeconds,
      active_time_seconds:  (data.activeTimeMinutes ?? 0) * 60,
      passive_time_seconds: Math.max(0, totalTimeSeconds - (data.activeTimeMinutes ?? 0) * 60),
    })
    .select('id')
    .single();

  if (verErr) return NextResponse.json({ error: verErr.message }, { status: 500 });

  // Insert steps
  const allSteps = (data.steps ?? []);
  for (let i = 0; i < allSteps.length; i++) {
    const step = allSteps[i];
    const { data: insertedStep, error: se } = await db.from('version_steps').insert({
      version_id:          version.id,
      order_index:         i,
      step_type:           step.taskType ?? 'human',
      group_label:         (step.groupLabel?.trim() === '__default__' ? null : step.groupLabel?.trim()) || null,
      instruction:         step.instruction,
      duration_seconds:    (step.durationMinutes ?? 0) * 60,
      temperature_celsius: step.temperatureCelsius || null,
      appliance_settings:  {
        taskId:             step.taskId,
        taskName:           step.taskName,
        taskFamily:         step.taskFamily,
        taskType:           step.taskType,
        stepIngredients:    step.stepIngredients ?? [],
        stepTools:          step.stepTools ?? [],
        groupToolInstances: step.groupToolInstances,
      },
    })
    .select('id')
    .single();

    // Insert step + per-step version_ingredients
    if (se || !insertedStep) continue;
    const stepId = insertedStep.id;

    const stepIngs = step.stepIngredients ?? [];
    for (let j = 0; j < stepIngs.length; j++) {
      const si = stepIngs[j];
      const ingName = typeof si === 'string' ? si : si.name;
      if (!ingName?.trim()) continue;

      // Find or create ingredient
      const { data: existing } = await db.from('ingredients').select('id')
        .ilike('name', ingName.trim()).eq('is_product', false).limit(1).single();
      let ingId = existing?.id;
      if (!ingId) {
        const nutrition = await estimateNutrition(ingName);
        const slug = ingName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36).slice(-4);
        const { data: newIng } = await db.from('ingredients').insert({
          slug, name: ingName.trim(), category: 'other', is_product: false,
          ...(nutrition ? { nutrition_per_100g: nutrition } : {}),
        }).select('id').single();
        ingId = newIng?.id;
      }
      if (!ingId) continue;

      await db.from('version_ingredients').insert({
        version_id:    version.id,
        step_id:       stepId,
        ingredient_id: ingId,
        order_index:   j,
        quantity_value: typeof si === 'string' ? 0 : (si.quantityValue ?? 0),
        quantity_unit:  typeof si === 'string' ? 'g' : (si.quantityUnit ?? 'g'),
        prep_note:      typeof si === 'string' ? null : (si.prepNote || null),
        optional:       false,
        food_state:     'fresh',
      });
    }
  }

  // Update canonical to point to new version + sync legacy
  await db.from('recipe_canonicals').update({ current_version_id: version.id }).eq('id', id);
  await db.from('recipes').update({
    title:              data.title?.trim(),
    description:        data.description?.trim() || null,
    cuisine:            data.cuisine?.trim() || null,
    tags:               data.tags ? data.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
    servings:           data.servings ?? 4,
    difficulty:         data.difficulty ?? 'medium',
    total_time_seconds: totalTimeSeconds,
    recipe_version_id:  version.id,
  }).eq('slug', canonical.slug);

  return NextResponse.json({ id, slug: canonical.slug });
}

// DELETE /api/my/recipes/[id]
export async function DELETE(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const db = supabase as any;

  // Get the slug first so we can clean up legacy table
  const { data: canonical } = await db
    .from('recipe_canonicals')
    .select('slug')
    .eq('id', id)
    .eq('author_id', user.id)
    .single();

  if (!canonical) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Delete from legacy recipes table first
  await db.from('recipes').delete().eq('slug', canonical.slug);

  // Delete canonical (cascades to versions, steps, ingredients)
  const { error } = await db
    .from('recipe_canonicals')
    .delete()
    .eq('id', id)
    .eq('author_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
