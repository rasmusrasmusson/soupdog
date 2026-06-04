// src/lib/demand/aggregate-and-match.ts
// Demand Model (Doc A) · Phase 1 · the rest of the headline value:
//   1. occasion share  — daily requirement → this meal's slice (fixed-fraction
//                         stand-in until day-tracking exists in Phase 2)
//   2. aggregate        — combine N participants into a table requirement,
//                         option C: additive nutrients summed, satiety per-person,
//                         constraint nutrients (sodium) carried but deferred
//   3. score            — closeness of a candidate meal to the table requirement
//   4. plate            — split the chosen dish into a whole-portion per person
//
// Pure logic. Reads requirements produced by resolve-requirement.ts and recipe
// nutrition in the shape recipe_versions.nutrition_per_serving uses (calories,
// protein, carbohydrates, fat, fiber, sodium — note the names differ from the
// resolver's, bridged by FIELD_MAP below).

import type { PersonRequirement, ResolvedField } from './resolve-requirement';

// ---------------------------------------------------------------------------
// 1. Occasion share — Doc A §5.1. A meal delivers a slice of the day. Until we
// track the running day (Phase 2), use fixed per-slot fractions of the daily
// target. PLACEHOLDER weights — another §11 [OPEN] ("how occasion shares are
// set before we know the day"); editable here in one place.
// ---------------------------------------------------------------------------

export const SLOT_FRACTION: Record<string, number> = {
  breakfast: 0.25,
  lunch: 0.35,
  dinner: 0.40,
  snack: 0.10,
  meal: 0.33, // generic / unnamed occasion
};

export function occasionFraction(slot: string): number {
  return SLOT_FRACTION[slot] ?? SLOT_FRACTION.meal;
}

// ---------------------------------------------------------------------------
// The fields we aggregate, and how each behaves (option C).
// 'additive'   → summed across the table, then plated.
// 'constraint' → carried but NOT optimised in Phase 1 (deferred).
// satiety is handled separately (per person), so it is not in this list.
// ---------------------------------------------------------------------------

const ADDITIVE_FIELDS = ['energy_kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g'] as const;
type AdditiveField = typeof ADDITIVE_FIELDS[number];

// Bridge resolver field names → recipe nutrition_per_serving keys.
const FIELD_MAP: Record<AdditiveField, string> = {
  energy_kcal: 'calories',
  protein_g: 'protein',
  carbs_g: 'carbohydrates',
  fat_g: 'fat',
  fiber_g: 'fiber',
};

// ---------------------------------------------------------------------------
// 2. Table requirement — aggregate participants for ONE occasion.
// ---------------------------------------------------------------------------

export interface ParticipantOccasionNeed {
  personId: string;
  personaId: string;
  /** additive needs for THIS occasion (daily × slot fraction). */
  needs: Record<AdditiveField, number>;
  /** per-person satiety target for this occasion (0..1). near-constraint. */
  satietyNeed: number;
  /** weakest confidence among this person's core fields. */
  confidence: number;
}

export interface TableRequirement {
  slot: string;
  participants: ParticipantOccasionNeed[];
  /** summed additive needs across everyone — what one shared dish should carry. */
  tableTotals: Record<AdditiveField, number>;
  /** every participant must end up satisfied — the max individual satiety need. */
  satietyFloor: number;
  /** honest overall confidence = the weakest participant. */
  confidence: number;
  /** deferred constraint fields, surfaced so the UI/notes can say "not yet". */
  deferred: string[];
}

function fieldVal(f: ResolvedField): number {
  return typeof f.value === 'number' ? f.value : 0;
}

