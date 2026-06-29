# Soupdog — Multi-Made-Dish Compose Design v0.1

**Status:** design, pre-build. Fixes the §13 finding (Recipe_Visibility doc): a meal with
2+ MADE dishes collapses to one dish because the single-recipe parser is fed a `---`-joined
blob and keeps only one. NEW subject doc (checked: no prior multi-dish-compose doc; the
Multi_Dish_Recipes_Consolidation doc covers the BACKEND engine/save/display, not this
compose-assembly bug).

## 1. The bug, precisely (traced, not assumed)

`handleCreateMeal` (import page) for made dishes:
1. generate each made dish's recipe TEXT (one /generate call per dish),
2. `combined = madeTexts.join('\n\n---\n\n')`,
3. ONE /api/recipes/import (parse) call on the blob → expects one group per dish,
4. /api/recipes/decompose on that single parse + resolvedDishes (linked).

**Failure is at step 3.** `/api/recipes/import` is a SINGLE-recipe parser: it returns one
`{title, ingredients, groups}`. Its `groups` are INTERNAL component groups of ONE dish
("For the marinade", "Masala sauce") — NOT N independent dishes. Given two recipes joined by
`---`, it returns ONE recipe (observed: kept fries, dropped hamburger + coke). The hamburger
is lost at PARSE; decompose never sees it.

## 2. Why it was hidden
Every prior working meal had ≤1 MADE dish (linked dishes go through resolvedDishes, not the
parser). "hamburger + fries + coke" is the first 2-made-dish meal. So multi-made-dish compose
has NEVER worked end to end. Proven cases: pure-link, single-made(+linked).

## 3. Key architectural fact (the lever)
Decompose ALREADY keeps LINKED dishes separate via `resolvedDishes` → `linkedDishes` (each
linked dish is its own attributed dish in the meal DAG). The fix should make MADE dishes
separate the SAME way linked dishes already are — not invent a new mechanism. A meal = a set
of dishes; each dish (made or linked) is its own sub-structure. The single-recipe parser is
the wrong tool for "N separate dishes."

## 4. Options

### Option A — parse + decompose EACH made dish separately, merge into one meal DAG
- For each made dish: /import (parse) → /decompose → its own mini-DAG (nodes + edges,
  `group` = the dish name).
- Merge all made-dish DAGs into one meal DAG: namespace node ids per dish (e.g. `d0_n1`),
  set each dish's nodes' `group` = dish name, concatenate nodes + edges. Linked dishes ride
  as `linkedDishes` (unchanged). Served items as `servedComponents` (unchanged).
- PROS: each dish parsed as the single recipe the parser is good at → no collapse; dish
  boundaries are clean (group = dish); reuses the proven single-dish path N times; decompose
  quality per dish is exactly today's proven quality.
- CONS: N parse + N decompose calls (more AI cost + latency) for an N-made-dish meal.
- Merging is mechanical (id namespacing + group tagging + concat); low risk.

### Option B — tell the parser "this is N SEPARATE DISHES"
- One /import call, but the prompt is changed: the `---` sections are SEPARATE DISHES; emit
  one group per dish, each group self-contained (own ingredients/steps), keyed by dish.
