// src/app/api/admin/concepts/route.ts
//
// Manage the GLOBAL concept layer (scoped name bindings, global slice).
// A concept is a named binding; concept_member links it to an entity
// (ingredient | recipe) polymorphically via (entity_type, entity_id).
//
// GET    ?entityType=ingredient&entityId=…   → concepts bound to that entity
// POST   { action:'create', name, note? }    → create a global concept
// POST   { action:'bind', conceptId, entityType, entityId }   → bind concept→entity
// POST   { action:'createAndBind', name, entityType, entityId } → create + bind in one
// DELETE ?memberId=…                          → unbind (delete the member row)
//
// Admin-gated by ACCOUNT id (= auth.uid(), NOT person id). RLS also enforces.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const ADMIN_IDS = (process.env.SOUPDOG_ADMIN_ACCOUNT_IDS ??
  'bb02ae50-436c-4402-8c8c-447344e10151,1a0f72dd-f0a7-487c-9ecd-7ef898f8dabf')
  .split(',').map(s => s.trim()).filter(Boolean);

type EntityType = 'ingredient' | 'recipe';
const VALID_ENTITY: EntityType[] = ['ingredient', 'recipe'];

export async function GET(req: NextRequest) {
  const supabase = (await createClient()) as any;
  const entityType = req.nextUrl.searchParams.get('entityType');
  const entityId = req.nextUrl.searchParams.get('entityId');
  if (!entityType || !entityId || !VALID_ENTITY.includes(entityType as EntityType)) {
    return NextResponse.json({ error: 'entityType + entityId required.' }, { status: 400 });
  }
  const { data, error } = await supabase
    .from('concept_member')
    .select('id, position, concept:concept_id ( id, name, note )')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('position', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const concepts = (data ?? []).map((m: any) => {
    const c = Array.isArray(m.concept) ? m.concept[0] : m.concept;
    return { memberId: m.id, conceptId: c?.id, name: c?.name, note: c?.note ?? null };
  });
  return NextResponse.json({ concepts });
}

export async function POST(req: NextRequest) {
  const supabase = (await createClient()) as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !ADMIN_IDS.includes(user.id)) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 403 });
  }
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }
  const { action } = body ?? {};

  if (action === 'create' || action === 'createAndBind') {
    const name = (body.name ?? '').trim();
    if (!name) return NextResponse.json({ error: 'name required.' }, { status: 400 });
    const { data: concept, error } = await supabase
      .from('concept')
      .insert({ name, note: (body.note ?? '').trim() || null, scope: 'global' })
      .select('id, name, note')
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!concept) return NextResponse.json({ error: 'Create blocked (permissions?).' }, { status: 400 });

    if (action === 'create') return NextResponse.json({ concept });

    // createAndBind: also bind to the entity
    const bind = await bindMember(supabase, concept.id, body.entityType, body.entityId);
    if ('error' in bind) return NextResponse.json({ error: bind.error }, { status: bind.status });
    return NextResponse.json({ concept, member: bind.member });
  }

  if (action === 'bind') {
    const { conceptId, entityType, entityId } = body;
    if (!conceptId) return NextResponse.json({ error: 'conceptId required.' }, { status: 400 });
    const bind = await bindMember(supabase, conceptId, entityType, entityId);
    if ('error' in bind) return NextResponse.json({ error: bind.error }, { status: bind.status });
    return NextResponse.json({ member: bind.member });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const supabase = (await createClient()) as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !ADMIN_IDS.includes(user.id)) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 403 });
  }
  const memberId = req.nextUrl.searchParams.get('memberId');
  if (!memberId) return NextResponse.json({ error: 'memberId required.' }, { status: 400 });
  const { error } = await supabase.from('concept_member').delete().eq('id', memberId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

async function bindMember(supabase: any, conceptId: string, entityType: any, entityId: any):
  Promise<{ member: any } | { error: string; status: number }> {
  if (!entityType || !entityId || !VALID_ENTITY.includes(entityType)) {
    return { error: 'Valid entityType + entityId required.', status: 400 };
  }
  const { data, error } = await supabase
    .from('concept_member')
    .insert({ concept_id: conceptId, entity_type: entityType, entity_id: entityId })
    .select('id, concept:concept_id ( id, name, note )')
    .maybeSingle();
  if (error) {
    // unique violation = already bound; treat as benign
    if (String(error.code) === '23505') return { error: 'Already bound to this concept.', status: 409 };
    return { error: error.message, status: 500 };
  }
  if (!data) return { error: 'Bind blocked (permissions?).', status: 400 };
  const c = Array.isArray(data.concept) ? data.concept[0] : data.concept;
  return { member: { memberId: data.id, conceptId: c?.id, name: c?.name, note: c?.note ?? null } };
}
