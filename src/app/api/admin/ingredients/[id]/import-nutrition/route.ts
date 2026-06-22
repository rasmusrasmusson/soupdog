// src/app/api/admin/ingredients/[id]/import-nutrition/route.ts
// Admin-only. Given an ingredient id (path) + a CONFIRMED USDA FDC id (body),
// fetches that food's full nutrient profile from FoodData Central, maps each
// nutrient onto our `nutrient` lookup via fdc_nutrient_id, and writes graded
// rows into ingredient_nutrient_value:
//   dataType 'Foundation' -> e2_expert ; else (SR Legacy, etc.) -> e1_literature.
// source_kind = 'usda_foundation' | 'usda_sr_legacy'. source_ref = FDC id.
// The resolved view then automatically prefers these over the e0/ai estimate.
//
// Slice 2A: the FDC id is passed in (manual match). Matching/curation is 2B.

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const ADMIN_IDS = (process.env.SOUPDOG_ADMIN_ACCOUNT_IDS
  ?? 'bb02ae50-436c-4402-8c8c-447344e10151,1a0f72dd-f0a7-487c-9ecd-7ef898f8dabf')
  .split(',').map(s => s.trim()).filter(Boolean);

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set — cannot write past RLS');
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// USDA returns some nutrients in multiple units/forms. For a given fdc_nutrient_id
// we accept the value but, where a unit is ambiguous, prefer the expected one.
// Energy (1008) must be KCAL (USDA also returns 1062 kJ — different id, so the
// fdc_nutrient_id join already excludes it; this is a belt-and-braces guard).
const EXPECTED_UNIT: Record<number, string> = { 1008: 'KCAL' };

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  // ── Auth gate ──────────────────────────────────────────────
  const server = await createServerClient();
  const { data: { user } } = await server.auth.getUser();
  if (!user || !ADMIN_IDS.includes(user.id)) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 403 });
  }

  const { id: ingredientId } = await context.params;
  const body = await req.json().catch(() => ({}));
  const fdcId = String(body.fdcId ?? '').trim();
  if (!fdcId) {
    return NextResponse.json({ error: 'Body must include fdcId.' }, { status: 400 });
  }

  const apiKey = process.env.USDA_FDC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'USDA_FDC_API_KEY is not set.' }, { status: 500 });
  }

  // ── Fetch the full food profile from USDA ──────────────────
  let food: any;
  try {
    const res = await fetch(
      `https://api.nal.usda.gov/fdc/v1/food/${encodeURIComponent(fdcId)}?api_key=${apiKey}`,
      { cache: 'no-store' }
    );
    if (!res.ok) {
      return NextResponse.json(
        { error: `USDA fetch failed (${res.status}) for FDC ${fdcId}.` },
        { status: 502 }
      );
    }
    food = await res.json();
  } catch (e: any) {
    return NextResponse.json({ error: `USDA fetch error: ${e?.message ?? e}` }, { status: 502 });
  }

  const dataType: string = food.dataType ?? '';
  const grade =
    dataType.toLowerCase().includes('foundation') ? 'e2_expert' : 'e1_literature';
  const sourceKind =
    dataType.toLowerCase().includes('foundation') ? 'usda_foundation' : 'usda_sr_legacy';

  const db = serviceClient() as any;

  // ── Map USDA nutrients onto our nutrient lookup via fdc_nutrient_id ─────────
  const { data: nutrients, error: nErr } = await db
    .from('nutrient')
    .select('id, key, unit, fdc_nutrient_id')
    .not('fdc_nutrient_id', 'is', null);
  if (nErr) return NextResponse.json({ error: nErr.message }, { status: 500 });

  const byFdc = new Map<number, any>();
  for (const n of (nutrients ?? [])) byFdc.set(Number(n.fdc_nutrient_id), n);

  // USDA payload: food.foodNutrients[].nutrient.{id,unitName} + .amount
  const rows: any[] = [];
  const matched: string[] = [];
  for (const fn of (food.foodNutrients ?? [])) {
    const usdaId = Number(fn?.nutrient?.id);
    const amount = fn?.amount;
    if (!usdaId || amount == null) continue;
    const ours = byFdc.get(usdaId);
    if (!ours) continue;                                   // nutrient we don't track — skip
    const unit = (fn?.nutrient?.unitName ?? '').toUpperCase();
    const expected = EXPECTED_UNIT[usdaId];
    if (expected && unit && unit !== expected) continue;   // wrong-unit duplicate — skip

    rows.push({
      ingredient_id:   ingredientId,
      nutrient_id:     ours.id,
      amount_per_100g: Number(amount),
      unit:            ours.unit,                          // store in our canonical unit
      evidence_grade:  grade,
      source_kind:     sourceKind,
      source_ref:      `FDC:${fdcId}`,
      measured_at:     null,
    });
    matched.push(ours.key);
  }

  if (rows.length === 0) {
    return NextResponse.json({
      error: 'No mappable nutrients found in this FDC food.',
      fdcId, dataType, description: food.description,
    }, { status: 422 });
  }

  // ── Upsert (one row per ingredient+nutrient+source_kind) ───────────────────
  const { error: upErr } = await db
    .from('ingredient_nutrient_value')
    .upsert(rows, { onConflict: 'ingredient_id,nutrient_id,source_kind' })
    .select('id');
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // Record the confirmed match on the ingredient (auditable, re-runnable).
  await db
    .from('ingredients')
    .update({ fdc_id: fdcId, fdc_matched_at: new Date().toISOString() })
    .eq('id', ingredientId);

  return NextResponse.json({
    ok: true,
    ingredientId,
    fdcId,
    dataType,
    description: food.description,
    grade,
    sourceKind,
    nutrientsImported: rows.length,
    nutrients: matched,
  });
}
