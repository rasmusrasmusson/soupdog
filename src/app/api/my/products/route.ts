// src/app/api/my/products/route.ts
// GET  /api/my/products        — list user's products
// POST /api/my/products        — create a product (ingredient with is_product=true)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

function uniqueSlug(base: string) {
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base}-${suffix}`;
}

// GET — list products created by this user
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = supabase as any;

  const { data, error } = await db
    .from('ingredients')
    .select(`
      id, slug, name, brand, barcode, net_weight_g,
      base_state, base_temp_celsius, packaging_type,
      source, confidence, is_verified,
      parent_id,
      created_at
    `)
    .eq('is_product', true)
    .eq('created_by', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}

// POST — create a product
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = supabase as any;
  const body = await req.json();

  const {
    name, brand, barcode, net_weight_g, serving_size_g,
    packaging_type, producer, country_of_origin,
    ingredient_list, allergens, additives,
    nutrition_per_100g, off_id,
    base_state, base_temp_celsius,
    parent_id, linked_canonical_id,
    source = 'human_authored',
    confidence = 1.0,
  } = body;

  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const baseSlug = slugify((brand ? `${brand}-` : '') + name);
  const slug = uniqueSlug(baseSlug);

  const { data, error } = await db
    .from('ingredients')
    .insert({
      slug,
      name,
      is_product:         true,
      brand:              brand              ?? null,
      barcode:            barcode            ?? null,
      net_weight_g:       net_weight_g       ?? null,
      serving_size_g:     serving_size_g     ?? null,
      packaging_type:     packaging_type     ?? null,
      producer:           producer           ?? null,
      country_of_origin:  country_of_origin  ?? null,
      ingredient_list:    ingredient_list    ?? null,
      allergens:          allergens          ?? null,
      additives:          additives          ?? null,
      nutrition_per_100g: nutrition_per_100g ?? null,
      off_id:             off_id             ?? null,
      base_state:         base_state         ?? 'ambient',
      base_temp_celsius:  base_temp_celsius  ?? null,
      parent_id:          parent_id          ?? null,
      linked_canonical_id: linked_canonical_id ?? null,
      source,
      confidence,
      category:           'other',
      created_by:         user.id,
    })
    .select('id, slug')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data, { status: 201 });
}
