// src/app/api/admin/composition/route.ts
//
// Manage an ingredient's Composition — the ingredients derived FROM it
// (pulp, juice, zest…), expressed via transformed_from_id on the derived row.
//
// POST   { parentId, action:'link', childId }                 → set child.transformed_from_id = parentId
// POST   { parentId, action:'create', name, blurb? }          → create new ingredient, transformed_from_id = parentId
// DELETE { childId }                                          → clear child.transformed_from_id
//
// Admin-gated (account ids). The "extraction recipe" is left as a hook:
// transformation_recipe_id stays null until a later auto-scaffold build.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const ADMIN_IDS = (process.env.SOUPDOG_ADMIN_ACCOUNT_IDS ??
  'bb02ae50-436c-4402-8c8c-447344e10151,1a0f72dd-f0a7-487c-9ecd-7ef898f8dabf')
  .split(',').map(s => s.trim()).filter(Boolean);

function slugify(name: string): string {
  return name.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
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

  const { parentId, action } = body ?? {};
  if (!parentId) return NextResponse.json({ error: 'parentId required.' }, { status: 400 });

  // Link an existing ingredient as derived-from parent.
  if (action === 'link') {
    const { childId } = body;
    if (!childId) return NextResponse.json({ error: 'childId required.' }, { status: 400 });
    if (childId === parentId) return NextResponse.json({ error: 'An ingredient cannot derive from itself.' }, { status: 400 });
    const { data, error } = await supabase
      .from('ingredients')
      .update({ transformed_from_id: parentId })
      .eq('id', childId)
      .select('id, slug, name, short_description, summary, image_url, transformation_recipe_id')
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Update blocked (permissions?) or ingredient not found.' }, { status: 400 });
    return NextResponse.json({ ingredient: shape(data) });
  }

  // Create a brand-new ingredient and link it as derived-from parent.
  if (action === 'create') {
    const name = (body.name ?? '').trim();
    if (!name) return NextResponse.json({ error: 'name required.' }, { status: 400 });
    const blurb = (body.blurb ?? '').trim() || null;

    // Ensure a unique slug.
    let base = slugify(name) || 'ingredient';
    let slug = base;
    for (let i = 2; i < 50; i++) {
      const { data: existing } = await supabase.from('ingredients').select('id').eq('slug', slug).maybeSingle();
      if (!existing) break;
      slug = `${base}-${i}`;
    }

    const { data, error } = await supabase
      .from('ingredients')
      .insert({
        name, slug,
        short_description: blurb,
        transformed_from_id: parentId,
        is_product: false,
      })
      .select('id, slug, name, short_description, summary, image_url, transformation_recipe_id')
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Create blocked (permissions?).' }, { status: 400 });
    return NextResponse.json({ ingredient: shape(data) });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const supabase = (await createClient()) as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !ADMIN_IDS.includes(user.id)) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 403 });
  }
  const childId = req.nextUrl.searchParams.get('childId');
  if (!childId) return NextResponse.json({ error: 'childId required.' }, { status: 400 });

  // Unlink only — never delete the ingredient (it may be used elsewhere).
  const { error } = await supabase
    .from('ingredients')
    .update({ transformed_from_id: null })
    .eq('id', childId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

function shape(c: any) {
  return {
    id: c.id, slug: c.slug, name: c.name,
    blurb: c.short_description || c.summary || null,
    imageUrl: c.image_url || null,
    hasRecipe: !!c.transformation_recipe_id,
  };
}
