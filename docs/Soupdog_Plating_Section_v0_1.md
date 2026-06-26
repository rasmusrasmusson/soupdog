# Soupdog — Plating Section v0.1 (design, grounded)

**Status:** design-first, ready to build. Grounded in a 2026-06-26 code + data
trace (no assumptions). No new schema.

---

## 1. Plating is TWO things

1. **How to plate it** — plating *technique*: "fan the slices", "spoon sauce
   underneath", "scatter the herbs". These are **tasks** (verb + optional tool +
   optional garnish ingredient + image as the target state). No new content type.
2. **How to share it** — the *division*: how the made dish splits across the
   people eating. We already compute a per-person share (the plating split).

These render as one bottom **"Plating"** section with two parts.

## 2. How cookbooks describe plating (grounds the model)
Chef cookbooks pair **a photo with a short sequence of plating steps** (which read
exactly like tasks) + sometimes a one-line **intent** ("aim for height and negative
space"). The **photo does most of the work** — "does it look like the picture?" is
the real completion criterion (maps to the guide layer's typed completion: a plating
task's completion is essentially *visual / matches reference image*). So: steps +
image, weighted toward the image. v1 SKIPS the intent line (steps + image carry it;
add later if it feels thin).

## 3. Mechanism — `category = 'plating'` (no schema change)

**Data trace (live):** plating verbs already exist as TASKS — `Plate` (category
`finish`, verified), `Garnish` (`finish`, draft), `Fill` (`transfer`, draft). So
this is a **tagging job, not a creation job.**

**`tasks` has three overlapping grouping columns** — `category` (real/primary, used
by the Techniques page + guide), `family` (near-duplicate of category), `task_family`
(dead — 'other' everywhere). This is the known schema cruft; its consolidation is a
SEPARATE hygiene pass, NOT part of plating.

**Decision:** introduce **`category = 'plating'`** and re-tag the genuinely-plating
tasks (Plate, Garnish, Fill-as-plating, plus drizzle/dust/arrange/scatter as they
appear) into it. Data migration only — no DDL.
- *Why not reuse `finish`?* "finish" ≈ plating but fuzzy (Fill is plating-ish but
  categorized `transfer`; `finish` could later hold non-plating final steps).
  `plating` is intentional.
- **Free bonus:** the Techniques page groups by `category`, so a `plating` category
  AUTOMATICALLY becomes a "Plating" techniques group — the future "Learn to plate"
  surface falls out with zero extra work.

## 4. The division is a MATRIX (components × people), not one share per person

Key insight: you don't divide the whole dish evenly on one axis — different
*components* divide differently (more pasta for the teenager, same one piece of fish;
less chilli for the kid). So division = **components (rows) × people (columns)**,
cells = that person's share of that component. The rows ARE the recipe's components
/ sub-dishes (ties to the composition model) — and per-component division is exactly
demand-model **Phase 4** ("more lentils for him"), currently deferred.

**v1 scope (honest):** build the matrix STRUCTURE (components × people), but drive it
with the **current single overall share** — columns differ per person, rows uniform
for now. True per-component division is deferred to demand Phase 4 and slots into the
same matrix UI later. Fallback to honest text for one person / no real split.

## 5. Read-path wiring (traced — buildable, contained)
The recipe page does NOT currently carry the task's `category` to the display. Thread
it through 4 points (no restructure):
1. Both `tasks (...)` selects in `/recipes/[slug]/page.tsx` (the published + draft
   read paths) → add `category`.
2. `mapNewSchemaRecipe` step build → `taskCategory: s.tasks…category`.
3. `RecipeStep` type (`src/types`) → add `taskCategory?: string`.
4. `RecipeDisplay` → steps with `taskCategory === 'plating'` render in the bottom
   Plating section instead of the main procedure.

## 6. v1 build checklist
- [ ] Data: re-tag plating tasks → `category = 'plating'` (Plate, Garnish, Fill,
      drizzle/dust/arrange/scatter…). Bless drafts while there.
- [ ] Thread `taskCategory` through the read path (§5, 4 points).
- [ ] RecipeDisplay: a bottom **Plating** section = "how to plate it" (plating-
      category steps, sequence + tool/garnish + image) + "how to share it" (the
      division matrix, single-share-driven).
- [ ] Division matrix component (components × people; text fallback for 1 person).
- [ ] Print: mirror the plating section (steps; matrix optional in print).

## 7. Deferred / named (NOT v1)
- Per-component division (demand Phase 4) — matrix rows become individually
  resolved.
- Plating **intent** line.
- Reusable "plating content object" / "Learn to plate" school (the `plating`
  category already seeds the Techniques group).
- Generative *visual* plating (plate/equipment selection) — separate project.
- The three-column (`category`/`family`/`task_family`) cleanup — separate hygiene.
