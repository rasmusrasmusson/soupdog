// src/app/api/my/recipes/[id]/publish/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const { publish }: { publish: boolean } = await req.json();
  const db = supabase as any;

  // Try updating recipe_canonicals directly (id might be canonical id)
  await db.from('recipe_canonicals')
    .update({ is_published: publish })
    .eq('id', id)
    .eq('author_id', user.id);

  // Try updating legacy recipes table directly
  await db.from('recipes')
    .update({ is_published: publish })
    .eq('id', id)
    .eq('author_id', user.id);

  // Also look up the slug from either table and sync both
  // First try: id is a recipes.id — get its slug and version id
  const { data: legacyRecipe } = await db.from('recipes')
    .select('slug, recipe_version_id')
    .eq('id', id)
    .single();

  if (legacyRecipe?.slug) {
    // Sync canonical via slug
    await db.from('recipe_canonicals')
      .update({ is_published: publish })
      .eq('slug', legacyRecipe.slug)
      .eq('author_id', user.id);
    // Sync all legacy rows with same slug
    await db.from('recipes')
      .update({ is_published: publish })
      .eq('slug', legacyRecipe.slug);
  }

  // Second try: id is a recipe_canonicals.id — get its slug
  const { data: canonical } = await db.from('recipe_canonicals')
    .select('slug')
    .eq('id', id)
    .single();

  if (canonical?.slug) {
    await db.from('recipes')
      .update({ is_published: publish })
      .eq('slug', canonical.slug);
  }

  return NextResponse.json({ ok: true });
}
