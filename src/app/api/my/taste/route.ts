// src/app/api/my/taste/route.ts
// Taste profile — backed by flavor_preferences (keyed to user_id, one row/account).
// GET → the row (empty defaults if none). PUT → upsert on user_id.
// Hard exclusions (allergies / dietary restrictions) are NOT stored here; the UI
// shows them read-only from health_profile / user_profiles.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const AXES = ['spice_tolerance', 'sweet_preference', 'sour_preference', 'umami_preference', 'bitter_tolerance'] as const;

const EMPTY = {
  liked_cuisines: [] as string[], disliked_cuisines: [] as string[],
  liked_ingredients: [] as string[], disliked_ingredients: [] as string[],
  liked_textures: [] as string[], disliked_textures: [] as string[],
  spice_tolerance: null, sweet_preference: null, sour_preference: null,
  umami_preference: null, bitter_tolerance: null,
};

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  const { data, error } = await db
    .from('flavor_preferences')
    .select('liked_cuisines, disliked_cuisines, liked_ingredients, disliked_ingredients, liked_textures, disliked_textures, spice_tolerance, sweet_preference, sour_preference, umami_preference, bitter_tolerance')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ taste: data ?? EMPTY });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  const b = await req.json();
  const arr = (v: any) => (Array.isArray(v) ? v : []);
  const axis = (v: any) => {
    if (v === '' || v === null || v === undefined) return null;
    return Math.max(0, Math.min(5, Number(v))); // 0–5 scale
  };

  const row: Record<string, unknown> = {
    user_id: user.id,
    liked_cuisines: arr(b.liked_cuisines),
    disliked_cuisines: arr(b.disliked_cuisines),
    liked_ingredients: arr(b.liked_ingredients),
    disliked_ingredients: arr(b.disliked_ingredients),
    liked_textures: arr(b.liked_textures),
    disliked_textures: arr(b.disliked_textures),
    updated_at: new Date().toISOString(),
  };
  for (const a of AXES) row[a] = axis(b[a]);

  const { error } = await db.from('flavor_preferences').upsert(row, { onConflict: 'user_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
