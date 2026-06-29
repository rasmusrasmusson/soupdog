# Soupdog — Recipe Visibility & Ownership Design v0.1

**Status:** design, pre-build. NEW subject (no prior visibility/ownership doc). Reframes
"served-not-made" (Coke, wine, par-baked croissant) from a special case into a CASE of a
general dimension: **recipes have visibility and ownership.** Triggered by live compose
failures (see Front_Door_Design §12–13) and Rasmus's insight that ready-made products DO
have recipes — just proprietary/unknown ones.

**Reconciliation REQUIRED before build (named, not yet done):** this overlaps existing
tracks and MUST be reconciled with them so we build ONE visibility model, not two:
- **Soupdog_Sharing_And_Delegation_Design_v0.2** — visibility tiers (private/connections/
  public), `section_visibility`, the person/person_access ownership spine, ownership/
  consent/audit. Recipe visibility likely RIDES ON this, not a parallel system.
- **The recipe-model docs** (Concept_Fork / Reconciliation / AS_BUILT) — `recipe.kind`
  (composed/simple/acquire/none), execution_variants, ownership via author_id.
- ACTION: read both in full, then fold this model into them (or vice versa) before coding.
  Do NOT build a second visibility/ownership mechanism that conflicts with Sharing.

---

## 1. The reframe — every product is still an ingredient with a recipe

A ready-made product (Coke, commercial beer, branded snack) is NOT recipe-less. It HAS a
recipe — it's just proprietary and unknown to the public. So the model is NOT "served items
have no recipe / skip them." It's:

> **Every ingredient is the output of a process (a recipe) — but recipes have a VISIBILITY
> dimension and an OWNER. A "ready-made product" is an ingredient whose real recipe is
> HIDDEN; the public sees only the ingredient, or a trivial serve/finish stub.**

This is the platform's existing "everything is an ingredient = output of a process" model,
plus a visibility/ownership dimension it needs anyway.

## 2. Why this dimension is needed regardless of Coke (two independent drivers)

1. **Proprietary products** — Coke's recipe exists but the public has no right to it.
2. **Private user recipes** — a user's own recipe they don't want to share. SAME mechanism:
   the recipe exists, others have no right to its content.

