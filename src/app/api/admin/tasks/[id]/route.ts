// src/app/api/admin/tasks/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Solo-founder admin gate. Upgrade to an is_admin flag on the account later.
// These are AUTH account ids (auth.uid()), NOT person ids.
const ADMIN_IDS = (process.env.SOUPDOG_ADMIN_ACCOUNT_IDS
  ?? 'bb02ae50-436c-4402-8c8c-447344e10151,1a0f72dd-f0a7-487c-9ecd-7ef898f8dabf')
  .split(',').map(s => s.trim()).filter(Boolean);

// Whitelist of editable curation fields (never let the client set arbitrary columns).
const EDITABLE = new Set([
  'name', 'category', 'description', 'tips', 'common_mistakes',
  'completion_type', 'completion_target', 'completion_criterion',
  'heat_mechanism', 'heat_medium',
  'min_duration_seconds', 'max_duration_seconds',
  'typical_input_state', 'typical_output_state',
  'suggested_tool_slugs', 'is_verified',
]);

// enum guards (null allowed = clear the field)
const COMPLETION_TYPES = new Set(['time','core_temp','surface_temp','color','volume','mass','texture','structural','aroma','ph','subjective']);
const HEAT_MECHANISMS = new Set(['conduction','convection','radiation','dielectric','combination','none']);
const HEAT_MEDIA = new Set(['fat','water','steam','air','direct','none']);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!ADMIN_IDS.includes(user.id)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Body required' }, { status: 400 });
  }

  // build a clean patch from whitelisted fields only
  const patch: Record<string, any> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!EDITABLE.has(k)) continue;
    patch[k] = v;
  }

  // normalise empties → null; validate enums; coerce numbers/arrays
  const norm = (v: any) => (v === '' || v === undefined ? null : v);
  if ('completion_type' in patch) {
    patch.completion_type = norm(patch.completion_type);
    if (patch.completion_type && !COMPLETION_TYPES.has(patch.completion_type))
      return NextResponse.json({ error: `bad completion_type` }, { status: 400 });
  }
  if ('heat_mechanism' in patch) {
    patch.heat_mechanism = norm(patch.heat_mechanism);
    if (patch.heat_mechanism && !HEAT_MECHANISMS.has(patch.heat_mechanism))
      return NextResponse.json({ error: `bad heat_mechanism` }, { status: 400 });
  }
  if ('heat_medium' in patch) {
    patch.heat_medium = norm(patch.heat_medium);
    if (patch.heat_medium && !HEAT_MEDIA.has(patch.heat_medium))
      return NextResponse.json({ error: `bad heat_medium` }, { status: 400 });
  }
  for (const f of ['completion_target','completion_criterion','description','tips','common_mistakes','typical_input_state','typical_output_state','category','name']) {
    if (f in patch) patch[f] = norm(patch[f]);
  }
  for (const f of ['min_duration_seconds','max_duration_seconds']) {
    if (f in patch) {
      const n = patch[f] === '' || patch[f] == null ? null : Number(patch[f]);
      if (n != null && (!Number.isFinite(n) || n < 0))
        return NextResponse.json({ error: `bad ${f}` }, { status: 400 });
      patch[f] = n;
    }
  }
  if ('suggested_tool_slugs' in patch) {
    let arr = patch.suggested_tool_slugs;
    if (typeof arr === 'string') arr = arr.split(',').map((s: string) => s.trim()).filter(Boolean);
    patch.suggested_tool_slugs = Array.isArray(arr) && arr.length ? arr : null;
  }
  if ('is_verified' in patch) patch.is_verified = !!patch.is_verified;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No editable fields' }, { status: 400 });
  }
  patch.updated_at = new Date().toISOString();

  const { data, error } = await (supabase as any)
    .from('tasks').update(patch).eq('id', id).select().single();

  if (error) {
    console.error('[admin/tasks PATCH]', error);
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
  return NextResponse.json({ ok: true, task: data });
}
