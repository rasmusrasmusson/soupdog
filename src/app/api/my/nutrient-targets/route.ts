// src/app/api/my/nutrient-targets/route.ts
// Daily nutrient + energy targets for the account's self-person (Doc A Phase 0).
// Person-keyed (person_nutrient_targets), residency-scoped via person_access.
// GET → the targets row plus its cascade source/confidence (population-average
//       defaults when none set yet — the bottom rung of the knowledge cascade).
// PUT → upsert. A user-stated target is "known" (high confidence).
//
// This replaces the legacy nutrition_profiles read path. nutrition_profiles is
// no longer referenced anywhere in the app; its self rows were migrated onto
// the person spine in 2026-06-04_phase0_person_nutrient_targets.sql.

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

// Population-average default template (Doc A §5.1 / §11 "Default daily template").
// The gentle guess when we know nothing — the bottom rung of the cascade. These
// are deliberately conservative, goal-agnostic adult averages; every value is
// overwritten the moment the person states a real one.
const DEFAULTS = {
  daily_calories_kcal: 2000,
  daily_protein_g: 60,
  daily_carbs_g: 250,
  daily_fat_g: 70,
  daily_fiber_g: 30,
  daily_sodium_mg: 2300,
  source: 'population_average' as string,
  confidence: 0.3 as number,
};

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  const pid = await selfPersonId(db, user.id);
  if (!pid) return NextResponse.json({ targets: DEFAULTS, isDefault: true });

  const { data, error } = await db
    .from('person_nutrient_targets')
    .select(
      'daily_calories_kcal, daily_protein_g, daily_carbs_g, daily_fat_g, ' +
      'daily_fiber_g, daily_sodium_mg, source, confidence'
    )
    .eq('person_id', pid)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!data) return NextResponse.json({ targets: DEFAULTS, isDefault: true });
  return NextResponse.json({ targets: data, isDefault: false });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  const pid = await selfPersonId(db, user.id);
  if (!pid) return NextResponse.json({ error: 'No self-person found' }, { status: 404 });

  const b = await req.json();
  const num = (v: any) => (v === '' || v === null || v === undefined ? null : Number(v));

  const row = {
    person_id: pid,
    daily_calories_kcal: num(b.daily_calories_kcal),
    daily_protein_g: num(b.daily_protein_g),
    daily_carbs_g: num(b.daily_carbs_g),
    daily_fat_g: num(b.daily_fat_g),
    daily_fiber_g: num(b.daily_fiber_g),
    daily_sodium_mg: num(b.daily_sodium_mg),
    // A value the person typed is a "known"/stated target — high confidence.
    source: 'user_stated',
    confidence: 0.9,
    updated_at: new Date().toISOString(),
  };

  const { error } = await db
    .from('person_nutrient_targets')
    .upsert(row, { onConflict: 'person_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
