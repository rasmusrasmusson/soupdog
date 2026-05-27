// src/lib/recipe-nutrition.ts
// Phase 1: Pre-cooking nutrition calculation from ingredient list
// Converts all units to grams, sums nutrition per ingredient,
// divides by servings. Marked as estimated · pre-cooking.

export interface IngredientNutrition {
  name:            string;
  quantityValue:   number;
  quantityUnit:    string;
  category?:       string;
  densityGPerMl?:  number;
  typicalUnitWeightG?: number;
  nutritionPer100g?: {
    calories?:       number;
    carbohydrates?:  number;
    sugar?:          number;
    protein?:        number;
    fat?:            number;
    saturated_fat?:  number;
    fiber?:          number;
    sodium?:         number;
    potassium?:      number;
    vitamin_c?:      number;
    vitamin_b6?:     number;
    folate?:         number;
    iron?:           number;
    magnesium?:      number;
    phosphorus?:     number;
    calcium?:        number;
    zinc?:           number;
  };
}

export interface RecipeNutritionResult {
  perServing: {
    calories?:      number;
    protein?:       number;
    fat?:           number;
    saturated_fat?: number;
    carbohydrates?: number;
    sugar?:         number;
    fiber?:         number;
    sodium?:        number;
    potassium?:     number;
    vitamin_c?:     number;
    iron?:          number;
    calcium?:       number;
  };
  confidence:   'calculated' | 'partial' | 'insufficient';
  coveredPct:   number;  // % of ingredients that had nutrition data
  totalWeightG: number;
}

// ── Unit to grams conversion ──────────────────────────────────
// Context-aware: oil vs flour vs liquid vs generic

function unitToGrams(
  value: number,
  unit:  string,
  ingredient: IngredientNutrition
): number | null {
  const u   = unit.toLowerCase().trim();
  const cat = (ingredient.category ?? '').toLowerCase();
  const nm  = (ingredient.name ?? '').toLowerCase();

  // Already grams
  if (u === 'g')  return value;
  if (u === 'kg') return value * 1000;
  if (u === 'oz') return value * 28.35;
  if (u === 'lb') return value * 453.59;

  // Millilitres — use density if available, else assume 1g/ml
  if (u === 'ml') {
    const d = ingredient.densityGPerMl ?? 1.0;
    return value * d;
  }
  if (u === 'l') {
    const d = ingredient.densityGPerMl ?? 1.0;
    return value * d * 1000;
  }

  // Count units
  if (u === 'piece' || u === 'whole') {
    return ingredient.typicalUnitWeightG
      ? value * ingredient.typicalUnitWeightG
      : null;  // unknown — skip
  }
  if (u === 'clove')  return value * 5;
  if (u === 'slice')  return value * 30;
  if (u === 'pinch')  return value * 0.36;
  if (u === 'leaf')   return value * 0.5;
  if (u === 'sprig')  return value * 1.5;

  // Volume units — context-sensitive
  const isOil     = cat === 'oil' || nm.includes('oil') || nm.includes('fat') || nm.includes('butter');
  const isFlour   = nm.includes('flour') || nm.includes('meal') || nm.includes('starch');
  const isSugar   = nm.includes('sugar') || nm.includes('honey') || nm.includes('syrup');
  const isSalt    = nm.includes('salt');
  const isSpice   = cat === 'spice' || cat === 'herb';
  const isLiquid  = cat === 'liquid' || cat === 'dairy' ||
                    nm.includes('milk') || nm.includes('cream') ||
                    nm.includes('stock') || nm.includes('broth') ||
                    nm.includes('water') || nm.includes('wine') ||
                    nm.includes('sauce') || nm.includes('juice');

  const density = ingredient.densityGPerMl;

  if (u === 'tsp') {
    if (isSalt)         return value * 6;
    if (isOil)          return value * 4.5;
    if (isFlour)        return value * 2.6;
    if (isSugar)        return value * 4.2;
    if (isSpice)        return value * 2.6;
    if (isLiquid && density) return value * 4.93 * density;
    if (isLiquid)       return value * 4.93;
    return value * 5; // generic fallback
  }
  if (u === 'tbsp') {
    if (isSalt)         return value * 18;
    if (isOil)          return value * 13.6;
    if (isFlour)        return value * 7.8;
    if (isSugar)        return value * 12.6;
    if (isSpice)        return value * 7.8;
    if (isLiquid && density) return value * 14.79 * density;
    if (isLiquid)       return value * 14.79;
    return value * 15;
  }
  if (u === 'cup') {
    if (isOil)          return value * 218;
    if (isFlour)        return value * 125;
    if (isSugar)        return value * 200;
    if (isLiquid && density) return value * 236.59 * density;
    if (isLiquid)       return value * 236.59;
    if (density)        return value * 236.59 * density;
    return value * 240;
  }
  if (u === 'fl_oz' || u === 'fl oz') {
    const d = density ?? 1.0;
    return value * 29.574 * d;
  }

  return null; // unknown unit — skip this ingredient
}

// ── Main calculation ──────────────────────────────────────────

export function calculateRecipeNutrition(
  ingredients: IngredientNutrition[],
  servings:    number
): RecipeNutritionResult {

  const totals: Record<string, number> = {};
  let totalWeightG  = 0;
  let coveredCount  = 0;
  let skippedCount  = 0;

  for (const ing of ingredients) {
    if (!ing.quantityValue || ing.quantityValue <= 0) continue;

    const weightG = unitToGrams(ing.quantityValue, ing.quantityUnit, ing);

    if (weightG === null || weightG <= 0) {
      skippedCount++;
      continue;
    }

    totalWeightG += weightG;

    if (!ing.nutritionPer100g) {
      skippedCount++;
      continue;
    }

    coveredCount++;
    const n   = ing.nutritionPer100g;
    const mul = weightG / 100;

    const add = (key: string, val?: number) => {
      if (val != null && val > 0) {
        totals[key] = (totals[key] ?? 0) + val * mul;
      }
    };

    add('calories',      n.calories);
    add('protein',       n.protein);
    add('fat',           n.fat);
    add('saturated_fat', n.saturated_fat);
    add('carbohydrates', n.carbohydrates);
    add('sugar',         n.sugar);
    add('fiber',         n.fiber);
    add('sodium',        n.sodium);
    add('potassium',     n.potassium);
    add('vitamin_c',     n.vitamin_c);
    add('iron',          n.iron);
    add('calcium',       n.calcium);
  }

  const total = coveredCount + skippedCount;
  const coveredPct = total > 0 ? Math.round((coveredCount / total) * 100) : 0;
  const confidence = coveredPct >= 80 ? 'calculated'
                   : coveredPct >= 40 ? 'partial'
                   : 'insufficient';

  const srv = Math.max(servings, 1);
  const round = (v: number, dp = 1) => Math.round(v * Math.pow(10, dp)) / Math.pow(10, dp);

  const perServing: RecipeNutritionResult['perServing'] = {};
  for (const [key, val] of Object.entries(totals)) {
    const rounded = round(val / srv, key === 'calories' ? 0 : 1);
    if (rounded > 0) (perServing as any)[key] = rounded;
  }

  return { perServing, confidence, coveredPct, totalWeightG: Math.round(totalWeightG) };
}
