// src/app/api/my/recipes/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

// GET /api/my/recipes/[id] — load recipe for editing
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: canonical, error } = await db
    .from('recipe_canonicals')
    .select(`
      id, slug, is_published,
      current_version_id,
      recipe_versions!current_version_id (
        id, version_number, title, description, cuisine, tags,
        base_servings, difficulty, total_time_seconds, active_time_seconds,
        version_ingredients (
          id, order_index, quantity_value, quantity_unit, prep_note, optional,
          ingredient_id,
          ingredients ( id, name )
        ),
        version_steps (
          id, order_index, step_type, instruction, group_label,
          duration_seconds, temperature_celsius
        ),
        version_equipment ( equipment_id )
      )
    `)
    .eq('id', id)
    .eq('author_id', user.id)
    .single();

  if (error || !canonical) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const v = Array.isArray(canonical.recipe_versions)
    ? canonical.recipe_versions[0]
    : canonical.recipe_versions;
  if (!v) return NextResponse.json({ error: 'No version found' }, { status: 404 });

  return NextResponse.json({
    canonicalId:       canonical.id,
    versionId:         v.id,
    title:             v.title,
    description:       v.description ?? '',
    cuisine:           v.cuisine ?? '',
    tags:              (v.tags ?? []).join(', '),
    servings:          v.base_servings,
    difficulty:        v.difficulty,
    totalTimeMinutes:  Math.round((v.total_time_seconds ?? 0) / 60),
    activeTimeMinutes: Math.round((v.active_time_seconds ?? 0) / 60),
    isPublished:       canonical.is_published,
    ingredients: (v.version_ingredients ?? [])
      .sort((a: any, b: any) => a.order_index - b.order_index)
      .map((i: any) => ({
        id:            i.id,
        ingredientId:  i.ingredient_id,
        name:          i.ingredients?.name ?? '',
        quantityValue: i.quantity_value,
        quantityUnit:  i.quantity_unit,
        prepNote:      i.prep_note ?? '',
        optional:      i.optional,
      })),
    steps: (v.version_steps ?? [])
      .sort((a: any, b: any) => a.order_index - b.order_index)
      .map((s: any) => ({
        id:                 s.id,
        stepType:           s.step_type,
        instruction:        s.instruction,
        groupLabel:         s.group_label ?? '',
        durationMinutes:    s.duration_seconds ? Math.round(s.duration_seconds / 60) : 0,
        temperatureCelsius: s.temperature_celsius ?? 0,
      })),
    equipmentIds: (v.version_equipment ?? []).map((e: any) => e.equipment_id),
  });
}

// PUT /api/my/recipes/[id] — save new version
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: canonical } = await db
    .from('recipe_canonicals')
    .select('id, current_version_id')
    .eq('id', id)
    .eq('author_id', user.id)
    .single();

  if (!canonical) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const data = await req.json();

  const { data: currentVersion } = await db
    .from('recipe_versions')
    .select('version_number')
    .eq('id', canonical.current_version_id)
    .single();

  const newVersionNumber = (currentVersion?.version_number ?? 1) + 1;

  const { data: version, error: ve } = await db
    .from('recipe_versions')
    .insert({
      canonical_id:         canonical.id,
      parent_version_id:    canonical.current_version_id,
      version_number:       newVersionNumber,
      change_summary:       'Updated via editor',
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

  if (ve || !version) return NextResponse.json({ error: ve?.message }, { status: 500 });

  await db.from('recipe_versions').update({ is_canonical_version: false }).eq('id', canonical.current_version_id);
  await db.from('recipe_canonicals').update({ current_version_id: version.id }).eq('id', canonical.id);

  for (let i = 0; i < (data.ingredients ?? []).length; i++) {
    const ing = data.ingredients[i];
    if (!ing.name?.trim() && !ing.ingredientId) continue;
    let ingredientId = ing.ingredientId;
    if (!ingredientId && ing.name?.trim()) {
      const { data: newIng } = await db
        .from('ingredients')
        .insert({ slug: slugify(ing.name) + '-' + Date.now().toString(36).slice(-4), name: ing.name.trim(), category: 'other' })
        .select().single();
      ingredientId = newIng?.id;
    }
    if (!ingredientId) continue;
    await db.from('version_ingredients').insert({
      version_id: version.id, ingredient_id: ingredientId,
      quantity_value: ing.quantityValue ?? 0, quantity_unit: ing.quantityUnit ?? 'g',
      prep_note: ing.prepNote?.trim() || null, optional: ing.optional ?? false, order_index: i + 1,
    });
  }

  for (let i = 0; i < (data.steps ?? []).length; i++) {
    const step = data.steps[i];
    if (!step.instruction?.trim()) continue;
    await db.from('version_steps').insert({
      version_id: version.id, order_index: i + 1,
      step_type: step.stepType ?? 'human', instruction: step.instruction.trim(),
      group_label: step.groupLabel?.trim() || null,
      duration_seconds: step.durationMinutes ? step.durationMinutes * 60 : null,
      temperature_celsius: step.temperatureCelsius || null,
    });
  }

  for (const equipmentId of (data.equipmentIds ?? [])) {
    if (!equipmentId) continue;
    await db.from('version_equipment').insert({ version_id: version.id, equipment_id: equipmentId, required: true });
  }

  return NextResponse.json({ id: canonical.id }, { status: 200 });
}

// DELETE /api/my/recipes/[id]
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('recipe_canonicals').delete().eq('id', id).eq('author_id', user.id);
  return NextResponse.json({ ok: true });
}
