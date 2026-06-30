// src/lib/ingredients/aggregate-list.ts
// Minimal meal ingredient-list aggregation (§7 of
// docs/Soupdog_Quantity_Aggregation_And_Qualitative_Units_v0_1.md).
//
// Collapses a meal's ingredient list to ONE line per ingredient identity. Ships the
// visible 80% WITHOUT the full quantity model (no cross-unit conversion, no pinch-as-
// magnitude yet). Forward-compatible: when the conversion table + qualitative-unit
// model land, this same function gains real summing without changing its call sites.
//
// Rules (per §7):
//   - Group by ingredientId (fall back to lowercased name when id is missing).
//   - If ALL contributions in a group share the SAME unit AND all have numeric values
//     → SUM the values, keep the unit ("salt 1 tsp" + "salt 1 tsp" → "salt 2 tsp").
//   - Otherwise (units differ, or any value is non-numeric/qualitative like "to taste")
//     → show the ingredient ONCE with a safe combined quantity:
//       · all the SAME qualitative phrase  → that phrase ("to taste")
//       · mix of qualitative phrases / units → "as needed"
//   - NO cross-unit conversion (that needs the shared conversion table — deferred).
//
// Qualitative units = quantity_unit strings that carry no magnitude. Kept as a small
// sentinel set here; promoted to the real model later.

const QUALITATIVE_UNITS = new Set(['to taste', 'as needed', 'as required', 'to serve']);

function isQualitativeUnit(unit: string | null | undefined): boolean {
  return !!unit && QUALITATIVE_UNITS.has(unit.toLowerCase().trim());
}

function isNumeric(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function normUnit(unit: string | null | undefined): string {
  return (unit ?? '').toLowerCase().trim();
}

// Minimal shape this operates on — any object with ingredientId/name/quantity works.
export interface AggregatableIngredient {
  ingredientId?: string | null;
  name?: string;
  quantity?: { value: number | null; unit: string | null } | null;
  [k: string]: any; // carry-through of other fields (slug, category, nutrition, etc.)
}

/**
 * Collapse a list to one entry per ingredient identity, summing only when safely
 * possible. The FIRST occurrence of each ingredient is kept as the representative
 * row (preserving order + its carry-through fields); only its `quantity` is replaced
 * with the aggregated quantity.
 */
export function aggregateIngredientList<T extends AggregatableIngredient>(items: T[]): T[] {
  const order: string[] = [];
  const groups = new Map<string, T[]>();

  for (const it of items) {
    const key = (it.ingredientId ?? '').trim() || `name:${(it.name ?? '').toLowerCase().trim()}`;
    if (!groups.has(key)) { groups.set(key, []); order.push(key); }
    groups.get(key)!.push(it);
  }

  const out: T[] = [];
  for (const key of order) {
    const group = groups.get(key)!;
    if (group.length === 1) { out.push(group[0]); continue; }

    const rep = group[0]; // representative row keeps all non-quantity fields + position
    const quantities = group.map((g) => g.quantity ?? { value: null, unit: null });

    const units = quantities.map((q) => normUnit(q.unit));
    const allSameUnit = units.every((u) => u === units[0]);
    const allNumeric = quantities.every((q) => isNumeric(q.value));
    const noneQualitative = quantities.every((q) => !isQualitativeUnit(q.unit));

    let aggregated: { value: number | null; unit: string | null };

    if (allSameUnit && allNumeric && noneQualitative) {
      // safe numeric sum in the shared unit
      const sum = quantities.reduce((acc, q) => acc + (q.value as number), 0);
      aggregated = { value: sum, unit: quantities[0].unit ?? null };
    } else {
      // can't sum safely. If every contribution is the SAME qualitative phrase, keep it.
      const allQualitative = quantities.every((q) => isQualitativeUnit(q.unit));
      const sameQualitative = allQualitative && units.every((u) => u === units[0]);
      if (sameQualitative) {
        aggregated = { value: null, unit: quantities[0].unit ?? null }; // e.g. "to taste"
      } else {
        aggregated = { value: null, unit: 'as needed' };
      }
    }

    out.push({ ...rep, quantity: aggregated });
  }

  return out;
}