Both are "the recipe exists; this viewer has no right to its content." One dimension serves
both. (And both align with Sharing's private/connections/public tiers — hence reconcile.)

## 3. What a HIDDEN recipe surfaces as (visibility levels)

When a viewer has no right to a recipe's content, it can still surface — at decreasing
granularity (this ladder must map onto Sharing's tiers):
- **Ingredient only** — "Coke" appears as an ingredient; no method shown. (The recipe
  exists and is owned, but content is withheld.)
- **Serve/finish stub** — a minimal, public-safe recipe: "how to serve wine" (chill, pour),
  "how to finish a par-baked croissant" (oven 8 min). Not the proprietary method — just the
  last-mile the user actually performs.
- **Nothing** — sometimes not even the ingredient is shared (fully private).
- (**Full** — the owner / authorised viewers see the real recipe.)

So "served-not-made" = the dish resolves to an ingredient whose recipe is hidden, rendered
as ingredient-only or a serve/finish stub in the composed meal. It is NOT pushed through
public recipe generation (which is what broke compose in §12).

## 4. Ownership + transfer (the food-company path)

- A hidden product recipe has an OWNER. Initially Soupdog (or a system/maker placeholder).
- **Register the owner as the product's maker.** The day the manufacturer (e.g. Coca-Cola)
  uses Soupdog, they TAKE OVER ownership — they get the owner account for that recipe, and
  with it the right to maintain the real (still-hidden-from-public) recipe.
- This is the consumer→commercial seam again: same object, ownership transfers. Ownership
  must live on the same spine as Sharing's person_access/account model (reconcile).

## 5. Make-vs-served becomes a USER CHOICE (composes with the time mechanism)

Not a binary the system decides. With this model:
- If a "homemade Coke" recipe EXISTS (a public version / fork) AND the meal has TIME for it
  (the §13.1 time threshold), the system can RECOMMEND making it.
- AND still list "Coke" the ingredient (with its hidden recipe) as the off-the-shelf option.
- The user picks: make the homemade version, or serve the ready product.
- So the two Front_Door §13 mechanisms slot in:
  - **Curated don't-make list (§13.2)** → default these to the SERVED/hidden-recipe path.
  - **Time threshold (§13.1)** → for makeable-but-long items, offer make vs serve by time.
- Served = the ingredient with hidden recipe; Make = generate/use the public recipe. The
  dish-list model's reserved `served` status is this path.

## 6. Schema implications (sketch — settle in reconciliation)

Likely additions (confirm against Sharing + recipe-model before building):
- A **visibility** field on the recipe (canonical or version): e.g. public / private /
  hidden-product. (Map to Sharing's tiers — may already be `section_visibility`-shaped.)
- **Owner** already exists (author_id); add the notion of a maker/manufacturer owner +
  ownership transfer (rides on person_access — reconcile).
- A way to mark a recipe as the **serve/finish stub** vs the full (hidden) method — possibly
  two linked recipes (hidden full + public stub), or a stub flag. [OPEN]
- Ready-made products are `is_product` ingredients (exist today) → each gets a hidden recipe
  + optional public stub. The curated don't-make list seeds these.

## 7. How compose uses it (the actual bug fix)

At meal-resolution, a dish resolves to one of:
- **make** → public recipe generated/used (today's path).
- **served** → an ingredient whose recipe is hidden → compose includes it as an
  ingredient / serve-finish stub, does NOT send it to generate+parse. ← fixes §12.
Compose must DEGRADE GRACEFULLY: a served/thin component never breaks the whole meal
(today the strict parser validation does — Front_Door §12).

## 8. Build sequence (after reconciliation)

1. **Reconcile** with Sharing & Delegation + recipe-model docs (REQUIRED first step).
2. Visibility dimension on recipes (the field + how it maps to Sharing tiers).
3. The served path in compose: resolve → ingredient/stub → compose-skips-generation +
   degrade-gracefully. (This alone fixes the §12 coke/lemonade failures.)
4. Curated don't-make list seeds product ingredients + hidden recipes/stubs (Claude can
   draft the list).
5. Time-threshold mechanism (Front_Door §13.1) offers make-vs-served by time.
6. Ownership transfer to makers — NAME THE SEAM, build when a real maker account exists.
7. Private-user-recipe visibility — same dimension; build with Sharing.

## 9. [OPEN] decisions

1. Is visibility ONE field (public/private/hidden-product) or does it compose with Sharing's
   per-section tiers? (Reconcile — likely the latter.)
2. Hidden-full + public-stub: two linked recipes, or one recipe with a stub/visibility flag?
3. Does ownership transfer move the canonical, or reassign author/owner on it? (Sharing
   spine.)
4. What's the MINIMUM to fix the §12 compose bug without the full model? (Likely: a `served`
   resolution that compose skips + degrade-gracefully — buildable ahead of the full
   visibility model IF it doesn't preclude it. Tempting as a first slice, but check it's not
   throwaway against this design.)
5. Curated don't-make list: hardcoded vs DB vs derived from `is_product`. (Lean: seed
   `is_product` ingredients with hidden recipes.)

## 10. Relationship to served-not-made (summary)

Served-not-made is NOT its own feature — it's the **public-facing view of a hidden-recipe
product**. Building visibility/ownership correctly makes served-not-made fall out as a case,
AND fixes the compose failures, AND serves private recipes + food-company accounts — instead
of a throwaway `served` flag rebuilt later. Hence: design (this doc) + reconcile FIRST.

---

## 11. RECONCILIATION DONE (read Sharing v0.2 + recipe-model recon) — outcome

Read: Sharing_And_Delegation_Design_v0.2 (.docx) + Recipe_Model_Reconciliation_v0_1.

### 11.1 Sharing's visibility is a DIFFERENT axis (don't fold into it)
Sharing's visibility tiers (private / connections / public) + `section_visibility` govern
**PERSON/PROFILE data** ("who sees my health/allergies/weight"), composed with
`person_access` grants. They do NOT model recipe content visibility. So recipe visibility is
a PARALLEL axis on a different object (recipes, not person-sections). DECISION: REUSE
Sharing's tier VOCABULARY (private/connections/public) and the ownership spine
(person_access/account), but as a SEPARATE recipe-visibility axis — NOT the same
section_visibility rows. We are not folding into Sharing; we're echoing its model on recipes.

### 11.2 Recipe model already has the primitives
`recipe_canonicals` already has `is_published` (public/draft), `author_id` (owner),
`composition_level` (≈ kind), `source`, `confidence_score`. So "hidden product recipe" is an
EXTENSION of the existing published/draft visibility (e.g. a new value like `hidden_product`
beyond published/draft) + the serve/finish-stub concept — NOT a wholesale new system. Full
visibility model = add values/axis to what exists; reconcile the exact field shape later.

### 11.3 §9 #4 ANSWERED — there IS a safe minimal compose-bug-fix slice
The minimal fix for the §12 failures (coke drops / lemonade breaks parser):
- at meal-resolution, recognise SERVED items → compose SKIPS generation for them, includes
  them as an ingredient/stub;
- compose DEGRADES GRACEFULLY — one thin/served component can never sink the whole meal.
This does NOT prejudge the visibility model: "served, not generated" is true under ANY
version of it, the dish-list model ALREADY reserves the `served` status, and the fix is
purely RESOLUTION + COMPOSE BEHAVIOUR — **no schema change**. So it is NOT throwaway. Safe to
build now; the full visibility/ownership schema (hidden_product value, stubs, ownership
transfer) layers on later without rework.

### 11.4 Build order (updated)
1. (NOW) Minimal compose fix: `served` resolution + compose-skips-generation + degrade-
   gracefully. Fixes the live bug. No schema. ← BUILD THIS NEXT.
   - Trigger v1: the curated don't-make list (§13.2 in Front_Door doc) — Claude drafts it.
   - Plus: compose never fails the whole meal on one thin component.
2. (LATER) Recipe-visibility axis proper: `hidden_product` value + serve/finish stubs,
   echoing Sharing's tiers on recipes. Schema work; reconcile field shape.
3. (SEAM) Ownership transfer to makers; private-user-recipe visibility (with Sharing).

---

## 12. SLICE 1 BUILT — compose robustness (the bug fix), with a clean boundary

Built in the import page (`handleCreateMeal`). Fixes the §12 live failures WITHOUT schema:

### Done (sound, verified balanced/type-safe)
- A to-make dish that can't be written as a recipe (off-the-shelf like Coke, or a thin/empty
  generation, or a thrown error) is NO LONGER injected as junk text into the parser. It's
  caught and carried as a SERVED component (`servedComponents[]`).
