// src/app/api/my/cooking-defaults/route.ts
// The caller's default participant set — "who I usually cook for".
//   GET  → { people: [{ personId, name, avatarColor, avatarInitials }] }
//          (lazily seeds the caller's self-person if the set is empty)
//   PUT  → body { personIds: string[] } replaces the set (access-checked)
// One set per account; first default is the user himself. Used to prefill the
// recipe people panel. SQL: cooking_default_participants.sql

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

async function hydrate(db: any, personIds: string[]) {
  if (personIds.length === 0) return [];
  const { data: persons } = await db
    .from('person')
    .select('id, display_name, full_name, avatar_color, avatar_initials')
    .in('id', personIds);
  const byId: Record<string, any> = {};
  for (const p of persons ?? []) byId[p.id] = p;
  // preserve input order
  return personIds
    .map((pid) => byId[pid])
    .filter(Boolean)
    .map((p) => ({
      personId: p.id,
      name: p.display_name || p.full_name || 'Someone',
      avatarColor: p.avatar_color ?? null,
      avatarInitials: p.avatar_initials ?? null,
    }));
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  const { data: rows } = await db
    .from('cooking_default_participants')
    .select('person_id, created_at')
    .eq('account_id', user.id)
    .order('created_at', { ascending: true });

  let personIds = (rows ?? []).map((r: any) => r.person_id);

  // lazily seed the self-person as the first default
  if (personIds.length === 0) {
    const self = await selfPersonId(db, user.id);
    if (self) {
      await db.from('cooking_default_participants')
        .insert({ account_id: user.id, person_id: self });
      personIds = [self];
    }
  }

  return NextResponse.json({ people: await hydrate(db, personIds) });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  let body: { personIds?: string[] } = {};
  try { body = await req.json(); } catch { /* empty */ }
  let personIds = Array.from(new Set((body.personIds ?? []).filter(Boolean)));

  // access: only persons the caller can access may be defaults
  if (personIds.length > 0) {
    const { data: grants } = await db
      .from('person_access')
      .select('person_id')
      .eq('account_id', user.id)
      .is('revoked_at', null)
      .in('person_id', personIds);
    const allowed = new Set((grants ?? []).map((g: any) => g.person_id));
    personIds = personIds.filter((pid) => allowed.has(pid));
  }

  // replace the set: clear, then insert
  const { error: delErr } = await db.from('cooking_default_participants').delete().eq('account_id', user.id);
  if (delErr) return NextResponse.json({ error: delErr.message, people: [] }, { status: 500 });
  if (personIds.length > 0) {
    const { error: insErr } = await db.from('cooking_default_participants')
      .insert(personIds.map((pid) => ({ account_id: user.id, person_id: pid })));
    if (insErr) return NextResponse.json({ error: insErr.message, people: [] }, { status: 500 });
  }

  return NextResponse.json({ people: await hydrate(db, personIds) });
}
