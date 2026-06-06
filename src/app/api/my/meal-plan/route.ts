// src/app/api/my/meal-plan/route.ts
// GET — the caller's meal plan (their self-person's meals) for a date range.
// Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD (defaults: today .. today+13).
// Returns meals with slot, date, recipe (id/title/slug), and participant persons.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function ymd(d: Date): string { return d.toISOString().slice(0, 10); }

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // self person
  const { data: selfAccess } = await db
    .from('person_access')
    .select('person_id')
    .eq('account_id', user.id)
    .eq('role', 'self')
    .is('revoked_at', null)
    .limit(1)
    .single();
  const personId = selfAccess?.person_id;
  if (!personId) return NextResponse.json({ error: 'No self person' }, { status: 400 });

  const today = new Date();
  const defaultTo = new Date(today); defaultTo.setDate(today.getDate() + 13);
  const from = req.nextUrl.searchParams.get('from') || ymd(today);
  const to   = req.nextUrl.searchParams.get('to')   || ymd(defaultTo);

  const { data: meals, error } = await db
    .from('meal')
    .select(`
      id, meal_date, slot, source, dish_name, note, recipe_id, scheduled_time,
      recipe_canonicals!recipe_id ( id, slug,
        recipe_versions!current_version_id ( title, cuisine, total_time_seconds, base_servings )
      ),
      meal_participant ( id, status, person_id,
        person!person_id ( id, full_name, display_name, avatar_color, avatar_initials )
      )
    `)
    .eq('owner_person_id', personId)
    .gte('meal_date', from)
    .lte('meal_date', to)
    .order('meal_date', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const out = (meals ?? []).map((m: any) => {
    const can = Array.isArray(m.recipe_canonicals) ? m.recipe_canonicals[0] : m.recipe_canonicals;
    const ver = can && (Array.isArray(can.recipe_versions) ? can.recipe_versions[0] : can.recipe_versions);
    const participants = (m.meal_participant ?? []).map((p: any) => {
      const per = Array.isArray(p.person) ? p.person[0] : p.person;
      return {
        id: p.id,
        status: p.status,
        personId: p.person_id,
        name: per?.full_name || per?.display_name || 'Someone',
        avatarColor: per?.avatar_color ?? null,
        avatarInitials: per?.avatar_initials ?? null,
      };
    });
    return {
      id: m.id,
      date: m.meal_date,
      slot: m.slot,
      scheduledTime: m.scheduled_time ?? null,
      source: m.source,
      dishName: ver?.title || m.dish_name || 'Meal',
      cuisine: ver?.cuisine ?? null,
      totalTimeMinutes: ver?.total_time_seconds ? Math.round(ver.total_time_seconds / 60) : null,
      servings: ver?.base_servings ?? null,
      recipeId: m.recipe_id,
      recipeSlug: can?.slug ?? null,
      note: m.note ?? null,
      participants,
    };
  });

  return NextResponse.json({ personId, from, to, meals: out });
}
