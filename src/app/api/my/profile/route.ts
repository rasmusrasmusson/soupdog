// src/app/api/my/profile/route.ts
// GET (load) + PUT (save) the logged-in user's profile.
// Phase 0: user_profiles remains the working store for Basic fields.
// We additionally sync display_name + date_of_birth onto the account's
// self-person. DOB lives on `person` (design 3.1: store birthday, not age).
//
// Hardened: looks up the existing self-person directly (no RPC dependency),
// and surfaces a sync failure instead of silently swallowing it.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const SELECT = 'id, display_name, unit_system, language, skill_level, allergies, dietary_restrictions, preferred_cuisines';

// Returns { id, error }. Tries an existing self grant first; only falls back
// to the provisioning RPC if none exists (covers brand-new pre-trigger accounts).
async function getSelfPersonId(db: any, accountId: string): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await db
    .from('person_access')
    .select('person_id')
    .eq('account_id', accountId)
    .eq('role', 'self')
    .is('revoked_at', null)
    .maybeSingle();

  if (error) return { id: null, error: `person_access lookup: ${error.message}` };
  if (data?.person_id) return { id: data.person_id, error: null };

  // No self-person yet → provision one.
  const { data: pid, error: rpcErr } = await db.rpc('provision_self_person', { acc: accountId });
  if (rpcErr) return { id: null, error: `provision_self_person: ${rpcErr.message}` };
  return { id: (pid as string) ?? null, error: null };
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

  let dateOfBirth: string | null = null;
  let fullName: string | null = null;
  let country: string | null = null;
  let avatarColor: string | null = null;
  let avatarInitials: string | null = null;
  const { id: pid } = await getSelfPersonId(db, user.id);
  if (pid) {
    const { data: person } = await db
      .from('person').select('date_of_birth, full_name, country, avatar_color, avatar_initials').eq('id', pid).maybeSingle();
    dateOfBirth = person?.date_of_birth ?? null;
    fullName = person?.full_name ?? null;
    country = person?.country ?? null;
    avatarColor = person?.avatar_color ?? null;
    avatarInitials = person?.avatar_initials ?? null;
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
      full_name: fullName,
      country: country,
      avatar_color: avatarColor,
      avatar_initials: avatarInitials,
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

  // Sync identity fields onto the self-person. Surface failures, don't swallow.
  const { id: pid, error: pidErr } = await getSelfPersonId(db, user.id);
  if (pidErr) {
    return NextResponse.json(
      { ok: true, warning: `Profile saved, but person sync failed: ${pidErr}` },
      { status: 200 },
    );
  }
  if (pid) {
    const personPatch: Record<string, unknown> = {
      display_name: displayName,
      updated_at: new Date().toISOString(),
    };
    if ('date_of_birth' in body) personPatch.date_of_birth = body.date_of_birth || null;
    if ('full_name' in body) personPatch.full_name = (body.full_name ?? '').trim() || null;
    if ('country' in body) personPatch.country = (body.country ?? '').trim() || null;
    if ('avatar_color' in body) personPatch.avatar_color = body.avatar_color || null;
    if ('avatar_initials' in body) {
      const raw = (body.avatar_initials ?? '').toString().trim().toUpperCase().slice(0, 3);
      personPatch.avatar_initials = raw || null;  // empty clears the override → derive from name
    }

    const { error: personErr } = await db.from('person').update(personPatch).eq('id', pid);
    if (personErr) {
      return NextResponse.json(
        { ok: true, warning: `Profile saved, but person update failed: ${personErr.message}` },
        { status: 200 },
      );
    }
  }

  return NextResponse.json({ ok: true });
}
