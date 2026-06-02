// src/app/api/my/meal-plan/options/route.ts
// GET — recipe options for the Swap / Add-a-meal pickers.
// Returns existing recipes (id, title, cuisine, time). Optional ?q= filter.
// Simple list for v1 (no AI ranking here — that's the generator's job; this is
// the manual picker). Caller browses and chooses.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  const q = (req.nextUrl.searchParams.get('q') || '').trim().toLowerCase();

  const { data: rows, error } = await db
    .from('recipe_canonicals')
    .select(`
      id,
      recipe_versions!current_version_id ( title, cuisine, total_time_seconds )
    `)
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let options = (rows ?? []).map((r: any) => {
    const v = Array.isArray(r.recipe_versions) ? r.recipe_versions[0] : r.recipe_versions;
    return {
      id: r.id,
      title: v?.title ?? '(untitled)',
      cuisine: v?.cuisine ?? null,
      totalTimeMinutes: v?.total_time_seconds ? Math.round(v.total_time_seconds / 60) : null,
    };
  }).filter((o: any) => o.title && o.title !== '(untitled)');

  if (q) {
    options = options.filter((o: any) =>
      o.title.toLowerCase().includes(q) || (o.cuisine ?? '').toLowerCase().includes(q));
  }

  options.sort((a: any, b: any) => a.title.localeCompare(b.title));

  return NextResponse.json({ options });
}
