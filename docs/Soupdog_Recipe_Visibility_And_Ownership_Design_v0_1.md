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
