// src/app/api/my/profile/route.ts
// GET (load) + PUT (save) the logged-in user's profile.
// Auth-scoped. Assumes user_profiles.id = auth user id (Supabase pattern).
// If your user_profiles has a separate user_id column, change the .eq('id', user.id)
// lines to .eq('user_id', user.id) in both handlers.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const SELECT = 'id, display_name, unit_system, language, skill_level, allergies, dietary_restrictions, preferred_cuisines';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  const { data, error } = await db
    .from('user_profiles')
    .select(SELECT)
    .eq('id', user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // No row yet → return an empty profile shell so the form can render + create on save.
  return NextResponse.json({
    profile: data ?? {
      id: user.id,
      display_name: '',
      unit_system: 'si',
      language: 'en',
      skill_level: 'medium',
      allergies: [],
      dietary_restrictions: [],
      preferred_cuisines: [],
    },
    email: user.email ?? null,
    isNew: !data,
  });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  const body = await req.json();

  // whitelist + coerce; arrays default to []
  const row = {
    id: user.id,
    display_name: (body.display_name ?? '').trim() || null,
    unit_system: body.unit_system ?? 'si',
    language: (body.language ?? '').trim() || 'en',
    skill_level: body.skill_level ?? 'medium',
    allergies: Array.isArray(body.allergies) ? body.allergies : [],
    dietary_restrictions: Array.isArray(body.dietary_restrictions) ? body.dietary_restrictions : [],
    preferred_cuisines: Array.isArray(body.preferred_cuisines) ? body.preferred_cuisines : [],
    updated_at: new Date().toISOString(),
  };

  // upsert: creates the row if it doesn't exist, updates it if it does
  const { error } = await db.from('user_profiles').upsert(row, { onConflict: 'id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
