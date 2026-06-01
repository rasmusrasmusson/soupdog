// src/app/api/my/health/route.ts
// Health profile for the account's self-person (per-person, residency-scoped).
// GET → the health_profile row (empty defaults if none yet).
// PUT → upsert. Allergies live HERE (single source of truth; Taste shows them read-only).

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

const EMPTY = {
  height_cm: null, weight_kg: null, sex_at_birth: null,
  activity_level: null, allergies: [] as string[], medical_conditions: [] as string[],
};

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  const pid = await selfPersonId(db, user.id);
  if (!pid) return NextResponse.json({ health: EMPTY });

  const { data, error } = await db
    .from('health_profile')
    .select('height_cm, weight_kg, sex_at_birth, activity_level, allergies, medical_conditions')
    .eq('person_id', pid)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ health: data ?? EMPTY });
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
  const SEX = ['female', 'male', 'unspecified'];
  const ACT = ['sedentary', 'light', 'moderate', 'active', 'very_active'];

  const row = {
    person_id: pid,
    height_cm: num(b.height_cm),
    weight_kg: num(b.weight_kg),
    sex_at_birth: SEX.includes(b.sex_at_birth) ? b.sex_at_birth : null,
    activity_level: ACT.includes(b.activity_level) ? b.activity_level : null,
    allergies: Array.isArray(b.allergies) ? b.allergies : [],
    medical_conditions: Array.isArray(b.medical_conditions) ? b.medical_conditions : [],
    updated_at: new Date().toISOString(),
  };

  const { error } = await db.from('health_profile').upsert(row, { onConflict: 'person_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
