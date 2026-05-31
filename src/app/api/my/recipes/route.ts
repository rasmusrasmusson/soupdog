// src/app/api/my/recipes/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { calculateTotalSecondsForSave } from '@/lib/recipe-timing';


// Find existing ingredient by name (case-insensitive) or create new one
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
  } catch {
    return null;
  }
}

async function findOrCreateIngredient(db: any, name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  // Check if already exists
  const { data: existing } = await db
    .from('ingredients')
    .select('id')
    .ilike('name', trimmed)
    .eq('is_product', false)
    .limit(1)
    .single();
  if (existing?.id) return existing.id;
  // Estimate nutrition for new ingredient
  const nutrition = await estimateNutrition(trimmed);
  // Create new with nutrition data
  const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36).slice(-4);
  const { data: newIng } = await db
    .from('ingredients')
    .insert({
      slug,
      name: trimmed,
      category: 'other',
      is_product: false,
      ...(nutrition ? { nutrition_per_100g: nutrition } : {}),
    })
    .select('id')
    .single();
  return newIng?.id ?? null;
}

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

// GET /api/my/recipes
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data, error } = await db
    .from('recipe_canonicals')
    .select(`
      id, slug, is_published, created_at,
      recipe_versions!current_version_id (
        title, cuisine, difficulty, base_servings, total_time_seconds
      )
    `)
    .eq('author_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const recipes = (data ?? []).map((r: any) => {
    const v = Array.isArray(r.recipe_versions) ? r.recipe_versions[0] : r.recipe_versions;
    return {
      id:          r.id,
      slug:        r.slug,
      title:       v?.title ?? '(untitled)',
      cuisine:     v?.cuisine ?? null,
      difficulty:  v?.difficulty ?? 'medium',
      servings:    v?.base_servings ?? 4,
      totalTime:   v?.total_time_seconds ?? 0,
      isPublished: r.is_published,
      createdAt:   r.created_at,
    };
  });

  return NextResponse.json(recipes);
}

