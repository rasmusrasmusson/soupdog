// src/app/api/my/meal-plan/meal/route.ts
// Mutations on meals for the caller's plan. v1 owner-placed path.
//   POST   — add a meal           { date, slot, recipeId, personIds? }
//   PATCH  — swap a meal's dish    { mealId, recipeId }
//   DELETE — remove a meal         { mealId }
//
// All scoped to people the caller can access (RLS also enforces). For add, the
// meal's owner_person_id is the caller's self-person (the plan being edited).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function selfPersonId(db: any, accountId: string): Promise<string | null> {
  const { data } = await db
    .from('person_access')
    .select('person_id')
    .eq('account_id', accountId)
    .eq('role', 'self')
    .is('revoked_at', null)
    .limit(1).single();
  return data?.person_id ?? null;
}

async function ownedIds(db: any, accountId: string): Promise<string[]> {
  const { data } = await db.rpc('owned_person_ids', { acc: accountId });
  return Array.isArray(data)
    ? data.map((r: any) => (typeof r === 'string' ? r : r.owned_person_ids ?? r.person_id ?? r))
    : [];
}

const VALID_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack', 'meal'];

// ── POST: add a meal ──
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  const body = await req.json().catch(() => ({}));
  const { date, slot, recipeId } = body;
  if (!date || !VALID_SLOTS.includes(slot) || !recipeId) {
    return NextResponse.json({ error: 'date, slot, recipeId required' }, { status: 400 });
  }

  const planPerson = await selfPersonId(db, user.id);
  if (!planPerson) return NextResponse.json({ error: 'No self person' }, { status: 400 });

  // recipe title for dish_name
  const { data: can } = await db
    .from('recipe_canonicals')
    .select('recipe_versions!current_version_id ( title )')
    .eq('id', recipeId).single();
  const ver = can && (Array.isArray(can.recipe_versions) ? can.recipe_versions[0] : can.recipe_versions);

  const { data: meal, error } = await db
    .from('meal')
    .insert({
      created_by: user.id,
      owner_person_id: planPerson,
      meal_date: date,
      slot,
      source: 'recipe',
      recipe_id: recipeId,
      dish_name: ver?.title ?? null,
    })
    .select('id').single();
  if (error || !meal) return NextResponse.json({ error: error?.message ?? 'Could not add meal' }, { status: 500 });

  // default participant = the plan's person (owner-placed → accepted)
  const personIds: string[] = Array.isArray(body.personIds) && body.personIds.length ? body.personIds : [planPerson];
  const owned = new Set([planPerson, ...(await ownedIds(db, user.id))]);
  for (const pid of personIds) {
    if (!owned.has(pid)) continue;   // v1: only people you own
    await db.from('meal_participant').insert({
      meal_id: meal.id, person_id: pid, status: 'accepted', placed_by: user.id,
    });
  }

  return NextResponse.json({ id: meal.id }, { status: 201 });
}

// ── PATCH: swap a meal's dish ──
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  const body = await req.json().catch(() => ({}));
  const { mealId, recipeId } = body;
  if (!mealId || !recipeId) return NextResponse.json({ error: 'mealId, recipeId required' }, { status: 400 });

  const { data: can } = await db
    .from('recipe_canonicals')
    .select('recipe_versions!current_version_id ( title )')
    .eq('id', recipeId).single();
  const ver = can && (Array.isArray(can.recipe_versions) ? can.recipe_versions[0] : can.recipe_versions);

  // RLS ensures the caller can only update meals they can access.
  const { error } = await db
    .from('meal')
    .update({ recipe_id: recipeId, dish_name: ver?.title ?? null, source: 'recipe', updated_at: new Date().toISOString() })
    .eq('id', mealId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// ── DELETE: remove a meal ──
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  const body = await req.json().catch(() => ({}));
  const { mealId } = body;
  if (!mealId) return NextResponse.json({ error: 'mealId required' }, { status: 400 });

  // meal_participant cascades on meal delete (FK on delete cascade).
  const { error } = await db.from('meal').delete().eq('id', mealId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
