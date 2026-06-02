// src/app/api/my/meal-plan/prefs/route.ts
// GET  — read the caller's self-person meal-plan prefs (activation, slots, horizon)
// PUT  — create/update prefs (this is how a plan gets ACTIVATED)
//
// v1 operates on the caller's self-person. (Planning for owned others uses the
// generate route with a personId; per-person prefs for managed persons can be
// added in a later slice.)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const VALID_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];

async function selfPersonId(db: any, accountId: string): Promise<string | null> {
  const { data } = await db
    .from('person_access')
    .select('person_id')
    .eq('account_id', accountId)
    .eq('role', 'self')
    .is('revoked_at', null)
    .limit(1)
    .single();
  return data?.person_id ?? null;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const personId = await selfPersonId(db, user.id);
  if (!personId) return NextResponse.json({ error: 'No self person' }, { status: 400 });

  const { data: prefs } = await db
    .from('person_meal_prefs')
    .select('plan_active, active_slots, horizon_days, activated_at')
    .eq('person_id', personId)
    .single();

  return NextResponse.json({
    personId,
    planActive: prefs?.plan_active ?? false,
    activeSlots: prefs?.active_slots ?? ['dinner'],
    horizonDays: prefs?.horizon_days ?? 5,
    activatedAt: prefs?.activated_at ?? null,
  });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const personId = await selfPersonId(db, user.id);
  if (!personId) return NextResponse.json({ error: 'No self person' }, { status: 400 });

  const body = await req.json().catch(() => ({}));

  // Sanitize slots
  let activeSlots: string[] = Array.isArray(body.activeSlots) ? body.activeSlots : ['dinner'];
  activeSlots = activeSlots.filter((s: any) => VALID_SLOTS.includes(s));
  if (activeSlots.length === 0) activeSlots = ['dinner'];

  const planActive = body.planActive !== false;          // default true on PUT (activation)
  const horizonDays = Math.min(10, Math.max(1, Number(body.horizonDays) || 5));

  const row = {
    person_id: personId,
    plan_active: planActive,
    active_slots: activeSlots,
    horizon_days: horizonDays,
    activated_at: planActive ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await db
    .from('person_meal_prefs')
    .upsert(row, { onConflict: 'person_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    personId,
    planActive,
    activeSlots,
    horizonDays,
  });
}
