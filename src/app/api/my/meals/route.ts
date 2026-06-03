// src/app/api/my/meals/route.ts
// Meals are recipes at composition_level='meal'. This route lists and creates them.
//   GET  — the caller's meals (canonicals where composition_level='meal', author=caller),
//          each with a component count.
//   POST — create an empty meal { title }. Creates a canonical at level 'meal' + a v1
//          recipe_version (so it has a title/servings home), points current_version_id,
//          and mirrors to the legacy recipes table (so existing display paths don't choke).
//          Components are added via /api/my/meals/[id] (PUT).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

// GET /api/my/meals
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
      recipe_versions!current_version_id ( title, cuisine, base_servings ),
      meal_component!meal_canonical_id ( id, component_type )
    `)
    .eq('author_id', user.id)
    .eq('composition_level', 'meal')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const meals = (data ?? []).map((r: any) => {
    const v = Array.isArray(r.recipe_versions) ? r.recipe_versions[0] : r.recipe_versions;
    const comps = r.meal_component ?? [];
    return {
      id:           r.id,
      slug:         r.slug,
      title:        v?.title ?? '(untitled meal)',
      cuisine:      v?.cuisine ?? null,
      servings:     v?.base_servings ?? null,
      isPublished:  r.is_published,
      createdAt:    r.created_at,
      componentCount: comps.length,
      dishes:  comps.filter((c: any) => c.component_type === 'dish').length,
      sides:   comps.filter((c: any) => c.component_type === 'side').length,
      drinks:  comps.filter((c: any) => c.component_type === 'drink').length,
    };
  });

  return NextResponse.json(meals);
}

// POST /api/my/meals  { title }
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const title = (body.title ?? '').trim() || 'New meal';
  const slug = slugify(title) + '-' + Date.now().toString(36);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  try {
    // Canonical at composition_level='meal'
    const { data: canonical, error: ce } = await db
      .from('recipe_canonicals')
      .insert({ slug, author_id: user.id, is_published: false, source: 'human_authored', composition_level: 'meal' })
      .select().single();
    if (ce) throw ce;

    // A v1 version gives the meal a title/servings home (no steps of its own yet —
    // the unified recipe is derived from components; meal-level steps come later).
    const { data: version, error: ve } = await db
      .from('recipe_versions')
      .insert({
        canonical_id:        canonical.id,
        version_number:      1,
        title,
        base_servings:       body.servings ?? null,
        difficulty:          'medium',
        total_time_seconds:  0,
        is_canonical_version: true,
      })
      .select().single();
    if (ve) throw ve;

    await db.from('recipe_canonicals').update({ current_version_id: version.id }).eq('id', canonical.id);

    // Mirror to legacy recipes table so any path that reads it doesn't 404.
    await db.from('recipes').insert({
      slug, title, is_published: false, author_id: user.id, version: 1,
      recipe_version_id: version.id, total_time_seconds: 0,
    });

    return NextResponse.json({ id: canonical.id, slug }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Unknown error' }, { status: 500 });
  }
}
