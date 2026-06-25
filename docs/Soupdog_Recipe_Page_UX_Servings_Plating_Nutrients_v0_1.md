# Soupdog — Recipe Page UX: Servings, Plating Content, Nutrient View · Design v0.1

**Status:** design capture · some items pre-build, one is a named future project
**Date:** 2026-06-24
**Context:** arose from the recipe people-panel slice (Dish·Schedule·Start v0.2 §9
interim home). Captures the UX decisions raised when the panel landed on the
recipe page, so they aren't lost. House style: olive `#2E4638`, IBM Plex Serif.

---

## 1. People drive servings (settle-then-build) — `[OPEN]`

**Observation (Rasmus):** now that the recipe page knows *who's eating* (the people
panel), the generic **servings number** may be redundant — the recipe should size
to the assigned people, not an arbitrary count.

**This is true to the demand model:** the dish already scales to the table's summed
need (`scoreMeal` → `recommendedServings`). So "who's eating" *is* the portion
signal; a manual servings stepper is a second, competing source of truth.

**But two honest caveats before deleting the stepper:**
1. **Ingredient scaling currently keys off the servings number,** not the people.
   The recipe page's ingredient quantities, progress bars, and `RecipeDisplay`
   all read `servings`. Making people drive quantity is a *rewire* ("scale to the
   table"), not a delete — it threads `recommendedServings` (or the table's need)
   into the ingredient display.
2. **Sometimes you want the neutral view** — "just show me the recipe for 4" while
   browsing or sharing, without assigning anyone. So the stepper still has a job
   when no people are assigned.

**Two numbers, don't conflate:**
- **Base servings (YIELD, first meta panel)** = metadata about how the recipe is
  *written* (its reference yield). Intrinsic to the recipe. **Keep regardless.**
- **Active servings (the stepper)** = the working portion count. This is the one
  that becomes "derived from people when people are present."

**Proposed model (to settle):**
- No people assigned → stepper drives quantity (today's behaviour).
- People assigned → the table's need drives quantity; the stepper either hides or
  becomes a manual override of the derived value.
- Base-servings YIELD stays as recipe metadata in all cases.

`[OPEN 1a]` When people are present: hide the stepper, or keep it as an override?
`[OPEN 1b]` Rewire ingredient scaling to read the table need vs the servings
number — confirm the seam in `RecipeDisplay` / the page's `servings` state.
**Build only after settled — it touches ingredient scaling, a core path.**

---

## 2. Duplicate meta panel (bug, not feature) — follow-up

The recipe page renders the YIELD / TOTAL TIME / ACTIVE TIME / DIFFICULTY / RATING
/ CUISINE block **twice** (a table-style grid AND a stacked 2-column version). Looks
like a desktop/mobile pair that isn't being responsively hidden — so both show on
desktop. Pre-existing, unrelated to the people panel. Audit the two blocks in
`src/app/recipes/[slug]/page.tsx` (the meta grid around the YIELD rows) and hide
one by breakpoint. Small, separate cleanup.

---

## 3. Nutrient view: show more / all, one-at-a-time (next small slice) — `[OPEN]`

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

## 4. Plating content object (NAMED FUTURE PROJECT) — design-doc-first

**Observation (Rasmus):** develop the plating section to show **how to plate the
dish per person** — ideally **visually** — and build a set of **instructions /
content for how to plate nicely**, as **a new type of content object.**

This is a genuinely new capability, not a tweak. It has three distinct parts, each
its own design effort:

1. **Per-person plating instruction** (extends the current plating split). Today:
   "the larger, more generous helping" (a share + phrase). Next: concrete plating
   guidance per person — quantity per component, arrangement. This ties to the
   v2 per-component plating (Demand Model Phase 4) and to participant-scoped
   components (different dishes per person).

2. **A plating-content object** — "how to plate nicely" as first-class,
   curated/authored content (like Techniques are content over `tasks`). A plating
   object would describe arrangement, garnish, vessel, composition principles —
   attachable to a dish or a dish-family. New content type; needs its own model
   (where it attaches, who authors/curates, how it's reused across dishes).

3. **Visual plating** — rendering a plate visually (arrangement diagram, or
   generative plate/vessel selection). The handover already flagged this:
   "plating-for-beauty (generative plate/equipment selection — its own project)."
   Hardest part; likely downstream of (1) and (2). Needs a deliberate approach to
   *how* (illustrative SVG? generated image? a vessel + arrangement schema?).

**Guidance:** treat as a named future project with its own design doc
(`Soupdog_Plating_Content_And_Visual_Design_v0_1` when pursued). Do NOT scope into
the current people-panel work. The seam it rides: the plating section of the
per-person panel is its entry point; a dish (and dish-family) can carry a plating
content object the way a recipe carries nutrition.

`[OPEN 4a]` Where a plating object attaches: dish, dish-family/concept, or both.
`[OPEN 4b]` Visual approach (diagram vs generated vs schema) — defer until (1)/(2).

---

## 5. Done in this slice (for the record)
- People panel moved to the TOP of the recipe page (under the meta panel).
- People panel made compact: one-line header (label + avatars + add + confidence
  dot + chevron); detail (satiety / plating / per-person nutrition) is collapsible,
  expanded by default when there is data.

## 6. Sequence
- **Now (shipped):** panel relocation + compact/expandable (this slice).
- **Next small:** nutrient tab/all-nutrients view (§3).
- **Settle-then-build:** people-drive-servings (§1) — touches ingredient scaling.
- **Separate cleanup:** duplicate meta panel (§2).
- **Named future project:** plating content object + visual (§4) — own design doc.
- **Spine session (from Dish·Schedule·Start v0.2):** retire meal_component,
  recipe-native composition, Start relocation, persona-people.
