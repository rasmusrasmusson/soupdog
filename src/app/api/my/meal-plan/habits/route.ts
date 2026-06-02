// src/app/api/my/meal-plan/habits/route.ts
// GET / PUT the caller's self-person habitual meal times (slot_times on
// person_meal_prefs). These drive scheduled_time when meals are created.
// Shape: { breakfast: "07:30", lunch: "12:30", dinner: "19:00" }
// Snack / generic 'meal' intentionally have no habitual time.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const DEFAULTS: Record<string, string> = { breakfast: '07:30', lunch: '12:30', dinner: '19:00' };
const NAMED = ['breakfast', 'lunch', 'dinner'];

// "HH:MM" 24h, basic sanity
function validTime(s: unknown): s is string {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

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

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  const personId = await selfPersonId(db, user.id);
  if (!personId) return NextResponse.json({ error: 'No self person' }, { status: 400 });

  const { data } = await db
    .from('person_meal_prefs')
    .select('slot_times')
    .eq('person_id', personId)
    .single();

  // merge stored over defaults so the UI always has a value to show
  const stored = (data?.slot_times ?? {}) as Record<string, string>;
  const slotTimes = { ...DEFAULTS, ...stored };

  return NextResponse.json({ personId, slotTimes, isDefault: !data?.slot_times || Object.keys(stored).length === 0 });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  const personId = await selfPersonId(db, user.id);
  if (!personId) return NextResponse.json({ error: 'No self person' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const incoming = (body.slotTimes ?? {}) as Record<string, unknown>;

  // keep only valid named-slot times
  const clean: Record<string, string> = {};
  for (const slot of NAMED) {
    if (validTime(incoming[slot])) clean[slot] = incoming[slot] as string;
  }

  // ensure a prefs row exists; upsert slot_times (don't disturb other fields)
  const { error } = await db
    .from('person_meal_prefs')
    .upsert(
      { person_id: personId, slot_times: clean, updated_at: new Date().toISOString() },
      { onConflict: 'person_id' },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ personId, slotTimes: { ...DEFAULTS, ...clean } });
}
