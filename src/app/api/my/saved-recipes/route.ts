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
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { canonicalId } = await req.json();
  if (!canonicalId) return NextResponse.json({ error: 'canonicalId required' }, { status: 400 });

  const db = supabase as any;
  const { error } = await db
    .from('saved_recipes')
    .upsert({ user_id: user.id, canonical_id: canonicalId }, { onConflict: 'user_id,canonical_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
