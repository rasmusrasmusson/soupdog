// src/app/api/admin/nutrients/[key]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Solo-founder admin gate. AUTH account ids (auth.uid()), NOT person ids.
const ADMIN_IDS = (process.env.SOUPDOG_ADMIN_ACCOUNT_IDS
  ?? 'bb02ae50-436c-4402-8c8c-447344e10151,1a0f72dd-f0a7-487c-9ecd-7ef898f8dabf')
  .split(',').map(s => s.trim()).filter(Boolean);

// Whitelist of editable content fields (never let the client set key/category/unit/fdc id).
const EDITABLE = new Set([
  'name', 'summary', 'description', 'how_much', 'too_little', 'too_much',
  'food_sources_note', 'tips', 'aliases', 'rda_reference',
  'published', 'content_reviewed',
]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!ADMIN_IDS.includes(user.id)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Body required' }, { status: 400 });

  const patch: Record<string, any> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!EDITABLE.has(k)) continue;
    if (k === 'aliases') {
      patch[k] = Array.isArray(v) ? v.map(String).map(s => s.trim()).filter(Boolean)
        : typeof v === 'string' ? v.split(',').map(s => s.trim()).filter(Boolean) : [];
    } else if (k === 'published' || k === 'content_reviewed') {
      patch[k] = Boolean(v);
    } else {
      patch[k] = (typeof v === 'string' && v.trim() === '') ? null : v;
    }
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  const db = supabase as any;
  const { data, error } = await db
    .from('nutrient')
    .update(patch)
    .eq('key', key)
    .select('key')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Update blocked (not found or permissions)' }, { status: 404 });
  return NextResponse.json({ ok: true, key: data.key });
}