/** Turn a person's daily requirement into their share of this occasion. */
export function participantOccasionNeed(
  req: PersonRequirement,
  slot: string,
): ParticipantOccasionNeed {
  const frac = occasionFraction(slot);
  const needs = {
    energy_kcal: fieldVal(req.energy_kcal) * frac,
    protein_g: fieldVal(req.protein_g) * frac,
    carbs_g: fieldVal(req.carbs_g) * frac,
    fat_g: fieldVal(req.fat_g) * frac,
    fiber_g: fieldVal(req.fiber_g) * frac,
  } as Record<AdditiveField, number>;

  return {
    personId: req.personId,
    personaId: req.personaId,
    needs,
    satietyNeed: fieldVal(req.satiety_need),
    confidence: req.overallConfidence,
  };
}

/** Aggregate N participants into one table requirement (option C). */
export function aggregateTable(
  reqs: PersonRequirement[],
  slot: string,
): TableRequirement {
  const participants = reqs.map((r) => participantOccasionNeed(r, slot));

  const tableTotals = {
    energy_kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0,
  } as Record<AdditiveField, number>;

  for (const p of participants) {
    for (const f of ADDITIVE_FIELDS) tableTotals[f] += p.needs[f];
  }

  const satietyFloor = participants.length
    ? Math.max(...participants.map((p) => p.satietyNeed))
    : 0;
  const confidence = participants.length
    ? Math.min(...participants.map((p) => p.confidence))
    : 0;

  return {
    slot,
    participants,
    tableTotals,
    satietyFloor,
    confidence,
    deferred: ['sodium_mg'], // constraint nutrient — carried, not optimised in P1
  };
}

// ---------------------------------------------------------------------------
// 3. Closeness score — how well a candidate meal fits the table requirement.
// ---------------------------------------------------------------------------

export interface CandidateMeal {
  id: string;               // recipe/meal canonical id
  title: string;
  baseServings: number;     // recipe_versions.base_servings
  /** nutrition_per_serving JSONB (calories, protein, carbohydrates, fat, fiber, sodium). */
  perServing: Record<string, number | undefined>;
  /** the variant/recipe quality signal, if known (execution_variants.confidence). */
  variantConfidence?: number | null;
}

export interface MealScore {
  mealId: string;
  title: string;
  /** 0..1, higher = better fit. */
  score: number;
  /** how much of the dish (in "base servings") best covers the table. */
  recommendedServings: number;
  /** per-additive-field: table need vs what the dish delivers at that scale. */
  coverage: Record<AdditiveField, { need: number; delivered: number; ratio: number }>;
  /** satiety check — does the recommended amount plausibly satisfy everyone? */
  satietyOk: boolean;
  notes: string[];
}

/**
 * Score a candidate. The dish is scaled to the servings that best match the
 * table's DOMINANT additive need (energy), then we measure how well that scale
 * covers the other additive fields. Satiety-first: a dish that can't plausibly
 * fill the table (too little energy even at all its servings) is penalised hard.
 *
 * This is intentionally simple and legible for Phase 1 — a closeness heuristic,
 * not an optimiser. The weighting is a [OPEN] to tune with real data.
 */
