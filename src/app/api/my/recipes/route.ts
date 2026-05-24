// src/app/api/my/recipes/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

// GET /api/my/recipes — list current user's recipes
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
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

// POST /api/my/recipes — create new recipe
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const data = await req.json();
  const slug = slugify(data.title) + '-' + Date.now().toString(36);

  try {
    // 1. Canonical
    const { data: canonical, error: ce } = await supabase
      .from('recipe_canonicals')
      .insert({ slug, author_id: user.id, is_published: false, source: 'human_authored' })
      .select().single();
    if (ce) throw ce;

    // 2. Version
    const { data: version, error: ve } = await supabase
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
        total_time_seconds:   (data.totalTimeMinutes ?? 0) * 60,
        active_time_seconds:  (data.activeTimeMinutes ?? 0) * 60,
        passive_time_seconds: Math.max(0, ((data.totalTimeMinutes ?? 0) - (data.activeTimeMinutes ?? 0))) * 60,
        is_canonical_version: true,
      })
      .select().single();
    if (ve) throw ve;

    // 3. Update pointer
    await supabase.from('recipe_canonicals').update({ current_version_id: version.id }).eq('id', canonical.id);

    // 4. Ingredients
    for (let i = 0; i < (data.ingredients ?? []).length; i++) {
      const ing = data.ingredients[i];
      if (!ing.name?.trim() && !ing.ingredientId) continue;
      let ingredientId = ing.ingredientId;
      if (!ingredientId && ing.name?.trim()) {
        const { data: newIng } = await supabase
          .from('ingredients')
          .insert({ slug: slugify(ing.name) + '-' + Date.now().toString(36).slice(-4), name: ing.name.trim(), category: 'other' })
          .select().single();
        ingredientId = newIng?.id;
      }
      if (!ingredientId) continue;
      await supabase.from('version_ingredients').insert({
        version_id: version.id, ingredient_id: ingredientId,
        quantity_value: ing.quantityValue ?? 0, quantity_unit: ing.quantityUnit ?? 'g',
        prep_note: ing.prepNote?.trim() || null, optional: ing.optional ?? false, order_index: i + 1,
      });
    }

    // 5. Steps
    for (let i = 0; i < (data.steps ?? []).length; i++) {
      const step = data.steps[i];
      if (!step.instruction?.trim()) continue;
      await supabase.from('version_steps').insert({
        version_id: version.id, order_index: i + 1,
        step_type: step.stepType ?? 'human', instruction: step.instruction.trim(),
        group_label: step.groupLabel?.trim() || null,
        duration_seconds: step.durationMinutes ? step.durationMinutes * 60 : null,
        temperature_celsius: step.temperatureCelsius || null,
      });
    }

    // 6. Equipment
    for (const equipmentId of (data.equipmentIds ?? [])) {
      if (!equipmentId) continue;
      await supabase.from('version_equipment').insert({ version_id: version.id, equipment_id: equipmentId, required: true });
    }

    // 7. Execution variant
    await supabase.from('execution_variants').insert({
      version_id: version.id, servings: data.servings ?? 4,
      unit_system: 'si', is_canonical_variant: true, author_id: user.id,
    });

    return NextResponse.json({ id: canonical.id, slug }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Unknown error' }, { status: 500 });
  }
}