// POST /api/my/recipes
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const data = await req.json();
  const slug = slugify(data.title) + '-' + Date.now().toString(36);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  try {
    const { data: canonical, error: ce } = await db
      .from('recipe_canonicals')
      .insert({ slug, author_id: user.id, is_published: false, source: 'human_authored' })
      .select().single();
    if (ce) throw ce;

    // Auto-calculate total time from step durations (critical path)
    const calculatedTotalSeconds = calculateTotalSecondsForSave(data.steps ?? []);
    const totalTimeSeconds = calculatedTotalSeconds > 0
      ? calculatedTotalSeconds
      : (data.totalTimeMinutes ?? 0) * 60;

    const { data: version, error: ve } = await db
      .from('recipe_versions')
      .insert({
        canonical_id:         canonical.id,
        version_number:       1,
        title:                data.title?.trim(),
        description:          data.description?.trim() || null,
        cuisine:              data.cuisine?.trim() || null,
        tags:                 data.tags ? data.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
        base_servings:        data.servings ?? 4,
        difficulty:           data.difficulty ?? 'medium',
        total_time_seconds:   totalTimeSeconds,
        active_time_seconds:  (data.activeTimeMinutes ?? 0) * 60,
        passive_time_seconds: Math.max(0, totalTimeSeconds - (data.activeTimeMinutes ?? 0) * 60),
        is_canonical_version: true,
      })
      .select().single();
    if (ve) throw ve;

    await db.from('recipe_canonicals').update({ current_version_id: version.id }).eq('id', canonical.id);

    // ── Insert steps (with appliance_settings) + per-step ingredients ──
    const stepIngredientIds = new Set<string>();
    let ingOrderIndex = 0;  // global counter — unique across all steps

    for (let i = 0; i < (data.steps ?? []).length; i++) {
      const step = data.steps[i];
      // Skip steps with no content at all (no instruction, no task, no ingredients)
      const hasStepContent = step.instruction?.trim() || step.taskId || (step.stepIngredients ?? []).some((si: any) => si.name?.trim() || si.ingredientId);
      if (!hasStepContent) continue;

      // Store all step tools in appliance_settings JSONB so they round-trip on edit
      const tools = (step.stepTools ?? []).filter((t: any) => t.name?.trim() || t.equipmentId);
      const connectedTool = tools.find((t: any) => t.applianceId && t.applianceModeId);
      const applianceSettings = (tools.length > 0 || step.taskId || step.groupOutputQuantityValue)
        ? {
            taskId:     step.taskId     ?? null,
            taskName:   step.taskName   ?? null,
            taskFamily: step.taskFamily ?? null,
            groupOutputQuantityValue: step.groupOutputQuantityValue ?? null,
            groupOutputQuantityUnit:  step.groupOutputQuantityUnit  ?? null,
            stepTools: tools.map((t: any) => ({
              id:               t.id,
              instanceId:       t.instanceId,
              equipmentId:      t.equipmentId,
              name:             t.name,
              applianceId:      t.applianceId ?? null,
              applianceModeId:  t.applianceModeId ?? null,
              applianceSettings: t.applianceSettings ?? {},
            })),
            ...(connectedTool ? {
              applianceId:     connectedTool.applianceId,
              applianceModeId: connectedTool.applianceModeId,
              settings:        connectedTool.applianceSettings ?? {},
            } : {}),
          }
        : null;

      const { data: insertedStep, error: se } = await db
        .from('version_steps')
        .insert({
          version_id:          version.id,
          order_index:         i + 1,
          step_type:           step.stepType ?? 'human',
          instruction:         step.instruction?.trim() || '',
          group_label:         step.groupLabel?.trim() || null,
          duration_seconds:    step.durationMinutes ? step.durationMinutes * 60 : null,
          temperature_celsius: step.temperatureCelsius || null,
          appliance_settings:  applianceSettings,
        })
        .select('id')
        .single();

      if (se || !insertedStep) continue;
      const stepId = insertedStep.id;

      // Insert per-step ingredients linked to this step
      for (let j = 0; j < (step.stepIngredients ?? []).length; j++) {
        const si = step.stepIngredients[j];
        if (!si.name?.trim() && !si.ingredientId) continue;

        let ingredientId = si.ingredientId;
        if (!ingredientId && si.name?.trim()) {
          ingredientId = await findOrCreateIngredient(db, si.name);
        }
        if (!ingredientId) continue;

        stepIngredientIds.add(ingredientId);
        await db.from('version_ingredients').insert({
          version_id:     version.id,
          step_id:        stepId,           // ← link to step
          ingredient_id:  ingredientId,
          quantity_value: si.quantityValue ?? 0,
          quantity_unit:  si.quantityUnit ?? 'g',
          prep_note:      si.prepNote?.trim() || null,
          optional:       false,
          order_index:    ++ingOrderIndex,
        });
      }
    }

    // ── Top-level ingredients not already saved via a step ──
    for (let i = 0; i < (data.ingredients ?? []).length; i++) {
      const ing = data.ingredients[i];
      if (!ing.name?.trim() && !ing.ingredientId) continue;

      let ingredientId = ing.ingredientId;
      if (!ingredientId && ing.name?.trim()) {
        ingredientId = await findOrCreateIngredient(db, ing.name);
      }
      if (!ingredientId || stepIngredientIds.has(ingredientId)) continue;

      await db.from('version_ingredients').insert({
        version_id:     version.id,
        // step_id intentionally null — this is the aggregate list row
        ingredient_id:  ingredientId,
        quantity_value: ing.quantityValue ?? 0,
        quantity_unit:  ing.quantityUnit ?? 'g',
        prep_note:      ing.prepNote?.trim() || null,
        optional:       ing.optional ?? false,
        order_index:    ++ingOrderIndex,
      });
    }

    for (const equipmentId of (data.equipmentIds ?? [])) {
      if (!equipmentId) continue;
      await db.from('version_equipment').insert({ version_id: version.id, equipment_id: equipmentId, required: true });
    }

    await db.from('execution_variants').insert({
      version_id: version.id, servings: data.servings ?? 4,
      unit_system: 'si', is_canonical_variant: true, author_id: user.id,
    });

    // ── Mirror to legacy recipes table ──
    await db.from('recipes').insert({
      slug,
      title:                data.title?.trim(),
      description:          data.description?.trim() || null,
      cuisine:              data.cuisine?.trim() || null,
      tags:                 data.tags ? data.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
      servings:             data.servings ?? 4,
      difficulty:           data.difficulty ?? 'medium',
      total_time_seconds:   totalTimeSeconds,
      active_time_seconds:  (data.activeTimeMinutes ?? 0) * 60,
      passive_time_seconds: Math.max(0, totalTimeSeconds - (data.activeTimeMinutes ?? 0) * 60),
      is_published:         false,
      author_id:            user.id,
      version:              1,
      recipe_version_id:    version.id,
    });

    return NextResponse.json({ id: canonical.id, slug }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Unknown error' }, { status: 500 });
  }
}
