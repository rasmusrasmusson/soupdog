# Soupdog — Ingredient Resolution Upstream & Identity-Based Prep Merge v0.1

**Status:** design, pre-build. Spine-touching (changes the import pipeline order). No code in
this doc. Supersedes the name-based merge assumption in
`Soupdog_Unified_Meal_Graph_Design_v0_1.md` §11.

## 1. The problem this fixes
A meal of several dishes should be ONE executable graph where a shared prep is done ONCE and
fanned out — two dishes needing finely chopped red onion get ONE "chop red onion" node, not two.
That cross-dish merge is the executable-graph moat (chop once, use thrice; division of labour;
appliance scheduling). The decompose engine (rule 6b) is built to do it.

But TODAY it can only merge on the ingredient's NAME STRING, because at decompose time the
ingredient is just text — it has not yet been resolved to an `ingredients` row. Name-matching is
shaky: "red onion" vs "red onions" vs "onion, red" don't merge; and two genuinely-different
things written alike could wrongly merge. The principled merge key is INGREDIENT IDENTITY (the
resolved product/concept row), not the text.

## 2. Why identity isn't available at merge time (the pipeline asymmetry)
Current import order:
1. `/api/recipes/import` — parse text → bare ingredient NAMES (no ids).
2. `/api/recipes/decompose` — names → executable DAG. **Merge decision (one chop node or two)
   happens HERE.** Only names exist.
3. `/api/recipes/decompose-save` — `findOrCreateIngredient` (ilike name → `ingredients.id`),
   then `specialiseTask` uses the RESOLVED ingredient id for concept specialisation.

So identity is computed at step 3, but the merge it should inform happens at step 2. The engine
reasons over names because that is all that exists when it runs.

Note the codebase ALREADY does identity-based reasoning — `specialiseTask` keys on the resolved
ingredient id (Phase C). The capability exists; it just lives downstream of where the meal merge
needs it.

## 3. Two layers that must not be conflated
The word "salt twice" mixes two different concerns. Keep them separate:

- **Final ingredient LIST (what the reader sees).** Salt used by two dishes should appear ONCE,
  summed ("salt — 1 tsp + 1 pinch"). This is display/aggregation over the saved meal. It is NOT
  a graph concern. [OPEN: confirm where the meal ingredient list is assembled and that it
  dedupes/sums across dishes — see §8.]
- **Graph introduce-NODES.** Each dish that adds salt at its own moment genuinely performs a
  salt-add action there. The graph correctly holds a salt-introduce step in each dish's chain;
  these are real, distinct cooking actions, not a duplicated line item. The reader sees one
  ingredient total and two "season" steps — correct.

Merging is about the FIRST kind of duplicate only when it is genuinely-shared PREP (chopped
onion that feeds multiple dishes). Generic seasonings/media (salt, water, oil) are NOT merged as
shared prep — each dish uses them at its own moment (rule 6b safety clause). So:
- chopped red onion feeding 2 dishes → ONE chop node, fanned out (MERGE).
- salt added to mash, and salt added to beans → TWO add nodes (DO NOT MERGE), one summed
  ingredient line in the list.

## 4. The design move: resolve ingredient identity UPSTREAM of decompose
Insert ingredient resolution BEFORE the merge decision, so the merge keys on ids, not strings.
Two shapes:

### 4A — Resolve pass between import and decompose (lighter)
A new resolve step takes the import parse's ingredient names → resolves each to an
`ingredients.id` (+ concept id where one exists), and annotates the extraction so each
stepIngredient carries its resolved id. decompose then merges on id: two stepIngredients with
the SAME resolved id + same transformation + same params → one node. New tasks/ingredients still
created at save; resolution here is READ-or-tentative.

Pros: smallest change to the engine's contract (add an id alongside the name). Keeps
find-or-create's WRITE at save. Reuses the existing ilike + concept logic, lifted into a shared
resolver.
Cons: a name that has no `ingredients` row yet resolves to null at this stage → falls back to
name-based merge for brand-new ingredients (acceptable; new ingredients are rare in a meal and
the engine still has the name).

### 4B — Move find-or-create itself upstream (heavier, more principled)
Do the actual find-or-create (including INSERT of new ingredients) before decompose, so every
ingredient has a real id by merge time, and decompose-save just links existing ids. This is the
fuller version and parallels what the guide layer did for TASKS (matching moved upstream of
decompose so the engine matches a verified library instead of inventing).

