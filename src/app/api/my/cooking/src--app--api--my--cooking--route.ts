// src/app/api/my/cooking/route.ts
// Cooking-skills competency matrix for the account's self-person.
// GET  → { overall, areas: { area: level } }  (overall comes from user_profiles.skill_level)
// PUT  → upserts competency rows + overall skill_level.
//
// level: 0 none · 1 can follow a recipe · 2 confident · 3 can improvise/teach.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function selfPersonId(db: any, accountId: string): Promise<string | null> {
  const { data } = await db
    .from('person_access')
    .select('person_id')
    .eq('account_id', accountId)
    .eq('role', 'self')
    .is('revoked_at', null)
    .maybeSingle();
  return data?.person_id ?? null;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  const pid = await selfPersonId(db, user.id);
  const areas: Record<string, number> = {};
  if (pid) {
    const { data: rows, error } = await db
      .from('cooking_competency')
      .select('area, level')
      .eq('person_id', pid);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const r of rows ?? []) areas[r.area] = r.level;
  }

  const { data: prof } = await db
    .from('user_profiles').select('skill_level').eq('id', user.id).maybeSingle();

  return NextResponse.json({ overall: prof?.skill_level ?? 'medium', areas });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  const body = await req.json();
  const pid = await selfPersonId(db, user.id);
  if (!pid) return NextResponse.json({ error: 'No self-person found' }, { status: 404 });

  // Overall skill stays on user_profiles (used for quick filtering).
  if (body.overall) {
    await db.from('user_profiles').upsert(
      { id: user.id, skill_level: body.overall, updated_at: new Date().toISOString() },
      { onConflict: 'id' },
    );
  }

  // Per-area levels: upsert each provided area.
  const areas: Record<string, number> = body.areas ?? {};
  const rows = Object.entries(areas).map(([area, level]) => ({
    person_id: pid,
    area,
    level: Math.max(0, Math.min(3, Number(level) || 0)),
    updated_at: new Date().toISOString(),
  }));
  if (rows.length) {
    const { error } = await db
      .from('cooking_competency')
      .upsert(rows, { onConflict: 'person_id,area' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
