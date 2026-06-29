// src/lib/ingredients/resolve.ts
// Read-only ingredient identity resolver (4A — see
// docs/Soupdog_Ingredient_Resolution_Upstream_And_Identity_Merge_v0_1.md §10).
//
// Purpose: resolve an ingredient NAME to its `ingredients.id` so the decompose
// engine can merge shared prep across dishes on IDENTITY, not on name strings.
// This is the READ (match) half of decompose-save's findOrCreateIngredient,
// lifted out so it can run UPSTREAM of decompose. It NEVER inserts.
//
// 4B seam: the WRITE (insert) half stays in decompose-save's findOrCreateIngredient.
// A later 4B would call resolveIngredientId here, then insert on null — without a
// rewrite. Keep this module insert-free by construction.
//
// Match query MIRRORS findOrCreateIngredient EXACTLY (decompose-save L77-80):
//   ilike(name) + is_product=false + limit 1.
// This is a correctness requirement, not tidiness: resolve-time and save-time
// MUST see the same catalog set, or the merge keys on an id that find-or-create
// can't reconcile at save. Recipe ingredients are foods, not retail products
// (a barcode'd "Coke Original Taste" must not match a recipe's "cola").

// Normalisation used for the de-dupe/cache key — the SAME normalisation the merge
// key uses (lowercased + trimmed), so "Salt", " salt ", "salt" collapse to one hit.
function norm(name: string): string {
  return name.toLowerCase().trim();
}

/**
 * Resolve a single ingredient name to its catalog id, or null if not in the
 * catalog yet. READ-ONLY — never inserts. `db` is an authenticated Supabase
 * client (this runs server-side only; the match query needs auth).
 */
export async function resolveIngredientId(db: any, name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const { data } = await db
    .from('ingredients')
    .select('id')
    .ilike('name', trimmed)
    .eq('is_product', false)
    .limit(1)
    .single();
  return data?.id ?? null;
}

/**
 * Batch-resolve a list of names. De-dupes on the normalised key so repeated names
 * (e.g. "salt" across three dishes) hit the DB once. Returns a Map keyed by the
 * NORMALISED name → id | null. Callers look up by norm(name).
 *
 * Read-only: one ilike query per DISTINCT name, no inserts. Cost is DB-only and
 * negligible (no AI). Failures on an individual name resolve to null (treated as
 * "not in catalog" → name-fallback merge downstream), never throwing — resolution
 * must not be able to break decomposition.
 */
export async function resolveIngredientIds(
  db: any,
  names: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const distinct: string[] = [];
  for (const n of names) {
    const k = norm(n);
    if (!k || out.has(k)) continue;
    out.set(k, null);          // provisional; overwritten below if matched
    distinct.push(k);
  }
  // Resolve each distinct name independently (ilike can't be safely batched into
  // one query without risking cross-name false matches; the list per recipe is small).
  await Promise.all(distinct.map(async (k) => {
    try {
      const id = await resolveIngredientId(db, k);
      out.set(k, id);
    } catch {
      out.set(k, null);        // never let a resolve error break decomposition
    }
  }));
  return out;
}

/** Exposed for callers that need the same normalisation as the cache/merge key. */
export function normalizeIngredientName(name: string): string {
  return norm(name);
}
