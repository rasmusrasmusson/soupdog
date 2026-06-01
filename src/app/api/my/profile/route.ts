// src/app/api/my/profile/route.ts
// GET (load) + PUT (save) the logged-in user's profile.
// Phase 0: user_profiles remains the working store for Basic fields.
// We additionally sync display_name (and now date_of_birth) onto the
// account's self-person so the identity spine stays in step. DOB lives on
// `person` (design 3.1: store birthday, not age).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const SELECT = 'id, display_name, unit_system, language, skill_level, allergies, dietary_restrictions, preferred_cuisines';

async function selfPersonId(db: any, accountId: string): Promise<string | null> {
  const { data } = await db
    .from('person_access')
    .select('person_id')
    .eq('account_id', accountId)
    .eq('role', 'self')
    .is('revoked_at', null)
    .maybeSingle();
  if (data?.person_id) return data.person_id;
  // provision if missing (pre-trigger accounts)
  const { data: pid } = await db.rpc('provision_self_person', { acc: accountId });
  return (pid as string) ?? null;
}

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

  // Pull date_of_birth from the self-person (new home for DOB).
  let dateOfBirth: string | null = null;
  const pid = await selfPersonId(db, user.id);
  if (pid) {
    const { data: person } = await db
      .from('person').select('date_of_birth').eq('id', pid).maybeSingle();
    dateOfBirth = person?.date_of_birth ?? null;
  }

  return NextResponse.json({
    profile: {
      ...(data ?? {
        id: user.id,
        display_name: '',
        unit_system: 'si',
        language: 'en',
        skill_level: 'medium',
        allergies: [],
        dietary_restrictions: [],
        preferred_cuisines: [],
      }),
      date_of_birth: dateOfBirth,
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
  const displayName = (body.display_name ?? '').trim() || null;

  const row = {
    id: user.id,
    display_name: displayName,
    unit_system: body.unit_system ?? 'si',
    language: (body.language ?? '').trim() || 'en',
    skill_level: body.skill_level ?? 'medium',
    allergies: Array.isArray(body.allergies) ? body.allergies : [],
    dietary_restrictions: Array.isArray(body.dietary_restrictions) ? body.dietary_restrictions : [],
    preferred_cuisines: Array.isArray(body.preferred_cuisines) ? body.preferred_cuisines : [],
    updated_at: new Date().toISOString(),
  };

  const { error } = await db.from('user_profiles').upsert(row, { onConflict: 'id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sync identity fields onto the self-person.
  const pid = await selfPersonId(db, user.id);
  if (pid) {
    const personPatch: Record<string, unknown> = {
      display_name: displayName,
      updated_at: new Date().toISOString(),
    };
    if ('date_of_birth' in body) personPatch.date_of_birth = body.date_of_birth || null;
    await db.from('person').update(personPatch).eq('id', pid);
  }

  return NextResponse.json({ ok: true });
}
