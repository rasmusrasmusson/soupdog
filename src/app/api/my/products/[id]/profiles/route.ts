// src/app/api/my/products/[id]/profiles/route.ts
// GET  — list cooking profiles for a product
// POST — add a cooking profile

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const supabase = await createClient();
  const db = supabase as any;

  const { data, error } = await db
    .from('product_cooking_profiles')
    .select(`
      id, ingredient_id,
      equipment_id, appliance_profile_id,
      food_state, initial_temp_celsius, time_out_of_storage_minutes,
      method, temperature_celsius, duration_seconds, power_watts,
      execution_steps, result_scores,
      outcome_rating, outcome_notes,
      source, confidence, is_verified,
      created_at,
      equipment ( id, name, brand, model_number )
    `)
    .eq('ingredient_id', id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: ingredientId } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = supabase as any;
  const body = await req.json();

  const {
    equipment_id,
    appliance_profile_id,
    food_state,
    initial_temp_celsius,
    time_out_of_storage_minutes,
    method,
    temperature_celsius,
    duration_seconds,
    power_watts,
    execution_steps,   // [{order, instruction, duration_seconds, temperature_celsius, appliance_settings}]
    result_scores,     // {overall: 0-100, texture: 0-100, colour: 0-100, ...}
    outcome_rating,
    outcome_notes,
    manufacturer_instructions,
    source = 'human_authored',
    confidence = 1.0,
  } = body;

  if (!equipment_id) {
    return NextResponse.json({ error: 'equipment_id required' }, { status: 400 });
  }

  const { data, error } = await db
    .from('product_cooking_profiles')
    .insert({
      ingredient_id:               ingredientId,
      equipment_id:                equipment_id,
      appliance_profile_id:        appliance_profile_id        ?? null,
      food_state:                  food_state                  ?? 'ambient',
      initial_temp_celsius:        initial_temp_celsius        ?? null,
      time_out_of_storage_minutes: time_out_of_storage_minutes ?? null,
      method:                      method                      ?? 'convection',
      temperature_celsius:         temperature_celsius         ?? null,
      duration_seconds:            duration_seconds            ?? null,
      power_watts:                 power_watts                 ?? null,
      execution_steps:             execution_steps             ?? null,
      result_scores:               result_scores               ?? null,
      outcome_rating:              outcome_rating              ?? null,
      outcome_notes:               outcome_notes               ?? null,
      manufacturer_instructions:   manufacturer_instructions   ?? null,
      source,
      confidence,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
