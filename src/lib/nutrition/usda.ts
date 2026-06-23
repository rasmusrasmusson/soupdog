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
// Branded excluded (we don't match base ingredients to branded products).
// Survey (FNDDS) excluded too: its parens/space break the search GET encoding
// (USDA 400s), AND it's estimate-of-estimate quality — Foundation/SR Legacy are
// the lab-analysed tiers we actually want.
const ACCEPTED_DATATYPES = ['Foundation', 'SR Legacy'];

// Words that signal a candidate is a blend / prepared / branded thing — never auto-import.
// Signals of a genuine BLEND / prepared product (not a plain food with
// qualifiers). Deliberately NARROW: "with peel", "canned", commas, "raw" are
// all normal in USDA plain-food names and must NOT be treated as blends.
const BLEND_SIGNALS = [
  ' and ',          // "Oil, corn, peanut, and olive" — a true multi-oil blend
  'blend', 'mixed', 'flavored', 'sweetened', 'baby food', 'babyfood',
  'nfs',            // "not further specified" survey rollups
];

export function looksLikeBlend(description: string): boolean {
  const d = description.toLowerCase();
  return BLEND_SIGNALS.some(s => d.includes(s));
}

const apiKey = () => {
  const k = process.env.USDA_FDC_API_KEY;
  if (!k) throw new Error('USDA_FDC_API_KEY is not set.');
  return k;
};

// Normalise a Soupdog ingredient name into a cleaner USDA search query.
// Fixes the main miss patterns: slash-variants ("Courgette / Zucchini"),
// qualifier prefixes ("freshly ground black pepper", "fresh mozzarella",
// "cold milk"), and "powder/ground" suffixes. Returns the cleaned query, or
// the original trimmed if cleaning would empty it.
export function normalizeIngredientName(name: string): string {
  let s = name.toLowerCase().trim();
  // Take the first option of a slash pair: "courgette / zucchini" -> "courgette"
  if (s.includes('/')) s = s.split('/')[0].trim();
  // Drop parenthetical notes: "dawadawa (fermented locust bean)" -> "dawadawa"
  s = s.replace(/\([^)]*\)/g, ' ').trim();
  // Strip leading qualifier words that hurt USDA matching.
  const STRIP_PREFIX = ['freshly ground', 'fresh', 'cold', 'hot', 'large', 'small',
    'whole', 'dried', 'ground', 'chopped', 'tinned', 'canned', 'cooked', 'raw',
    'organic', 'unsalted', 'salted', 'finely', 'roughly'];
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of STRIP_PREFIX) {
      if (s.startsWith(p + ' ')) { s = s.slice(p.length + 1).trim(); changed = true; }
    }
  }
  // Drop trailing " powder"/" flakes"/" leaves" descriptors.
  s = s.replace(/\b(powder|flakes|leaves|leaf|stalk|seeds|seed|sprigs|pods)\b/g, ' ').trim();
  s = s.replace(/\s+/g, ' ').trim();
  return s.length >= 2 ? s : name.trim();
}

// Search USDA → trimmed candidate list with marker nutrients.
export async function usdaSearch(query: string, pageSize = 50): Promise<UsdaCandidate[]> {
  // Send dataType=Foundation,SR Legacy so LAB-ANALYSED foods rank first —
  // otherwise thousands of Branded products bury the plain food (e.g. "apples"
  // returns only branded packages). The earlier 400 came from the parens in
  // "Survey (FNDDS)"; a plain space ("SR Legacy" → %20) is fine. Code filter
  // below stays as a backstop.
  const dataType = encodeURIComponent('Foundation,SR Legacy');
  const url =
    `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}` +
    `&dataType=${dataType}&pageSize=${pageSize}&api_key=${apiKey()}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    let detail = '';
    try { const body = await res.json(); detail = body?.error?.message ?? JSON.stringify(body).slice(0, 200); }
    catch { try { detail = (await res.text()).slice(0, 200); } catch {} }
    throw new Error(`USDA search failed (${res.status})${detail ? ': ' + detail : ''}.`);
  }
  const data = await res.json();
  const wanted = new Set(ACCEPTED_DATATYPES.map(d => d.toLowerCase()));
  const mapped = (data.foods ?? [])
    .filter((f: any) => wanted.has(String(f.dataType ?? '').toLowerCase()))
    .map((f: any) => {
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

  // Re-rank so the PLAIN / RAW whole food surfaces above prepared products.
  // IMPORTANT: USDA's canonical plain foods are comma-heavy ("Cucumber, with
  // peel, raw"; "Egg, whole, raw, fresh"), so we do NOT penalise commas or
  // "with" — doing so buried the correct answers. We only boost leading-word
  // + "raw", and gently demote clearly-prepared products.
  const q = query.toLowerCase().replace(/s\b/, ''); // crude singular ("apples"→"apple")
  const PRODUCTY = ['croissant', 'strudel', 'babyfood', 'baby food', 'juice',
    'pie', 'sweetened', 'candied', 'jam', 'jelly', 'chips', 'dessert', 'pastry'];
  const score = (c: UsdaCandidate): number => {
    const d = c.description.toLowerCase();
    let s = 0;
    if (d.startsWith(q)) s += 5;               // "Cucumber, …" leads with the word
    if (d.includes('raw')) s += 2;             // raw whole food
    if (PRODUCTY.some(p => d.includes(p))) s -= 5;
    if (c.dataType.toLowerCase().includes('foundation')) s += 1;
    return s;
  };
  return mapped.sort((a: UsdaCandidate, b: UsdaCandidate) => score(b) - score(a));
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
