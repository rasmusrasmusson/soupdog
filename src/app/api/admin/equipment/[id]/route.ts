// src/app/api/admin/equipment/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Admin account ids (account = auth.uid(), NOT person id). Overridable via env.
const ADMIN_IDS = (process.env.SOUPDOG_ADMIN_ACCOUNT_IDS ??
  'bb02ae50-436c-4402-8c8c-447344e10151,1a0f72dd-f0a7-487c-9ecd-7ef898f8dabf')
  .split(',').map(s => s.trim()).filter(Boolean);

// Fields an admin may edit on equipment. Everything else is ignored.
const TEXT_FIELDS = [
  'name', 'slug', 'summary', 'description', 'description_long',
  'brand', 'model_number', 'manufacturer', 'image_url', 'image_credit',
] as const;
const NUMBER_FIELDS = ['wattage', 'cavity_volume_litres'] as const;
const BOOL_FIELDS = ['connected', 'content_reviewed'] as const;
const ARRAY_FIELDS = ['uses'] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = (await createClient()) as any;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !ADMIN_IDS.includes(user.id)) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 403 });
  }

  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }

  const patch: Record<string, any> = {};

  for (const f of TEXT_FIELDS) {
    if (f in body) {
      const v = body[f];
      patch[f] = (typeof v === 'string' && v.trim() === '') ? null : v;
    }
  }
  for (const f of NUMBER_FIELDS) {
    if (f in body) {
      const v = body[f];
      patch[f] = (v === '' || v == null) ? null : Number(v);
      if (patch[f] != null && Number.isNaN(patch[f])) {
        return NextResponse.json({ error: `${f} must be a number.` }, { status: 400 });
      }
    }
  }
  for (const f of BOOL_FIELDS) {
    if (f in body) patch[f] = Boolean(body[f]);
  }
  for (const f of ARRAY_FIELDS) {
    if (f in body) {
      const v = body[f];
      patch[f] = Array.isArray(v)
        ? v.map((s: any) => String(s).trim()).filter(Boolean)
        : (typeof v === 'string'
            ? v.split('\n').map(s => s.trim()).filter(Boolean)
            : []);
    }
  }

  // Archive / unarchive: body.archived (boolean) maps to archived_at timestamp.
  if ('archived' in body) {
    patch.archived_at = body.archived ? new Date().toISOString() : null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('equipment')
    .update(patch)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    // Zero-row update — almost always RLS blocking the write for this account.
    return NextResponse.json(
      { error: 'Update blocked by permissions (no row updated).' },
      { status: 403 }
    );
  }

  return NextResponse.json({ tool: data });
}
