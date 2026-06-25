# Soupdog — Recipe Page UX: Servings, Plating Content, Nutrient View · Design v0.1

**Status:** design capture · some items pre-build, one is a named future project
**Date:** 2026-06-24
**Context:** arose from the recipe people-panel slice (Dish·Schedule·Start v0.2 §9
interim home). Captures the UX decisions raised when the panel landed on the
recipe page, so they aren't lost. House style: olive `#2E4638`, IBM Plex Serif.

---

## 1. Scaling is VARIATION SELECTION, not multiplication (FOUNDATION) — `[OPEN]`

**Correction (Rasmus) — supersedes the earlier "people drive servings via scaling"
framing.** A fundamental principle: **each recipe produces a unique final
ingredient; the smallest change renders a different recipe and a different
end-ingredient.** Therefore changing serving size is **NOT a multiplier on one
recipe — it is a SWITCH to a different recipe** (a different end-ingredient).

- At SMALL deltas the difference is negligible → cheap to generate the new
  recipe on request (or fall back to the base).
- At LARGER deltas proportions genuinely change — spice ratios (non-linear),
  tools (different pan), method, timing. A linear `× servings` stretch is a
  *falsehood* the old UI told.

**So "people drive servings" actually means:** the assigned people sum to a target
quantity, and the system **selects (or generates) the recipe VARIATION that
produces that quantity** — discrete sibling recipes, not a stretched one. This is
exactly the concept/sibling/variation structure already designed (Recipe Model
docs; `execution_variants.variant_axes` — yield is an axis) and the
variation-generation flywheel (`Soupdog_Variation_Generation_And_Content_Pipeline`).
Trigger: *who's eating determines which variation you're looking at.*

**Consequence — DO NOT build a scale-ingredients-to-people multiplier.** That
contradicts the foundation. The honest feature is variation selection, which is
its own design-led effort (cost-gated generation, sibling resolution). Removing
the servings stepper waits for that — until then the stepper stays as the manual
"which yield am I looking at" control, but it is understood as *selecting a
variation*, not multiplying one recipe.

**Appetite folds in here too.** A per-meal "hungrier tonight" is arguably also a
different yield → a different end-product, not a multiplier on the plate. So
per-meal appetite is captured as part of the variation question, NOT built as a
separate knob.

`[OPEN 1a]` How yield-variations resolve: pick nearest existing sibling vs
generate-on-request; the negligible-delta threshold for falling back to base.
`[OPEN 1b]` Whether the servings stepper becomes an explicit "variation picker"
once variations exist.

---

## 2. Plating — summary now; section + reusable content object later

Plating has **two layers** (Rasmus):
1. **What to plate for whom** — per person, how much of each component. The
   demand/plating split (extended to per-component in Demand Phase 4).
2. **How to plate it nicely** — a **reusable plating CONTENT OBJECT**: almost a
   mini-recipe for presentation. Which plate/glass/vessel, arrangement, garnish.
   Attachable to a dish / drink / ingredient and REUSED across recipes (a "how to
   plate a clear soup" object serves many soups). Same pattern as Techniques
   (curated content over a structured spine), and the recipe model's
   pull-by-reference reuse — improving one plating guide improves every dish that
   references it.

**Shipped now (small):** a plain-language **plating summary** sentence at the top
of the "Cook for" panel's expanded detail — "Rasmus — the larger helping; Natasha
— a neater portion." Reads off the existing plating split; descriptive, not a
control. Degrades to "Cooking for Rasmus." for one person.

**Design / future (NAMED PROJECT — own doc when pursued):**
- **Plating as its own recipe SECTION** (promoted out of the people panel) — what
  + how, shown with the recipe.
- **Plating content object** — the reusable how-to-plate-nicely mini-recipe:
  per-component what-to-plate + vessels/tools (plates, glasses) + arrangement +
  garnish. New content type; needs its own model (attach point, authoring,
  curation, reuse across dishes/dish-families).
- **Visual plating** — arrangement diagram or generative plate/vessel selection.
  Hardest; downstream of the above. (Handover: "plating-for-beauty — its own
  project.")

`[OPEN 2a]` Where a plating object attaches: dish, dish-family/concept, or both.
`[OPEN 2b]` Vessel/tool vocabulary — reuse `equipment` (plates/glasses as
equipment) vs a presentation-specific set.
`[OPEN 2c]` Visual approach (diagram vs generated vs schema) — defer.

---

## 3. The "Cook for" section — shape (current + intended)

- **One line:** label + avatars + add/remove + confidence dot + expand chevron.
  (Shipped.)
- **A comment / summary** of what we're cooking for each person — the plating
  summary sentence (shipped) — with the fuller plating + per-person nutrition in
  the expandable detail.
- Intended end-state: the summary is the panel's "headline"; the full plating
  (what + how, via the content object) becomes its own section below the recipe.

---

## 4. Duplicate meta panel (bug, not feature) — follow-up

The recipe page renders the YIELD / TOTAL TIME / ACTIVE TIME / DIFFICULTY / RATING
/ CUISINE block **twice** (a table-style grid AND a stacked 2-column version). Looks
like a desktop/mobile pair that isn't being responsively hidden — so both show on
desktop. Pre-existing, unrelated to the people panel. Audit the two blocks in
`src/app/recipes/[slug]/page.tsx` (the meta grid around the YIELD rows) and hide
one by breakpoint. Small, separate cleanup.

---

## 5. Nutrient view: show more / all, one-at-a-time (next small slice) — `[OPEN]`

**Observation (Rasmus):** nutrition can stay at the bottom, but it'd be good to show
**more or all** the nutrients we have (71), with a **tab / one-at-a-time** selector
so it isn't a wall of rows.

This converges with the deferred 2b idea (full 71-nutrient per-person breakdown).
The "one nutrient at a time" framing is a clean answer to the wall-of-rows problem
and reuses `NutrientDetailModal` (already anticipates the demand panel) and the
grouped `nutrientMeta` the nutrition route already returns (macro/vitamin/mineral/
fatty_acid/amino_acid/other, with `display_order`).

`[OPEN 3a]` Shape: a category tab strip (Macros / Vitamins / Minerals / …) over the
existing grouped display? Or a single-nutrient selector with the "richest in"
context? Lean: category tabs over the grouped table — least new UI, uses
`nutrientMeta` grouping that exists.
`[OPEN 3b]` Per-person full breakdown (each person's portion × all 71) — fold in
here, or keep the panel at 5 macros and put the full view in the nutrition section?
Own contained slice; build after the people-panel settles.

---

## 6. Done in this slice (for the record)
- People panel moved to the TOP of the recipe page (under the meta panel).
- People panel made compact: one-line header (label + avatars + add + confidence
  dot + chevron); detail (satiety / plating / per-person nutrition) is collapsible,
  expanded by default when there is data.

## 7. Sequence
- **Now (shipped):** panel relocation + compact/expandable + plating summary line.
- **Next small:** nutrient tab/all-nutrients view (§5).
- **Design-led project:** plating as a section + reusable plating content object
  + visual (§2) — own design doc.
- **Foundation-led (big):** scaling-as-variation-selection (§1) — the variation
  system; appetite folds in here. NOT a multiplier.
- **Separate cleanup:** duplicate meta panel (§4).
- **Spine session (Dish·Schedule·Start v0.2):** retire meal_component,
  recipe-native composition, Start relocation, persona-people.