- Threshold: generation must return real recipe text (>40 chars) to count as "made".
- **No hard-fail:** if the parse still returns an incomplete structure, the meal DEGRADES to
  a minimal meal of linked dishes + served components instead of throwing (fixes §4 total
  failure). If nothing can be made at all, builds a served+linked meal directly.
- **No silent drop:** un-makeable dishes become `servedComponents` on the DAG, not vanished
  (fixes §1).

### Explicitly NOT done this slice (NEXT slice — stated boundary, not a hidden gap)
- **Render** served components in the preview/RecipeDisplay (a "served / ready-made" section).
  They're carried on `dag.servedComponents` but nothing renders them yet.
- **Persist** served components on save. Save sends `dag` to decompose-save, which reads
  specific fields; servedComponents are NOT yet persisted → a saved meal currently keeps its
  made+linked dishes but not the served items.
- **Save guard for served-only / zero-node meals:** decompose-save rejects zero-node DAGs
  (`dag.nodes.length === 0`). The LIVE version reportedly relaxed this for linkedDishes
  (pure-link works), but my snapshot is STALE — do NOT edit decompose-save blind. A
  served-only meal (all coke/beer, nothing made/linked) would likely fail save until this is
  checked against live + extended for servedComponents.

### Curated don't-make list — still pending (this slice is REACTIVE robustness)
This slice makes compose robust when generation FAILS for any dish. It does NOT yet
PROACTIVELY mark known off-the-shelf items as served (Coke would still attempt generation,
just no longer breaks things if it produces junk). The curated don't-make list (Front_Door
§13.2; Claude to draft) is the next behavioural piece: mark known products served up front,
skip the wasted generation call.