export function scoreMeal(
  meal: CandidateMeal,
  table: TableRequirement,
): MealScore {
  const notes: string[] = [];
  const perKcal = meal.perServing[FIELD_MAP.energy_kcal] ?? 0;

  // Scale to match table energy (the dominant additive need). Guard div-by-0.
  let recommendedServings: number;
  if (perKcal > 0) {
    recommendedServings = table.tableTotals.energy_kcal / perKcal;
  } else {
    recommendedServings = meal.baseServings || table.participants.length || 1;
    notes.push('No per-serving energy data; servings estimated from headcount.');
  }
  // Don't recommend an absurd number of servings; cap at 2× headcount-ish.
  const cap = Math.max(table.participants.length * 2, meal.baseServings || 1);
  if (recommendedServings > cap) {
    recommendedServings = cap;
    notes.push('Dish is light for this table; capped the portion suggestion.');
  }
  recommendedServings = Math.max(recommendedServings, 0.5);

  // Coverage per additive field at that scale.
  const coverage = {} as MealScore['coverage'];
  let ratioSum = 0;
  let counted = 0;
  for (const f of ADDITIVE_FIELDS) {
    const need = table.tableTotals[f];
    const deliveredPer = meal.perServing[FIELD_MAP[f]] ?? 0;
    const delivered = deliveredPer * recommendedServings;
    // ratio capped at 1 — overshooting a single nutrient isn't "better".
    const ratio = need > 0 ? Math.min(delivered / need, 1) : 1;
    coverage[f] = { need: round1(need), delivered: round1(delivered), ratio: round2(ratio) };
    // weight energy + protein + fibre more than carbs/fat for the blend.
    const w = f === 'energy_kcal' ? 2 : f === 'protein_g' || f === 'fiber_g' ? 1.5 : 1;
    ratioSum += ratio * w;
    counted += w;
  }
  const nutritionScore = counted > 0 ? ratioSum / counted : 0;

  // Satiety-first near-constraint: energy coverage stands in for satiety in P1
  // (composition-based satiety is Phase 3). If the dish can't reach ~85% of the
  // table's energy even at the recommended scale, it fails the floor.
  const energyRatio = coverage.energy_kcal.ratio;
  const satietyOk = energyRatio >= 0.85;
  if (!satietyOk) notes.push('May leave the table under-satisfied (low energy coverage).');

  // Blend: satiety as a near-hard gate, nutrition as the optimisation target.
  // Quality (variant confidence) nudges ties.
  let score = nutritionScore;
  if (!satietyOk) score *= 0.5; // heavy penalty, not elimination
  const q = meal.variantConfidence;
  if (typeof q === 'number') score = score * 0.9 + q * 0.1;

  return {
    mealId: meal.id,
    title: meal.title,
    score: round2(score),
    recommendedServings: round2(recommendedServings),
    coverage,
    satietyOk,
    notes,
  };
}

/** Rank a set of candidates against the table, best first. */
export function rankMeals(
  meals: CandidateMeal[],
  table: TableRequirement,
): MealScore[] {
  return meals
    .map((m) => scoreMeal(m, table))
    .sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// 4. Plating split — Doc A §7. Divide the chosen dish's recommended servings
// across participants by their share of the table's DOMINANT need. Whole-portion
// only (per-component is Phase 4). The lever is "bigger/smaller plate."
// ---------------------------------------------------------------------------

export interface PlatingPortion {
  personId: string;
  /** fraction of the served dish this person gets (sums to 1 across the table). */
  share: number;
  /** human phrase, e.g. "the larger helping" / "a neater portion". */
  phrase: string;
}

/**
 * Split by share of the dominant additive need. Doc A §7 worked example: fibre
 * 18g vs 10g → 18/28 and 10/28. We use the table's dominant need (default
 * energy, override with `byField`) to set the ratio, since one shared dish has
 * one lever per person.
 */
export function platingSplit(
  table: TableRequirement,
  byField: AdditiveField = 'energy_kcal',
): PlatingPortion[] {
  const totals = table.participants.map((p) => p.needs[byField]);
  const sum = totals.reduce((a, b) => a + b, 0);

  const portions = table.participants.map((p, i) => ({
    personId: p.personId,
    share: sum > 0 ? totals[i] / sum : 1 / table.participants.length,
  }));

  // Phrase the largest / smallest in cook-friendly terms (encourage, never shame).
  const maxShare = Math.max(...portions.map((p) => p.share));
  const minShare = Math.min(...portions.map((p) => p.share));
  return portions.map((p) => {
    let phrase = 'an even portion';
    if (portions.length > 1) {
      if (p.share === maxShare) phrase = 'the larger, more generous helping';
      else if (p.share === minShare) phrase = 'a neater, smaller portion';
      else phrase = 'a middling portion';
    }
    return { ...p, share: round2(p.share), phrase };
  });
}

// ---------------------------------------------------------------------------
const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;
