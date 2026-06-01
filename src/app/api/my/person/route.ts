// src/app/api/my/person/route.ts
// The account's "self" person (Phase 0 identity spine).
// GET  → returns the self-person row (provisioning it if missing — covers
//        accounts created before the trigger was updated).
// PUT  → updates display_name / date_of_birth on the self-person.
//
// Phase 0 note: user_profiles is still the working store for Basic profile
// fields. This route only manages the person identity row. Later phases
// re-point the profile sections onto person.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  // Find the active self grant for this account.
  const { data: grant, error: gErr } = await db
    .from('person_access')
    .select('person_id')
    .eq('account_id', user.id)
    .eq('role', 'self')
    .is('revoked_at', null)
    .maybeSingle();
  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 });

  let personId: string | null = grant?.person_id ?? null;

  // No self-person yet (pre-trigger account) → provision via RPC.
  if (!personId) {
    const { data: pid, error: pErr } = await db.rpc('provision_self_person', { acc: user.id });
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
    personId = pid as string;
  }

  const { data: person, error: perr } = await db
    .from('person')
    .select('id, display_name, date_of_birth, residency_region, is_managed')
    .eq('id', personId)
    .maybeSingle();
  if (perr) return NextResponse.json({ error: perr.message }, { status: 500 });

  return NextResponse.json({ person, email: user.email ?? null });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  const body = await req.json();

  const { data: grant, error: gErr } = await db
    .from('person_access')
    .select('person_id')
    .eq('account_id', user.id)
    .eq('role', 'self')
    .is('revoked_at', null)
    .maybeSingle();
  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 });
  if (!grant?.person_id) {
    return NextResponse.json({ error: 'No self-person found' }, { status: 404 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ('display_name' in body) patch.display_name = (body.display_name ?? '').trim() || null;
  if ('date_of_birth' in body) patch.date_of_birth = body.date_of_birth || null; // 'YYYY-MM-DD'

  const { error } = await db.from('person').update(patch).eq('id', grant.person_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
