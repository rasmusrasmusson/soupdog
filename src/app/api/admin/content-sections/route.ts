// src/app/api/admin/content-sections/route.ts
//
// Save the repeatable sub-sections for one (entity, section_key).
// Strategy: replace-all — delete the existing rows for this entity+section,
// then insert the provided list in order. Simple and correct for a small
// admin-edited ordered list (no real users; concurrent edits not a concern).
//
// POST body: { entityType, entityId, sectionKey, items: [{ headline, image_url,
//              image_credit, body, bullets[] }] }   // order = array order

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const ADMIN_IDS = (process.env.SOUPDOG_ADMIN_ACCOUNT_IDS ??
  'bb02ae50-436c-4402-8c8c-447344e10151,1a0f72dd-f0a7-487c-9ecd-7ef898f8dabf')
  .split(',').map(s => s.trim()).filter(Boolean);

const ENTITY_TYPES = new Set(['ingredient', 'tool', 'technique']);

export async function POST(req: NextRequest) {
  const supabase = (await createClient()) as any;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !ADMIN_IDS.includes(user.id)) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 403 });
  }

  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }

  const { entityType, entityId, sectionKey, items } = body ?? {};
  if (!ENTITY_TYPES.has(entityType)) {
    return NextResponse.json({ error: 'Invalid entityType.' }, { status: 400 });
  }
  if (!entityId || typeof entityId !== 'string') {
    return NextResponse.json({ error: 'entityId required.' }, { status: 400 });
  }
  if (!sectionKey || typeof sectionKey !== 'string') {
    return NextResponse.json({ error: 'sectionKey required.' }, { status: 400 });
  }
  if (!Array.isArray(items)) {
    return NextResponse.json({ error: 'items must be an array.' }, { status: 400 });
  }

  // Delete existing rows for this entity+section.
  const { error: delErr } = await supabase
    .from('content_sections')
    .delete()
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('section_key', sectionKey);

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  // Normalise + insert in order. Skip wholly-empty rows.
  const rows = items
    .map((it: any, i: number) => ({
      entity_type: entityType,
      entity_id: entityId,
      section_key: sectionKey,
      sort_order: i,
      headline: (typeof it.headline === 'string' && it.headline.trim()) || null,
      image_url: (typeof it.image_url === 'string' && it.image_url.trim()) || null,
      image_credit: (typeof it.image_credit === 'string' && it.image_credit.trim()) || null,
      body: (typeof it.body === 'string' && it.body.trim()) || null,
      bullets: Array.isArray(it.bullets)
        ? it.bullets.map((b: any) => String(b).trim()).filter(Boolean)
        : (typeof it.bullets === 'string'
            ? it.bullets.split('\n').map((s: string) => s.trim()).filter(Boolean)
            : []),
      updated_at: new Date().toISOString(),
    }))
    .filter((r: any) => r.headline || r.body || r.image_url || r.bullets.length > 0);

  if (rows.length === 0) {
    // All rows empty = the author cleared the section. Deletion above already did it.
    return NextResponse.json({ sections: [] });
  }

  const { data, error } = await supabase
    .from('content_sections')
    .insert(rows)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ sections: data ?? [] });
}
