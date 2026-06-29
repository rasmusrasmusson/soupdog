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

---

## 10. ATTEMPTED & REVERTED — collision in the single-decompose approach

Built §3 (per-dish parse → ONE decompose over combined multi-group extraction). Result on
"roast chicken with mashed potatoes and steamed green beans": **chicken group came out
MALFORMED** — its cooking steps lost ingredient/tool bindings and rendered as a BARE LIST
("Add", "Season", "Season", "Add", no qty/tool columns), while mash + beans rendered as proper
tables. All three dishes WERE present (no drop), but the chicken was broken.

### Leading hypothesis (UNCONFIRMED — needs decompose output to verify)
Cross-dish INGREDIENT COLLISION. Concatenating each dish's fully-parsed `ingredients[]` into
one list produces duplicates across dishes — and this meal has genuine overlap: the roast
chicken contains potatoes/carrots/onions, AND there's a separate mashed-potato dish; plus
salt/oil/pepper everywhere. The decompose engine (rule 6b, told to merge shared prep) likely
merged/reassigned the duplicated ingredients in a way that DETACHED the chicken's cooking
steps from their ingredient instances → unresolved references → empty columns → bare list.
The engine expects ONE coherent ingredient list, not N complete recipes' lists stapled
together.

### Could NOT confirm live
DevTools Network filtered by "decompose" showed nothing (capture was on the wrong page /
fiddly). Did not get the decompose response. So the hypothesis is unverified.

### DECISION: reverted to the SILOED Option A (per-dish decompose + namespaced concat)
Option A renders CORRECTLY (all dishes proper table format), just no cross-merge/parallelism.
A correct-but-siloed meal ships; a unified-but-broken one does not. Reverted the compose loop;
kept all other session wins (served-not-made web+PDF+persist, Bug 2a meta blanking, PDF
linked+served sections).

### NEXT SESSION — design unified collision-free, WITH DATA
1. FIRST capture the `/api/recipes/decompose` response for the chicken meal (Network tab open
   ON the import page, filter "decompose", click Compose) — confirm whether chicken nodes lost
   ingredient links / how the merge handled duplicate potatoes/salt/oil. Theory must be
   verified before building.
2. Candidate fixes to evaluate once cause known:
   - (a) DEDUPE the combined ingredient list before decompose (collapse exact dup names,
     sum/keep amounts) so the engine gets one coherent list — may fix the detachment without
     losing 6b merging.
   - (b) Generate ONE meal recipe TEXT and parse once (let the PARSER build a single coherent
     multi-group extraction) — closer to the engine's expected input, but this was the path
     that originally COLLAPSED dishes; would need the parser taught to keep dishes as groups.
   - (c) Per-dish decompose (Option A) but add a SECOND cross-dish merge pass that dedupes
     shared prep nodes after the fact — keeps per-dish correctness, adds merging as a separate
     step.
3. The decompose engine IS designed for multi-group meals (prompt rules 4/5/6b); the problem
   is the SHAPE of the combined extraction we feed it (duplicate-heavy ingredient list), not
   the engine's capability. Fix the input shape, not the engine.

### Process note
I (Claude) went back and forth on this within one turn (rejected Option C, built it, it broke,
considered tiny-fix vs revert). That oscillation = the signal I was guessing without data.
Right call was to STOP and revert, not fire a third blind attempt. Get the decompose output
first next time.

---

## 11. DIAGNOSTIC RESULT (2026-06-30) — hypothesis CONFIRMED, but the cause is the CLIENT COMBINE, not decompose

Ran the §10.2 collision check WITHOUT the live engine: the import-page combine logic
(import/page.tsx ~L95-138) is pure client-side JS, so it was replicated verbatim against a
chicken-meal-shaped combined extraction (3 dishes parsed alone, then §3-combined). No AI calls.

### What the harness proved
The bare-list dishes are the LATER ones (mash, beans), NOT the chicken. The chicken renders
fine because it is FIRST in concat order. Output:
- Roast chicken: all introduce-steps bound correctly.
- Mashed potatoes: "Add butter" EMPTY, "Season" EMPTY (only "potato"/"milk" survived).
- Steamed green beans: "Toss butter" EMPTY, "Season" EMPTY.

So §10's report ("chicken came out malformed, decompose detached it") was WRONG about which dish
and wrong about the layer. The chicken is the one dish that survives; decompose never got a fair
input.

### The actual mechanism (two lines, both pre-decompose, both client-side)
1. **L97 `assignedToStep` is a GLOBAL Set spanning all groups.** L116 filters out any
   stepIngredient whose lowercased name was already claimed by an earlier step IN ANY DISH.
   So once chicken claims `butter`/`salt`, mash's and beans' "add butter"/"season" steps are
   stripped to empty stepIngredients → bare list. This is the bug.
2. **L119 `allIngredients.find(name)` returns the FIRST name match.** With a concatenated
   ingredient list holding duplicate `salt`/`butter`/`oil` across dishes, even an un-stripped
   step binds the WRONG dish's quantity (chicken's 50g butter onto mash's step).

The decompose engine was never the cause. The combine had already emptied half the introduce-
steps before the extraction was sent. (This same global dedup lives in the live Option A path
too — it just never bites there because each dish is parsed AND decomposed in its own isolated
call, so the global sets reset per dish.)

### Corrected fix menu (supersedes §10.2's candidates)
- §10.2(a) "DEDUPE the combined ingredient list" is the WRONG DIRECTION — it removes the
  duplicate butter/salt entries, leaving L119 even fewer to bind. Do NOT do this.
- **The fix is per-dish SCOPING, not deduping:**
  - Make `assignedToStep`/`usedInSteps` **per-dish** (reset at each group boundary), so
    `salt` in chicken and `salt` in mash are independently bindable instances.
  - Scope L119's ingredient lookup to the **current dish's** ingredient list, not the global
    concat — so each step binds its own dish's quantity. (Carry the per-dish ingredient list
    alongside each group when combining, e.g. tag each group with a `dishIngredients[]`, or
    namespace ingredient names per dish: `d{i}::salt`.)
- This keeps rule 6b INTACT: the engine still merges genuinely-shared prep by MEANING. We are
  not pre-merging or pre-deduping; we are just not letting the client silently null out one
  dish's bindings before the engine sees them.

### Build note
The fix is in the COMBINE step (client), not the decompose route and not decompose-save. It is
small and testable offline (the harness at /tmp/diag.mjs reproduces it deterministically). Once
the combine scopes per dish, re-attempt the §3 single-decompose unified path — the engine should
now receive a coherent multi-group extraction where each dish's ingredients are introduced once
WITHIN that dish.

### Process note (correction)
This time the data came FIRST (offline harness, zero cost), before any code or live call. That
is the discipline §10's process note was reaching for. The "get the decompose output first"
instinct was right; the cheaper move was to realise the suspect layer (the client combine) is
inspectable without the engine at all.
