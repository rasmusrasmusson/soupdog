# Soupdog — Multi-Dish Recipes ("Meals") Consolidation v0.1

**Status:** design-settled, pre-build. Consolidates a long 2026-06-26 session.
Extends (does not replace) `Soupdog_Recipe_Native_Composition_And_Editor_Path_v0_3`
and `Soupdog_Serving_Division_Dish_Eater_Matrix_v0_1`. Grounded in a live code +
schema trace. The build is its own fresh session (prompt + eval-led).

---

## 0. Framing principle — "meal" is a SUBJECTIVE USER VIEW, not a technical type

A "meal" is **mostly a lens the user puts on a recipe**, not a meaningful technical
organization. Technically it is *just a recipe*: one DAG of atomic tasks (shared work
merged) producing one or more end-products. The DAG does not know or care that a human
calls some set of its outputs "dinner."

- **Dishes** within a meal are *derived* (convergence points / terminal outputs of the
  DAG), not stored walls.
- **The "meal" boundary** is even more subjective — the human saying "these
  end-products are what I'm serving together." A framing, not a technical fact.
- So: the technical object is **recipe (a DAG, possibly multi-output)**. "Meal" =
  the user's subjective framing + the `composition_level='meal'` label recording that
  intent. **Do not reify "meal" as a special object more than this.** (Continues the
  earlier "meal is dead as a backend TYPE, alive as a UI WORD" thread — and deepens it:
  multi-output isn't a *meal* property, it's a *recipe* property a meal-view frames.)

## 1. A meal is ONE recipe, decomposed as ONE DAG, with SHARED TASKS MERGED

The key correction this session. A meal is **not** dishes stacked side-by-side (one
silo of steps per dish). It is the whole thing **re-decomposed into a single unified
task graph**, where shared work becomes a SINGLE node that fans out.

> If carbonara and the salad both need chopped red onion, there is **one "chop red
> onion" task** feeding both — not two. (The fan-out / shared-intermediate model from
> the Atomic Decomposition design, applied at the meal level.)

- The "dishes" are the **terminal outputs** (and the sub-graphs converging on them) of
  that one DAG — derived from convergence, per the decomposition design's
  "groups bottom-up from the final product."
- This is the handover's recursion principle: *Meal = ONE recipe → end-products; same
  DAG pattern at every level*, just with **multiple terminal end-products** instead of
  one.

## 2. The three-tier dish model (resolves the editing-sync hesitation)

When composing a meal, each requested dish is handled one of three ways:

1. **Linked existing recipe (REUSE — the main case).** If the dish already exists as a
   standalone recipe (e.g. Carbonara), **link it** via `version_sub_recipes`
   (`child_canonical_id`). Reference, not copy → no sync. **Reuse is the priority:**
   the AI must FIND an existing dish before creating anything.
2. **Embedded (made-up dish, no standalone twin).** If the dish doesn't exist, it lives
   *inside the meal's own DAG* (its tasks are part of the unified decomposition, subject
   to the §1 shared-task merging). It is **NOT** promoted to a standalone
   `recipe_canonical`. → nothing to keep in sync while the user edits the meal over
   many passes. This is what makes editing safe (the explicit reason we reject
   synchronous promotion).
3. **Promotion (embedded → standalone) — DEFERRED, GATED.** Spinning a good embedded
   dish out into a reusable catalog recipe is a *nice-to-have*, done LATER via a
   **content-inspection pipeline** (review + accept, or auto after a delay) — the same
   curation-gate pattern as AI-created tasks (`is_verified=false` → blessed). One-time,
   post-settlement, gated — never synchronous during meal editing, never leaking
   half-baked dishes into the global catalog.

**Why not synchronous standalone-creation:** a standalone twin created at compose-time
would have to track every edit of the in-progress meal (sync nightmare) and would
pollute the catalog with unsettled dishes. Tiers 1 & 3 are *links* (no sync); tier 2 is
*embedded* (one object, edited in place). The only transition (2→3) is deliberate and
gated.

## 3. Two editors total (settled)

- **AI editor** (currently misnamed "import" — it also CREATES). The MAIN editor, for
  everyone. Handles multi-dish. This is what we build.
- **Form editor** (the big structured one). ADMIN-only. DEFERRED.

(The "import" name is a poor fit since it also generates recipes; end users won't trip
on it; not worth renaming now.)

