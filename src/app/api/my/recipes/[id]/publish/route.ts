// src/app/api/my/recipes/[id]/publish/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { publish }: { publish: boolean } = await req.json();
  const db = supabase as any;

  // Update new schema
  await db
    .from('recipe_canonicals')
    .update({ is_published: publish })
    .eq('id', id)
    .eq('author_id', user.id);

  // Sync to legacy mirror so search_index picks it up
  await db
    .from('recipes')
    .update({ is_published: publish })
    .eq('id', id);

  // Also try matching by slug in case IDs differ between tables
  const { data: canonical } = await db
    .from('recipe_canonicals')
    .select('slug')
    .eq('id', id)
    .single();

  if (canonical?.slug) {
    await db
      .from('recipes')
      .update({ is_published: publish })
      .eq('slug', canonical.slug);
  }

  return NextResponse.json({ ok: true });
}
