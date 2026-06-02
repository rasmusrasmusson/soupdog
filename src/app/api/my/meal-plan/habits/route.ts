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

  const raw = (data?.slot_times ?? {}) as Record<string, any>;
  // surface the everyday ("default") times, tolerating legacy flat shape
  const hasNested = raw.default || raw.overrides || raw.rest_days;
  const def = hasNested ? raw.default ?? {} : raw;
  const slotTimes = { ...DEFAULTS, ...def };
  const isDefault = Object.keys(def ?? {}).length === 0;

  return NextResponse.json({
    personId,
    slotTimes,                 // everyday times (for editing UI later)
    restDays: raw.rest_days ?? [],
    overrides: raw.overrides ?? {},
    isDefault,
  });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  const personId = await selfPersonId(db, user.id);
  if (!personId) return NextResponse.json({ error: 'No self person' }, { status: 400 });

  const body = await req.json().catch(() => ({}));

  // Accept either the nested override-capable shape:
  //   { default:{...}, rest_days:[...], overrides:{...} }
  // or the legacy flat shape { slotTimes: { breakfast, lunch, dinner } }.
  const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  function cleanTimes(obj: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    if (obj && typeof obj === 'object') {
      for (const slot of NAMED) {
        const v = (obj as Record<string, unknown>)[slot];
        if (validTime(v)) out[slot] = v as string;
      }
    }
    return out;
  }

  let stored: Record<string, unknown>;
  if (body.default || body.overrides || body.rest_days) {
    stored = {
      default: cleanTimes(body.default),
      rest_days: Array.isArray(body.rest_days) ? body.rest_days.filter((d: unknown) => typeof d === 'string' && DOW.includes(d)) : [],
      overrides: cleanTimes(body.overrides),
    };
  } else {
    // legacy flat: store as { default: {...} } going forward
    stored = { default: cleanTimes(body.slotTimes) };
  }

  const { error } = await db
    .from('person_meal_prefs')
    .upsert(
      { person_id: personId, slot_times: stored, updated_at: new Date().toISOString() },
      { onConflict: 'person_id' },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ personId, slotTimes: stored });
}
