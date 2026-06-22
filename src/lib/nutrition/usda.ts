// src/lib/nutrition/usda.ts
// Shared USDA FoodData Central helpers, used by both the manual import route
// and the auto-matcher. Keeps fetch/map/import logic in one place.

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set — cannot write past RLS');
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Energy (1008) must be KCAL — USDA also returns 1062 kJ (different id, so the
// fdc_nutrient_id join already excludes it; belt-and-braces guard).
const EXPECTED_UNIT: Record<number, string> = { 1008: 'KCAL' };

export type UsdaCandidate = {
  fdcId: string;
  description: string;
  dataType: string;
  brand: string | null;
  markers: { kcal: number | null; fat: number | null; protein: number | null };
};

// Datatypes we accept for base ingredients, in preference order (richest/best first).
// Branded is intentionally excluded for base-ingredient matching.
const ACCEPTED_DATATYPES = ['Foundation', 'SR Legacy', 'Survey (FNDDS)'];

// Words that signal a candidate is a blend / prepared / branded thing — never auto-import.
const BLEND_SIGNALS = [
  ' and ', ',', 'blend', 'with ', 'reduced', 'low-fat', 'low fat', 'fat-free',
  'nfs', 'prepared', 'mix', 'flavored', 'sweetened', 'canned', 'sauce',
];

export function looksLikeBlend(description: string): boolean {
  const d = description.toLowerCase();
  // a bare comma is a weak signal (USDA uses "Oil, olive"), so only flag commas
  // when there are TWO+ (e.g. "Oil, corn, peanut, and olive").
  const commaCount = (d.match(/,/g) || []).length;
  if (commaCount >= 2) return true;
  return BLEND_SIGNALS.some(s => s !== ',' && d.includes(s));
}

const apiKey = () => {
  const k = process.env.USDA_FDC_API_KEY;
  if (!k) throw new Error('USDA_FDC_API_KEY is not set.');
  return k;
};

// Search USDA → trimmed candidate list with marker nutrients.
export async function usdaSearch(query: string, pageSize = 15): Promise<UsdaCandidate[]> {
  const url =
    `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}` +
    `&dataType=${encodeURIComponent(ACCEPTED_DATATYPES.join(','))}` +
    `&pageSize=${pageSize}&api_key=${apiKey()}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`USDA search failed (${res.status}).`);
  const data = await res.json();
  return (data.foods ?? []).map((f: any) => {
    const marker = (id: number) => {
      const hit = (f.foodNutrients ?? []).find((n: any) => Number(n.nutrientId) === id);
      return hit ? Number(hit.value) : null;
    };
    return {
      fdcId: String(f.fdcId),
      description: f.description ?? '',
      dataType: f.dataType ?? '',
      brand: f.brandOwner ?? null,
      markers: { kcal: marker(1008), fat: marker(1004), protein: marker(1003) },
    };
  });
}

// Fetch a full food profile, map nutrients onto our lookup, write graded rows,
// record the match. Returns a summary. `db` is a service-role client.
export async function importFdcNutrition(
  db: any,
  ingredientId: string,
  fdcId: string
): Promise<{ ok: boolean; error?: string; dataType?: string; description?: string;
            grade?: string; sourceKind?: string; nutrientsImported?: number; nutrients?: string[] }> {
  let food: any;
  try {
    const res = await fetch(
      `https://api.nal.usda.gov/fdc/v1/food/${encodeURIComponent(fdcId)}?api_key=${apiKey()}`,
      { cache: 'no-store' }
    );
    if (!res.ok) return { ok: false, error: `USDA fetch failed (${res.status}) for FDC ${fdcId}.` };
    food = await res.json();
  } catch (e: any) {
    return { ok: false, error: `USDA fetch error: ${e?.message ?? e}` };
  }

  const dataType: string = food.dataType ?? '';
  const isFoundation = dataType.toLowerCase().includes('foundation');
  const grade = isFoundation ? 'e2_expert' : 'e1_literature';
  const sourceKind = isFoundation ? 'usda_foundation' : 'usda_sr_legacy';

  const { data: nutrients, error: nErr } = await db
    .from('nutrient').select('id, key, unit, fdc_nutrient_id')
    .not('fdc_nutrient_id', 'is', null);
  if (nErr) return { ok: false, error: nErr.message };

  const byFdc = new Map<number, any>();
  for (const n of (nutrients ?? [])) byFdc.set(Number(n.fdc_nutrient_id), n);

  const rows: any[] = [];
  const matched: string[] = [];
  for (const fn of (food.foodNutrients ?? [])) {
    const usdaId = Number(fn?.nutrient?.id);
    const amount = fn?.amount;
    if (!usdaId || amount == null) continue;
    const ours = byFdc.get(usdaId);
    if (!ours) continue;
    const unit = (fn?.nutrient?.unitName ?? '').toUpperCase();
    const expected = EXPECTED_UNIT[usdaId];
    if (expected && unit && unit !== expected) continue;
    rows.push({
      ingredient_id: ingredientId, nutrient_id: ours.id,
      amount_per_100g: Number(amount), unit: ours.unit,
      evidence_grade: grade, source_kind: sourceKind,
      source_ref: `FDC:${fdcId}`, measured_at: null,
    });
    matched.push(ours.key);
  }

  if (rows.length === 0) {
    return { ok: false, error: 'No mappable nutrients found.', dataType, description: food.description };
  }

  const { error: upErr } = await db
    .from('ingredient_nutrient_value')
    .upsert(rows, { onConflict: 'ingredient_id,nutrient_id,source_kind' })
    .select('id');
  if (upErr) return { ok: false, error: upErr.message };

  await db.from('ingredients')
    .update({ fdc_id: fdcId, fdc_matched_at: new Date().toISOString() })
    .eq('id', ingredientId);

  return {
    ok: true, dataType, description: food.description, grade, sourceKind,
    nutrientsImported: rows.length, nutrients: matched,
  };
}
