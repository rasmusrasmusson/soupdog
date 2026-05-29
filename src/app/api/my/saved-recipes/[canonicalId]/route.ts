// src/app/api/my/saved-recipes/[canonicalId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// DELETE /api/my/saved-recipes/[canonicalId] — unsave a recipe
export async function DELETE(
  _: NextRequest,
  context: { params: Promise<{ canonicalId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { canonicalId } = await context.params;
  await (supabase as any)
    .from('saved_recipes')
    .delete()
    .eq('user_id', user.id)
    .eq('canonical_id', canonicalId);

  return NextResponse.json({ ok: true });
}
