// src/app/api/my/saved-recipes/[canonicalId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// DELETE /api/my/saved-recipes/[canonicalId] — unsave a recipe
// The id may be a canonical / version / recipes-mirror id; resolve to the true
// canonical (the form the row was saved under) so the delete matches.
async function resolveCanonicalId(db: any, anyId: string): Promise<string | null> {
  const c = await db.from('recipe_canonicals').select('id').eq('id', anyId).maybeSingle();
  if (c.data?.id) return c.data.id;
  const v = await db.from('recipe_versions').select('canonical_id').eq('id', anyId).maybeSingle();
  if (v.data?.canonical_id) return v.data.canonical_id;
  const r = await db.from('recipes').select('canonical_id, recipe_version_id').eq('id', anyId).maybeSingle();
  if (r.data?.canonical_id) return r.data.canonical_id;
  if (r.data?.recipe_version_id) {
    const rv = await db.from('recipe_versions').select('canonical_id').eq('id', r.data.recipe_version_id).maybeSingle();
    if (rv.data?.canonical_id) return rv.data.canonical_id;
  }
  return null;
}

export async function DELETE(
  _: NextRequest,
  context: { params: Promise<{ canonicalId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { canonicalId } = await context.params;
  const db = supabase as any;
  const resolved = (await resolveCanonicalId(db, canonicalId)) ?? canonicalId;

  await db
    .from('saved_recipes')
    .delete()
    .eq('user_id', user.id)
    .eq('canonical_id', resolved);

  return NextResponse.json({ ok: true });
}
