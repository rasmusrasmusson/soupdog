// src/app/api/my/meal-plan/participant/route.ts
// Add or remove a participant on a meal. v1: only people the caller OWNS
// (self + managed household members) — owner-placed → status 'accepted'.
//   POST   { mealId, personId }  — add
//   DELETE { mealId, personId }  — remove

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function ownedIds(db: any, accountId: string): Promise<string[]> {
  const { data } = await db.rpc('owned_person_ids', { acc: accountId });
  return Array.isArray(data)
    ? data.map((r: any) => (typeof r === 'string' ? r : r.owned_person_ids ?? r.person_id ?? r))
    : [];
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  const { mealId, personId } = await req.json().catch(() => ({}));
  if (!mealId || !personId) return NextResponse.json({ error: 'mealId, personId required' }, { status: 400 });

  const owned = new Set(await ownedIds(db, user.id));
  if (!owned.has(personId)) {
    return NextResponse.json({ error: 'You can only add people you manage' }, { status: 403 });
  }

  // upsert-ish: ignore if already there (unique meal_id+person_id)
  const { error } = await db
    .from('meal_participant')
    .insert({ meal_id: mealId, person_id: personId, status: 'accepted', placed_by: user.id });
  if (error && !String(error.message).toLowerCase().includes('duplicate')) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  const { mealId, personId } = await req.json().catch(() => ({}));
  if (!mealId || !personId) return NextResponse.json({ error: 'mealId, personId required' }, { status: 400 });

  const { error } = await db
    .from('meal_participant')
    .delete()
    .eq('meal_id', mealId)
    .eq('person_id', personId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