Pros: every ingredient has identity at merge time; save becomes a pure link step; one
resolution path for ingredients AND (already) tasks; concept specialisation could also move
upstream and inform the graph.
Cons: writes (new-ingredient inserts) now happen during the preview/compose phase, before the
user saves — need to decide whether a composed-but-unsaved meal should create ingredient rows
(probably fine; ingredients are shared catalog data, not user data, and dedup tooling exists).
Bigger blast radius (touches the single-dish path too).

## 5. Recommendation (for discussion, not yet decided)
- The MERGE must key on resolved ingredient identity, not name. Agreed direction.
- Prefer **4A first** (resolve pass annotating ids, find-or-create WRITE stays at save) — it
  delivers identity-based merge with the smallest spine change and no new "write before save"
  question. Upgrade to 4B only if/when ingredient resolution wants to be fully upstream for
  other reasons (e.g. concept-aware preview, inventory).
- Keep ingredient NAMES on the extraction alongside the ids — the engine still needs readable
  names for the human-facing instruction, and names are the fallback when id is null.
- Generic-media non-merge stays the engine's job (6b safety clause), independent of id.

## 6. What this unblocks / interacts with
- The unified-graph feature (the §3 single-decompose path) — once merge keys on id, the §11
  client-combine bug is moot AND the merge is robust, so the unified path can finally ship
  correct (not siloed).
- Concept matcher (Phase C) — a shared upstream resolver is the natural home to also resolve
  the concept, so specialiseTask could read it rather than recomputing.
- Ingredient dedup discipline — upstream resolution surfaces near-duplicate names earlier
  (place to apply trim/normalise beyond ilike).

## 7. What this does NOT change
- decompose engine's rule 6b LOGIC (merge only when ingredient + transformation + params match;
  never merge generic media) — same rule, better key (id instead of string).
- The final ingredient-list aggregation (display) — separate concern (§3, §8).
- decompose-save's structural validation — unchanged.

## 8. [OPEN] decisions to settle before building
1. **4A vs 4B** — resolve-and-annotate (write at save) vs move find-or-create fully upstream.
2. **New-ingredient handling in 4A** — name with no row yet: merge on name as fallback, or
   create the row early (drifts toward 4B)?
3. **[RESOLVED 2026-06-30] Meal ingredient LIST does NOT dedupe/sum across dishes.**
   `mapNewSchemaRecipe` (recipes/[slug]/page.tsx ~L171-186) maps `version_ingredients`
   1:1 to display lines — sort by order_index, map each row, no grouping. So a multi-dish
   meal with salt/butter in each dish shows "salt … salt … salt" (one line per dish, not
   per "twice"). This is a THIRD layer, independent of the graph merge and the introduce-
   nodes: a pure DISPLAY aggregation — group `version_ingredients` by resolved
   `ingredientId`, sum compatible quantities, show one line. Wrinkle: unit compatibility
   (1 tsp + 1 pinch don't naively add) → lean on the already-scoped units/metric-imperial
   display layer for a common unit, else fall back to "1 tsp + 1 pinch" additive display.
   Small, touches only display; does NOT touch the graph, engine, or pipeline order.
   Tracked as a separate item — do NOT conflate with the spine-level identity-merge work.
4. **Concept resolution placement** — does the upstream resolver also resolve concept ids, and
   does specialiseTask then consume them instead of recomputing?
5. **Shared-prep node grouping (carried from Unified Meal Graph §6/§9)** — a merged node owned
   by no single dish needs a display group ("Shared prep" / "Mise en place"). DISPLAY concern,
   deferred, but note it falls out of identity-merge naturally.
6. **Single-dish path** — 4B touches it; 4A leaves it alone. Confirm we don't want to disturb
   the proven single-dish flow while meals stabilise.

## 9. Sequencing
1. Settle §8.1 (4A vs 4B) and §8.3 (ingredient-list aggregation reality).
2. Build the shared ingredient resolver (lift ilike + concept logic out of decompose-save).
3. Wire it as the 4A resolve pass; annotate the extraction with resolved ids.
4. Update decompose rule 6b to merge on id (name as fallback).
5. Re-attempt the unified single-decompose path; verify on the roast-chicken meal
   (shared prep merged ONCE, generic salt NOT merged, three named terminals).
6. Then revisit display grouping for shared-prep nodes (§8.5).