## 4. Three creation paths = ONE underlying operation

All three end at the same place — a recipe (`composition_level='meal'`) whose dishes are
tier-1 links and/or tier-2 embedded sub-graphs in one merged DAG:

1. **Ask AI** — "create a recipe with carbonara, tomato salad and iced tea."
2. **Import a multi-dish source** — paste/upload containing several dishes.
3. **Add incrementally** — make/import one dish, then "add another dish" (AI or import).

Paths 1 & 2 produce N dishes in one decomposition; path 3 grows them. The shared core is
**"compose a dish into this meal-recipe"** (reuse-link if it exists, else embed into the
unified DAG with shared-task merging). The three paths are thin front doors to that op.

## 5. What's already built (grounded in code/schema trace)

- **DAG storage handles all of §1.** `version_steps` + `version_step_dependencies`
  (edges) + `consumes_intermediate_label` (named intermediates) already represent
  fan-out — one task feeding multiple downstream steps. Shared-task merging is
  *representable today*; nothing new in storage for it.
- **`version_sub_recipes` EXISTS** (table, empty, one SELECT policy) for tier-1 links —
  but is UNWIRED (0 rows, no read code). `child_canonical_id` / `child_version_id` /
  `used_as_ingredient_label` / `expand_by_default` / `optional`.
- **`composition_level` enum = `dish` | `meal`** (just these two). The meal label.
- **`meal_component`** is the OLD multi-dish mechanism — fully wired (7 files: meal
  pages, `meal-merge.ts`, cooking session) but it's the path we're RETIRING. The one
  existing composed recipe (`new-meal`) uses `meal_component`, NOT `version_sub_recipes`.
- **`meal-merge.ts`** is a sophisticated backward-scheduled, attention-honest cooking
  TIMELINE generator (human steps serialize on "hands"; machine/passive run parallel;
  keep-warm holds). It is the **execution layer**, not the composition definition — it
  is NOT throwaway. Long-term it should be FED FROM the unified meal DAG, not the old
  meal path. (The "temporary recipe" the meal page shows = this merge.)

## 6. The real build (center of gravity = decomposition prompt, NOT storage)

1. **Multi-dish decomposition prompt** — decompose N dishes into ONE DAG with
   (a) shared-task merging (chop onion once), (b) multiple named terminal outputs
   (one per dish), (c) REUSE: detect a dish that already exists and link it (tier 1)
   rather than re-decompose. The hard, novel part.
2. **Dish identity in a shared DAG** — how the DAG marks which terminal(s) = which named
   dish when upstream tasks are shared. Derive from convergence (per decomposition
   design); today sub-structure is flat `group_label`.
3. **Reuse-matching at the RECIPE level** — find-or-create for whole dishes, weighted to
   FIND (fuzzier than ingredient/task matching; dedup discipline matters).
4. **Multi-terminal display** — render a meal DAG showing its dishes + shared tasks on
   the recipe (`[slug]`) surface natively (not via the temporary meal-merge path).
5. **Eval set FIRST** — the dependency/merge quality is "the HARD part" (handover).
   Minimum eval: "carbonara + tomato salad + iced tea" → verify chop-onion-once merge,
   three terminal outputs, existing dishes linked not duplicated. Build prompt against
   the eval, per the standing lesson that prompt-tightening without grounding plateaus.

## 7. Deferred / named (NOT this build)
- Promotion pipeline (tier 2 → tier 1; review/accept or delayed-auto). §2.3.
- Retire `meal_component`; converge the meal surface into the recipe surface; feed
  `meal-merge` from the unified DAG.
- Full DAG-native FORM editor (admin); unblock the ~27 structured read-only recipes.
- Standalone-dish auto-creation for content expansion (only via the gated pipeline).
- Per-dish serving / the dish×eater serving matrix (its own note) — now has real
  multi-dish rows to attach to ONCE this lands.

## 8. [OPEN] for the build session
- Reuse matching: how fuzzy, what signal (name + ingredients/roles?), confidence gate.
- Dish identity: a field on terminal nodes vs purely derived from convergence/labels.
- Does a meal-recipe have any of its OWN steps (plating the whole table?) or only
  dish-terminals + shared tasks? (Lean: only what decomposition emits.)
- Embedded-dish boundary vs `group_label`: is a tier-2 dish just a labelled convergence
  sub-graph, or does it need an explicit marker?
