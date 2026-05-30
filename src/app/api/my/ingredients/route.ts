// src/app/api/my/ingredients/route.ts
// GET  — list ingredients + products created by this user
// POST — create an ingredient node (generic or product)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = supabase as any;

  const { data, error } = await db
    .from('ingredients')
    .select('id, slug, name, brand, barcode, is_product, category, created_at')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = supabase as any;
  const body = await req.json();

  const {
    name, description, category = 'other',
    is_product = false,
    // Product fields (only used when is_product=true)
    brand, barcode, net_weight_g, serving_size_g,
    packaging_type, producer, country_of_origin,
    ingredient_list, base_temp_celsius, off_id,
    // Taxonomy
    parent_id, linked_canonical_id,
    source = 'human_authored', confidence = 1.0,
  } = body;

  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const base = slugify((is_product && brand ? `${brand}-` : '') + name.trim());
  const slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;

  const { data, error } = await db
    .from('ingredients')
    .insert({
      slug, name: name.trim(), description: description?.trim() || null,
      category, is_product,
      brand:              is_product ? (brand?.trim()             || null) : null,
      barcode:            is_product ? (barcode?.trim()           || null) : null,
      net_weight_g:       is_product ? (net_weight_g              ?? null) : null,
      serving_size_g:     is_product ? (serving_size_g            ?? null) : null,
      packaging_type:     is_product ? (packaging_type            || null) : null,
      producer:           is_product ? (producer?.trim()          || null) : null,
      country_of_origin:  is_product ? (country_of_origin?.trim() || null) : null,
      ingredient_list:    is_product ? (ingredient_list?.trim()   || null) : null,
      base_temp_celsius:  is_product ? (base_temp_celsius         ?? null) : null,
      off_id:             is_product ? (off_id?.trim()            || null) : null,
      parent_id:          parent_id  ?? null,
      linked_canonical_id: linked_canonical_id ?? null,
      source, confidence,
      created_by: user.id,
    })
    .select('id, slug')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