### Next slice order
1. Check live decompose-save guard; extend it + persist `servedComponents` (so served items
   survive save). Needs the LIVE file, not the stale snapshot.
2. Render served components in RecipeDisplay ("served / ready-made" section).
3. Curated don't-make list → proactive served marking (skip generation for known products).
4. Then the fuller visibility model (hidden_product value, stubs, ownership) per §1–10.

---

## 13. CRITICAL FINDING — multi-MADE-dish compose collapses to one dish

Testing "hamburger with fries and coke" (Make-new-anyway → dish list → compose) revealed a
bug BIGGER than served-not-made:
- Compose did NOT crash (robustness fix worked) — title "Hamburger with fries, and coke",
  manifest "Hamburger · Fries · Coke".
- BUT the composed recipe contained ONLY THE FRIES (16 steps, 3 ingredients, French,
  "twice-fried French fries"). **Hamburger GONE. Coke GONE.**
- Hamburger is fully makeable (made perfectly in earlier tests) — so this is NOT served-not-
  made. It's that MULTIPLE MADE DISHES collapse to one.

### Root cause
`handleCreateMeal` combines made-dish recipe texts with `\n\n---\n\n` and feeds the blob to
`/api/recipes/import` (the SINGLE-recipe parser). That parser produces ONE recipe with
internal `groups` (designed for "Pasta + Sauce" within one dish), NOT N independent dishes.
Given two separate recipes joined by `---`, it keeps ONE (the fries) and drops the rest.

### Why it was hidden until now
Every prior "working" meal had AT MOST ONE made dish:
- katsu + green salad → salad was LINKED, only katsu made (1 made) ✓
- pure-link meals → 0 made ✓
- single new dish + linked → 1 made ✓
"hamburger + fries + coke" is the first TWO-MADE-DISH meal → exposes the collapse.

### So multi-made-dish compose has NEVER actually worked end to end.
The dish-list flow is proven for: pure-link, single-made+linked. It is NOT proven for
2+ made dishes. This is the real next priority — bigger than render/persist served items.

### Fix options (design-led — settle before building)
1. **Parse each made dish SEPARATELY** (one import call per dish → one recipe each), then
   MERGE into a multi-group/multi-dish DAG at decompose time (decompose already takes
   resolvedDishes + can emit linkedDishes; needs a "these made dishes are separate dishes"
   path). Cleanest; more calls.
2. **Tell the parser explicitly** "this text is N SEPARATE DISHES, emit one group per dish
   keyed by the `---` sections" — a parser-prompt change + ensure groups survive as distinct
   dishes through decompose. Fewer calls, relies on parser obedience.
3. Hybrid: parse-per-dish for made, keep linked as resolvedDishes, merge all in decompose.

### Revised next-slice priority
1. **Multi-made-dish compose** (this §13) — the real blocker; without it any meal with 2+
   made dishes loses dishes. DESIGN the merge approach first.
2. Then served-not-made render + persist (§12 boundary).
3. Then curated don't-make list; then fuller visibility model.

### Don't save the test
The composed "Hamburger with fries, and coke" is fries-only — broken. Not saved.
