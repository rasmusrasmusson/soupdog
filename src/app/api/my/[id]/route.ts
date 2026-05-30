// src/app/api/my/products/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET — load a single product for editing
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = supabase as any;
  const { data, error } = await db
    .from('ingredients')
    .select(`
      id, slug, name, brand, barcode, net_weight_g, serving_size_g,
      packaging_type, producer, country_of_origin,
      base_temp_celsius, ingredient_list, description,
      parent_id, off_id, source, confidence, is_verified
    `)
    .eq('id', id)
    .eq('is_product', true)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PUT — update a product
export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = supabase as any;
  const body = await req.json();

  const {
    name, brand, barcode, net_weight_g, serving_size_g,
    packaging_type, producer, country_of_origin,
    ingredient_list, description, base_temp_celsius,
    parent_id,
  } = body;

  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const { data, error } = await db
    .from('ingredients')
    .update({
      name:              name.trim(),
      brand:             brand?.trim()             || null,
      barcode:           barcode?.trim()           || null,
      net_weight_g:      net_weight_g              ?? null,
      serving_size_g:    serving_size_g            ?? null,
      packaging_type:    packaging_type            || null,
      producer:          producer?.trim()          || null,
      country_of_origin: country_of_origin?.trim() || null,
      ingredient_list:   ingredient_list?.trim()   || null,
      description:       description?.trim()       || null,
      base_temp_celsius: base_temp_celsius          ?? null,
      parent_id:         parent_id                 ?? null,
      updated_at:        new Date().toISOString(),
    })
    .eq('id', id)
    .eq('created_by', user.id)
    .eq('is_product', true)
    .select('id, slug')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE — remove a product
export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = supabase as any;
  const { error } = await db
    .from('ingredients')
    .delete()
    .eq('id', id)
    .eq('created_by', user.id)
    .eq('is_product', true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
