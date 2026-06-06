// src/app/api/my/saved-recipes/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/my/saved-recipes — list saved recipes
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = supabase as any;

  const { data, error } = await db
    .from('saved_recipes')
    .select(`
      id,
      created_at,
      canonical_id,
      recipe_canonicals!canonical_id (
        slug,
        recipe_versions!current_version_id (
          title, cuisine, difficulty, total_time_seconds
        )
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch version data separately to avoid RLS join issues
  const result = await Promise.all((data ?? []).map(async (row: any) => {
    const canonical = row.recipe_canonicals;
    if (!canonical) return null;

    const v = Array.isArray(canonical.recipe_versions)
      ? canonical.recipe_versions[0]
      : canonical.recipe_versions;

    return {
      saveId:      row.id,
      canonicalId: row.canonical_id,
      slug:        canonical.slug,
      title:       v?.title ?? '(untitled)',
      cuisine:     v?.cuisine ?? null,
      difficulty:  v?.difficulty ?? 'medium',
      totalTime:   v?.total_time_seconds ?? 0,
      savedAt:     row.created_at,
    };
  }));

  return NextResponse.json(result.filter(Boolean));
}

// POST /api/my/saved-recipes — save a recipe
//
// The recipe page may pass a canonical id, a recipe_version id, OR a `recipes`
// (flattened mirror) id — the mirror's own canonical_id column is unpopulated,
// so we resolve whatever we're given to the true recipe_canonicals.id before
// saving. Makes save robust regardless of which id the caller has, independent
// of the unresolved recipes-mirror cleanup.
async function resolveCanonicalId(db: any, anyId: string): Promise<string | null> {
  // 1. Already a canonical?
  const c = await db.from('recipe_canonicals').select('id').eq('id', anyId).maybeSingle();
  if (c.data?.id) return c.data.id;

  // 2. A recipe_version id? → its canonical_id
  const v = await db.from('recipe_versions').select('canonical_id').eq('id', anyId).maybeSingle();
  if (v.data?.canonical_id) return v.data.canonical_id;

  // 3. A `recipes` mirror id? → its version → that version's canonical_id
  const r = await db.from('recipes').select('canonical_id, recipe_version_id').eq('id', anyId).maybeSingle();
  if (r.data?.canonical_id) return r.data.canonical_id;
  if (r.data?.recipe_version_id) {
    const rv = await db.from('recipe_versions').select('canonical_id').eq('id', r.data.recipe_version_id).maybeSingle();
    if (rv.data?.canonical_id) return rv.data.canonical_id;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { canonicalId } = await req.json();
  if (!canonicalId) return NextResponse.json({ error: 'canonicalId required' }, { status: 400 });

  const db = supabase as any;

  const resolved = await resolveCanonicalId(db, canonicalId);
  if (!resolved) {
    console.error('[saved-recipes] could not resolve canonical for id=%s', canonicalId);
    return NextResponse.json({ error: 'Recipe not found' }, { status: 404 });
  }

  const { data, error } = await db
    .from('saved_recipes')
    .upsert({ user_id: user.id, canonical_id: resolved }, { onConflict: 'user_id,canonical_id' })
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[saved-recipes] upsert failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, saveId: data?.id ?? null, canonicalId: resolved }, { status: 201 });
}
