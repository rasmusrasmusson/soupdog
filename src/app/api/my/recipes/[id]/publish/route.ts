// src/app/api/my/recipes/[id]/publish/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const publish: boolean = body.publish;

  // Cast to any to bypass Supabase generated types for new schema tables
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  await db
    .from('recipe_canonicals')
    .update({ is_published: publish })
    .eq('id', id)
    .eq('author_id', user.id);

  return NextResponse.json({ ok: true });
}