- Then decompose must treat each parser-group as a separate dish (group = dish name).
- PROS: fewer calls (1 parse, 1 decompose).
- CONS: relies on parser obedience for an unnatural task (it's a single-recipe parser); the
  parse contract (`groups` = internal components) gets overloaded to also mean "separate
  dishes" — ambiguous, likely fragile; decompose then can't tell "internal component group"
  from "separate dish group". Conflates two meanings of `group`.

### Option C — hybrid
- Parse-per-dish (Option A's parse), but ONE decompose call over a merged extraction that
  marks each dish. Saves N-1 decompose calls.
- CONS: needs an extraction shape that carries "these groups are separate dishes" into
  decompose → same group-overloading ambiguity as B, just later. Decompose dependency
  inference across separate dishes in one call risks cross-dish edges (a convergence node
  wrongly linking two dishes).

## 5. RECOMMENDATION — Option A (parse + decompose per made dish, merge DAGs)

Reasons:
- Each dish is parsed/decomposed as the SINGLE recipe the pipeline is PROVEN on — inherits
  today's quality, no new parser behaviour to trust.
- Dish boundaries are unambiguous (group = dish name); no overloading of `group`.
- Merge is mechanical and testable (id namespace + group tag + concat); decompose stays
  single-dish (no cross-dish edge risk).
- Made dishes become separate dishes the SAME way linked dishes already are — consistent
  mental model (a meal = N dishes, each its own sub-structure).
- Cost/latency (N calls) is acceptable: meals are small N (2–4 dishes); compose is not the
  hot path; correctness >> a few extra calls here. (Revisit batching later if needed.)

## 6. Build sketch (Option A)
In `handleCreateMeal`, replace step 2–4 (combine→parse→decompose) with:
1. For each MADE dish d_i:
   - parse: /import { text: madeText_i } → extraction_i (single recipe).
   - decompose: /decompose { extraction: extraction_i } → dag_i (nodes_i, edges via consumes).
   - tag: set every node's `group` = d_i.name (dish label); namespace ids `d{i}_{id}`,
     rewrite `consumes` refs to match.
2. Merge: meal DAG = { title: menu title, servings, nodes: concat(all nodes_i),
   linkedDishes: resolvedDishes (unchanged), servedComponents (unchanged) }.
   (Edges live inside nodes' `consumes`; namespacing keeps them within each dish.)
3. Preview from the merged DAG (dagToRecipe already sections by `group` → one section per
   made dish, plus linked-dishes + served sections).
- Keep the existing graceful-degrade: if a made dish fails parse/decompose, it becomes a
  served component (don't fail the meal).
- SAVE: decompose-save already persists nodes + groups; verify it preserves multi-group
  (multi-dish) nodes and the per-dish `group`. (Check against LIVE decompose-save — snapshot
  stale; do not edit blind.)

## 7. [OPEN] to settle while building
1. Id namespacing scheme — `d{i}_{origId}` and rewrite consumes; confirm decompose-save and
   version_step_dependencies handle the namespaced ids (they're just strings — should be
   fine).
2. Does `dagToRecipe` + RecipeDisplay already render multiple `group` sections from one DAG?
   (Inline dishes section by group today — likely yes; verify with 2 made dishes.)
3. Per-dish `servings`/time: each dish parses its own; the meal-level servings/time = ? (lean:
   meal servings from a sensible default or max; per-dish times display per group.)
4. Cost: N parse + N decompose. Acceptable now; note for the cost-measurement loop.
5. Cross-check decompose-save (LIVE) keeps multi-dish groups + per-dish group labels.

## 8. Test plan (the case that exposed the bug)
- "hamburger with fries and coke" → made: hamburger, fries; served: coke.
  Expect: meal DAG with TWO made-dish groups (Hamburger steps, Fries steps), each complete;
  coke as served; preview shows both dishes + coke; save preserves both dishes.
- "chicken katsu and a green salad" (1 made + 1 linked) → still works (regression).
- pure-link, single-made → still work (regression).
- A 3-made-dish meal (e.g. "steak, mashed potatoes and green beans") → all three present.

## 9. Sequencing vs the other slices
This is the REAL next blocker (without it, any 2+ made-dish meal loses dishes). Do this
BEFORE served-render/persist and the curated list. The served-not-made robustness already
shipped keeps it from CRASHING; this makes it CORRECT.

---

## 10. BUILT & PROVEN (Option A + forceGenerate)

Option A shipped, but first attempt STILL showed fries-only. Diagnosis (via the differing
result — 15 vs 17 steps — which proved new code WAS running, ruling out stale bundle):

### Real root cause of the residual drop
The Option A loop called `/api/recipes/generate` per dish, but `generate` is the BUTLER
CLASSIFIER — it only returns `recipeText` for the GENERATE action. For "Hamburger" (which
matches existing catalogue recipes) it returned `existing` (or could `clarify`) → NO
recipeText → the loop treated it as un-makeable → pushed to servedComponents → and since
served isn't rendered, hamburger silently VANISHED. Fries classified as `generate` → survived.
Same fries-only symptom, different cause from the original §13 bug.

### Fix — `forceGenerate` flag
`generate` now accepts `forceGenerate: true`: the system prompt directs it to ALWAYS take the
GENERATE branch for the given dish, and server guards suppress the clarify/existing/meal
branches under the flag. The compose loop passes `forceGenerate: true` per made dish (a dish
the user already chose to MAKE — we want a recipe written, not classification). Mirrors the
`skipExisting` pattern (deterministic mode flags, not prompt hints).

### PROVEN LIVE
"hamburger with fries and coke" → 41 steps, 21 ingredients, all THREE dishes present:
HAMBURGER group (beef mince/Worcestershire/mix/shape/sear/cheese…), FRIES group, and Coke
(Coca-Cola 330ml + lemon/lime + Glass + serve). Each dish its own grouped section. Tools span
all three (cast iron pan + deep saucepan + glass). Multi-made-dish compose WORKS end to end.

### Note — coke came through as a MADE dish
With forceGenerate, the butler wrote a serve-a-coke "recipe" (pour over ice, garnish). Didn't
break anything, but it's not the eventual desired handling (off-the-shelf → served, not a
recipe). That's the served-not-made / curated-don't-make-list work (Front_Door §13,
Visibility §12-13) — separate, still pending. For now: acceptable, composes fine.

### STILL TO VERIFY / NEXT
- SAVE: confirm a multi-made-dish meal SAVES with all dishes (namespaced ids are strings;
  decompose-save zero-node guard is fine here since nodes>0). Check against LIVE decompose-save.
- By-dish section rendering CONFIRMED works (HAMBURGER header visible, multiple groups).
- Then: served-not-made render + curated don't-make list (so coke becomes served, not a recipe).

---

## 11. SAVE VERIFIED — feature fully done & shippable

Saved the hamburger+fries+coke meal → persisted → renders on the public recipe page
(soup.dog/recipes/hamburger-with-fries-and-coke-…) → PDF + QR export all correct. Confirmed:
- All THREE grouped sections present and persisted: Hamburger (1–25), Fries (26–38),
  Coke (39–41).
- All 21 ingredients saved incl. Coca-Cola 330ml + lemon/lime garnish.
- DAG structure intact: sear w/ 4-min completion, two-stage fry (140°C→rest→190°C), per-step
  tool inference. Namespaced node ids (`d{i}_`) persisted fine as strings — no decompose-save
  change needed.
- Full chain works: compose → preview → save → public page → PDF/QR.

**Multi-made-dish compose is DONE.** Closes the §13 (Visibility doc) thread end to end.

### Remaining (separate threads, NOT this feature)
- Served-not-made: coke is currently a MADE dish (forceGenerate wrote it a serve-recipe).
  Acceptable; the curated don't-make-list / served rendering would make off-the-shelf items
  served instead. Front_Door §13, Visibility §12–13. Pending.
- The earlier served-not-made ROBUSTNESS (un-makeable dish → servedComponent, graceful
  degrade) still stands underneath as the safety net for dishes that genuinely can't be made.
