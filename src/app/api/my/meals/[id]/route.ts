// src/app/api/my/meals/[id]/route.ts
// Load / update / delete a single meal (a canonical at composition_level='meal').
//   GET    — meal meta + its ordered components (each with the sub-recipe's title/
//            cuisine/time/servings, for the editor).
//   PUT    — replace the meal's components and meta. Body:
//            { title?, servings?, components: [{ componentCanonicalId, componentType, position, servingsTarget?, note? }] }
//            Components are validated to be the caller's own canonicals.
//   DELETE — remove the meal (cascades meal_component; legacy mirror removed too).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/my/meals/[id]
export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: meal, error } = await db
    .from('recipe_canonicals')
    .select(`
      id, slug, is_published, composition_level,
      recipe_versions!current_version_id ( title, cuisine, base_servings )
    `)
    .eq('id', id)
    .eq('author_id', user.id)
    .eq('composition_level', 'meal')
    .single();

  if (error || !meal) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const v = Array.isArray(meal.recipe_versions) ? meal.recipe_versions[0] : meal.recipe_versions;

  // Components, ordered, with the sub-recipe's current-version meta.
  const { data: comps } = await db
    .from('meal_component')
    .select(`
      id, component_type, position, servings_target, note, component_canonical_id,
      recipe_canonicals!component_canonical_id (
        id, slug,
        recipe_versions!current_version_id ( title, cuisine, total_time_seconds, base_servings )
      )
    `)
    .eq('meal_canonical_id', id)
    .order('position', { ascending: true });

  const components = (comps ?? []).map((c: any) => {
    const can = Array.isArray(c.recipe_canonicals) ? c.recipe_canonicals[0] : c.recipe_canonicals;
    const cv = can && (Array.isArray(can.recipe_versions) ? can.recipe_versions[0] : can.recipe_versions);
    return {
      id:                 c.id,
      componentCanonicalId: c.component_canonical_id,
      componentType:      c.component_type,
      position:           c.position,
      servingsTarget:     c.servings_target ?? null,
      note:               c.note ?? null,
      title:              cv?.title ?? '(untitled)',
      cuisine:            cv?.cuisine ?? null,
      totalTimeMinutes:   cv?.total_time_seconds ? Math.round(cv.total_time_seconds / 60) : null,
      baseServings:       cv?.base_servings ?? null,
      slug:               can?.slug ?? null,
    };
  });

  return NextResponse.json({
    id:          meal.id,
    slug:        meal.slug,
    isPublished: meal.is_published,
    title:       v?.title ?? '',
    cuisine:     v?.cuisine ?? null,
    servings:    v?.base_servings ?? null,
    components,
  });
}

// PUT /api/my/meals/[id]
export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const body = await req.json().catch(() => ({}));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // Ownership + it must be a meal.
  const { data: canonical } = await db
    .from('recipe_canonicals')
    .select('id, slug, current_version_id, composition_level')
    .eq('id', id)
    .eq('author_id', user.id)
    .single();
  if (!canonical || canonical.composition_level !== 'meal') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Update meta on the current version (title / servings) if provided.
  if (canonical.current_version_id && (body.title != null || body.servings != null)) {
    const patch: any = {};
    if (body.title != null)    patch.title = String(body.title).trim() || 'Untitled meal';
    if (body.servings != null) patch.base_servings = body.servings;
    await db.from('recipe_versions').update(patch).eq('id', canonical.current_version_id);
    await db.from('recipes').update({
      ...(patch.title ? { title: patch.title } : {}),
    }).eq('slug', canonical.slug);
  }

  // Replace components if provided.
  if (Array.isArray(body.components)) {
    // Validate the referenced canonicals are the caller's own and not the meal itself.
    const ids: string[] = body.components
      .map((c: any) => c.componentCanonicalId)
      .filter(Boolean);
    let valid = new Set<string>();
    if (ids.length) {
      const { data: owned } = await db
        .from('recipe_canonicals')
        .select('id')
        .eq('author_id', user.id)
        .in('id', ids);
      valid = new Set((owned ?? []).map((r: any) => r.id));
    }

    // Clear and re-insert (small lists; simplest correct approach).
    await db.from('meal_component').delete().eq('meal_canonical_id', id);

    const VALID_TYPES = new Set(['dish', 'side', 'drink']);
    let pos = 0;
    for (const c of body.components) {
      const cid = c.componentCanonicalId;
      if (!cid || cid === id || !valid.has(cid)) continue;          // own canonicals only, never self
      const type = VALID_TYPES.has(c.componentType) ? c.componentType : 'dish';
      const { error: insErr } = await db.from('meal_component').insert({
        meal_canonical_id:      id,
        component_canonical_id: cid,
        component_type:         type,
        position:               c.position ?? pos,
        servings_target:        c.servingsTarget ?? null,
        note:                   c.note?.trim() || null,
      });
      // Unique(meal,component) — ignore a duplicate silently, keep going.
      if (!insErr) pos++;
    }
  }

  return NextResponse.json({ id, slug: canonical.slug });
}

// DELETE /api/my/meals/[id]
export async function DELETE(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: canonical } = await db
    .from('recipe_canonicals')
    .select('slug, composition_level')
    .eq('id', id)
    .eq('author_id', user.id)
    .single();
  if (!canonical || canonical.composition_level !== 'meal') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // meal_component cascades on canonical delete (FK on delete cascade).
  await db.from('recipes').delete().eq('slug', canonical.slug);
  const { error } = await db
    .from('recipe_canonicals').delete().eq('id', id).eq('author_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
