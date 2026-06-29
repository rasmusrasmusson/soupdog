# Soupdog — Unified Meal Graph (corrects the Option A silo) v0.1

**Status:** design, pre-build. Fixes a REGRESSION introduced by Option A (multi-made-dish
compose): meals are now decomposed one-dish-at-a-time and concatenated, which SILOS the meal
— losing the cross-dish shared-prep merging and parallelism that the decompose engine is
explicitly built for (and which is the executable-graph moat). New subject; v0.1.

## 1. What's wrong (Option A regression)
Option A fixed the dish-DROP (dishes vanishing) by parsing AND decomposing each made dish
SEPARATELY, then concatenating node lists with `group = dish name`. Side effect:
- Each dish's DAG is computed in ISOLATION → no cross-dish shared-prep merge (chop onion
  twice if two dishes need it).
- Merge = concatenation → zero cross-dish parallelism; graph is literally dishA-nodes then
  dishB-nodes.
- So a meal is N silos, not one unified graph.

This was a real (if previously-untested) capability loss: the decompose engine's SYSTEM prompt
(rules 4, 6b) is written to produce ONE unified meal graph — "merge shared prep across dishes",
"independent chains ARE the parallelism the graph exists to capture", "one terminal per dish".
Option A bypasses all of that.

## 2. Why the dish-drop happened (so we don't reintroduce it)
The drop was a PARSER problem, not a decompose problem. The old path joined dishes with `---`
into ONE blob and fed the SINGLE-recipe parser (`/import`), which flattened it to one recipe
(kept fries, dropped the rest). decompose was never the issue — it can handle multi-group.

## 3. The right fix (Option C — was wrongly rejected in the Multi_Made_Dish doc)
Keep Option A's reliable per-dish PARSING (each dish parsed alone = no parser collapse), but
DECOMPOSE ONCE over a COMBINED multi-group extraction:
1. For each made dish: `/import` parse it ALONE → `{ title, ingredients[], groups[] }`.
2. COMBINE the per-dish parses into ONE extraction:
   - concatenate all dishes' `ingredients[]` into one list (steps reference ingredients BY
     NAME — `stepIngredients: ["name"]` — so concatenation is safe, no id remap needed);
   - one GROUP per dish, `outputName = dish name`, steps = that dish's steps in order
     (flatten any intra-dish sub-groups into the dish group for now — robust; intra-dish
     sub-grouping is a later refinement);
   - title = menu title; servings/etc as today.
3. ONE `/decompose` call on the combined extraction → the engine applies rule 6b: merges
   shared prep across dishes, keeps independent chains parallel, emits one terminal per dish.
4. The returned DAG is the unified meal graph. linkedDishes + servedComponents ride as today.

I (Claude) rejected Option C earlier fearing "cross-dish dependency edges". That fear was
wrong: managing exactly those edges (merge only when ingredient+transformation+parameters
match; never merge generic water/oil/salt) is the decompose prompt's CORE job (rule 6b). The
engine is built for this.

## 4. Why the drop won't return
The collapse was the PARSER flattening a blob. Here, each dish is parsed ALONE (distinct,
complete), and only the STRUCTURED parses are combined — into the multi-group shape decompose
is designed to consume. decompose keeping N named terminals (one per dish) is rule 6b's
explicit contract. So: dishes preserved AND merged. (Verify on test anyway.)

## 5. Calls/cost
N parse calls + ONE decompose call (vs Option A's N parse + N decompose). FEWER decompose
calls than Option A, and one unified graph. Strictly better on both axes.

## 6. Display caveat (separate concern)
RecipeDisplay/RecipePrintLayout currently SECTION steps by `group` (per dish). So even a
unified, parallelism-aware graph is RE-SECTIONED by dish for reading. That's fine for now:
- the GRAPH being unified (shared prep merged, parallel chains) is the moat — it powers Cook
  Mode, appliance scheduling, division of labour;
- the PRINTED order sectioning by dish is a readability choice, not a graph limitation.
Whether the printed recipe should ALSO interleave by time/parallelism is a SEPARATE display
decision (deferred). With one unified graph, the merged shared-prep nodes will naturally
appear once (not per dish) — so the reader already sees "chop onion once" even when sectioned.
[OPEN] how a merged-shared-prep node is grouped when it feeds multiple dishes (no single dish
owns it) — likely its own "Shared prep" / "Mise en place" group. Decompose may already emit a
group for it; verify and, if blank, label it.

## 7. Build
- Edit `handleCreateMeal` (import page): replace the per-dish decompose+concat loop with:
  per-dish parse → combine into one multi-group extraction → ONE decompose → meal DAG.
- Keep: served-item curated check (skip off-the-shelf before parse), graceful degrade (a dish
  that fails parse → servedComponents), linkedDishes, multi-dish meta blanking (Bug 2a).
- No schema change. No decompose/decompose-save change (decompose already handles multi-group;
  save already persists nodes+groups).

## 8. Test (the example to actually run)
"roast chicken with mashed potatoes and steamed green beans" — forces it:
- oven roast (long passive) parallel to potato boil + bean steam = parallelism;
- shared prep (butter/salt/garlic) should merge across dishes (appear ONCE);
- three named terminals (chicken, mash, beans).
Check the composed graph: shared prep merged (not duplicated), independent chains not
artificially chained, one terminal per dish. Regression checks: hamburger+fries+coke still
keeps all (coke served); cobb salad+lemonade still keeps both (salad linked).

## 9. [OPEN]
- Shared-prep node grouping (§6) — label for a node owned by no single dish.
- Intra-dish sub-groups (e.g. "Marinade" within chicken) flattened for now — restore later if
  wanted (decompose can keep them; we'd not flatten, just ensure dish identity via a dish-level
  marker). Defer.
- Printed-order interleaving (§6) — whether the PDF should show time-interleaved steps vs
  dish sections. Separate display decision. Defer.
