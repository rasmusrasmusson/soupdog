// src/app/api/my/people/route.ts
// Manage the people an account owns (household members + self).
// A "household member" is just a person you own (access_level=owner).
// This is the general "manage a person" mechanism; sharing/delegation later
// reuses the same person + person_access primitives with different role/scope.
//
// GET    → list people this account can access (self first, then owned managed people)
// POST   → create a managed person + owner grant (role 'parent', full scope)
// PUT    → update a managed person's fields (+ their health allergies/conditions)
// DELETE → revoke access + delete the managed person (only managed, never self)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const FULL_SCOPE = null; // null scope = full access

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  const { data: grants, error } = await db
    .from('person_access')
    .select('person_id, role, access_level, scope, person:person_id(id, display_name, full_name, date_of_birth, country, is_managed, avatar_color)')
    .eq('account_id', user.id)
    .is('revoked_at', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const people = (grants ?? []).map((g: any) => {
    const per = Array.isArray(g.person) ? g.person[0] : g.person;
    return {
      person_id: g.person_id,
      role: g.role,
      access_level: g.access_level,
      is_self: g.role === 'self',
      display_name: per?.display_name ?? null,
      full_name: per?.full_name ?? null,
      date_of_birth: per?.date_of_birth ?? null,
      country: per?.country ?? null,
      avatar_color: per?.avatar_color ?? null,
      is_managed: per?.is_managed ?? false,
    };
  });
  // self first, then by name
  people.sort((a: any, b: any) => (a.is_self ? -1 : b.is_self ? 1 : (a.display_name ?? '').localeCompare(b.display_name ?? '')));

  // attach health allergies/conditions for managed people (for the editor + list display)
  const ids = people.map((p: any) => p.person_id);
  if (ids.length) {
    const { data: hp } = await db
      .from('health_profile')
      .select('person_id, allergies, medical_conditions')
      .in('person_id', ids);
    const byId: Record<string, any> = {};
    for (const h of hp ?? []) byId[h.person_id] = h;
    for (const p of people) {
      p.allergies = byId[p.person_id]?.allergies ?? [];
      p.medical_conditions = byId[p.person_id]?.medical_conditions ?? [];
    }
  }

  return NextResponse.json({ people });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  const b = await req.json();
  const displayName = (b.display_name ?? '').trim();
  if (!displayName) return NextResponse.json({ error: 'A name is required' }, { status: 400 });

  // 1. create the managed person
  const { data: person, error: pErr } = await db
    .from('person')
    .insert({
      display_name: displayName,
      full_name: (b.full_name ?? '').trim() || null,
      date_of_birth: b.date_of_birth || null,
      avatar_color: b.avatar_color || null,
      is_managed: true,
      residency_region: 'global',
    })
    .select('id')
    .single();
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  // 2. grant this account owner access (role parent, full scope)
  const { error: gErr } = await db.from('person_access').insert({
    account_id: user.id,
    person_id: person.id,
    access_level: 'owner',
    role: 'parent',
    scope: FULL_SCOPE,
    consent_basis: 'parental',
    granted_by: user.id,
  });
  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 });

  // 3. seed allergies/restrictions into health_profile if provided
  if ((Array.isArray(b.allergies) && b.allergies.length) || (Array.isArray(b.medical_conditions) && b.medical_conditions.length)) {
    await db.from('health_profile').upsert({
      person_id: person.id,
      allergies: Array.isArray(b.allergies) ? b.allergies : [],
      medical_conditions: Array.isArray(b.medical_conditions) ? b.medical_conditions : [],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'person_id' });
  }

  return NextResponse.json({ ok: true, person_id: person.id });
}

// helper: does this account own this person (and is it managed)?
async function ownsManaged(db: any, accountId: string, personId: string): Promise<{ ok: boolean; isSelf: boolean }> {
  const { data } = await db
    .from('person_access')
    .select('access_level, role')
    .eq('account_id', accountId)
    .eq('person_id', personId)
    .is('revoked_at', null)
    .maybeSingle();
  return { ok: !!data && data.access_level === 'owner', isSelf: data?.role === 'self' };
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  const b = await req.json();
  const personId = b.person_id;
  if (!personId) return NextResponse.json({ error: 'person_id required' }, { status: 400 });

  const { ok, isSelf } = await ownsManaged(db, user.id, personId);
  if (!ok) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  if (isSelf) return NextResponse.json({ error: 'Edit your own profile from the Profile page' }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ('display_name' in b) patch.display_name = (b.display_name ?? '').trim() || null;
  if ('full_name' in b) patch.full_name = (b.full_name ?? '').trim() || null;
  if ('date_of_birth' in b) patch.date_of_birth = b.date_of_birth || null;
  if ('country' in b) patch.country = (b.country ?? '').trim() || null;
  if ('avatar_color' in b) patch.avatar_color = b.avatar_color || null;

  const { error } = await db.from('person').update(patch).eq('id', personId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // allergies / conditions on health_profile
  if ('allergies' in b || 'medical_conditions' in b) {
    await db.from('health_profile').upsert({
      person_id: personId,
      allergies: Array.isArray(b.allergies) ? b.allergies : [],
      medical_conditions: Array.isArray(b.medical_conditions) ? b.medical_conditions : [],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'person_id' });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  const { searchParams } = new URL(req.url);
  const personId = searchParams.get('person_id');
  if (!personId) return NextResponse.json({ error: 'person_id required' }, { status: 400 });

  const { ok, isSelf } = await ownsManaged(db, user.id, personId);
  if (!ok) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  if (isSelf) return NextResponse.json({ error: 'You cannot remove yourself' }, { status: 400 });

  // person delete cascades to person_access + health_profile (FK on delete cascade)
  const { error } = await db.from('person').delete().eq('id', personId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
