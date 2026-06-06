# Soupdog — The `recipes` Mirror Table: How It Relates to Canonicals/Versions (v0.1)

**Status:** Audit complete (2026-06-06). No migration needed — this note exists to
prevent a recurring confusion that has cost real debugging time.

## TL;DR
- `public.recipes` is a **flat denormalized mirror**, written in parallel with the
  `recipe_canonicals` / `recipe_versions` model on every recipe create/edit and on
  meal create/edit. It is authoritative-as-written (the app maintains it on
  purpose), used for fast flat reads by the public recipe page and meal routes.
- **The mirror row links to the real canonical model via `recipe_version_id`**, NOT
  via its `canonical_id` column. To get a mirror row's true canonical:
  `recipes.recipe_version_id → recipe_versions.canonical_id → recipe_canonicals.id`.
- **TRAP:** `recipes.canonical_id` is a **self-referential FK** —
  `FOREIGN KEY (canonical_id) REFERENCES recipes(id)`. It does NOT point at
  `recipe_canonicals`. It is **NULL on all rows** (an abandoned intra-mirror
  versioning idea) and is read by no code. Do not assume it holds a canonical id.
  Do not "backfill" it with `recipe_canonicals.id` values — that violates its FK.

## Why this caused confusion
Three issues this session traced back to the same root — the column *name*
`canonical_id` implying "the canonical recipe id" when it actually means "another
recipes row":
1. Test-data FK teardown ordering.
2. Save/unsave silently failing: the recipe page passed the mirror **row id** as
   `canonicalId`, but `saved_recipes.canonical_id` FKs to `recipe_canonicals`.
   Fixed by resolving any id → true canonical via the version chain (route-side)
   and by passing the real canonical from the page.
3. The "all 40 rows have NULL canonical_id" finding — correct, but it's NULL
   *by design* (wrong column), not a missing backfill.

## The correct mental model
- Need a recipe's canonical id from a mirror row? Resolve via `recipe_version_id`.
- The `resolveCanonicalId()` helper in the saved-recipes routes already does this
  (canonical? version? recipes-mirror→version→canonical?). That pattern is the
  RIGHT approach, not a workaround — reuse it anywhere a mirror id must become a
  canonical id.
- Writers: create-recipe (`/api/my/recipes`), edit (`/api/my/recipes/[id]`), and
  meals (`/api/my/meals`, `/api/my/meals/[id]`) all set `recipe_version_id` on the
  mirror and (correctly) leave `canonical_id` alone.

## Optional future cleanup (NOT urgent, NOT now)
- **Rename or drop `recipes.canonical_id`.** It's inert and dangerously named.
  Dropping it (or renaming to e.g. `mirror_parent_id`) would remove the trap.
  Low value, non-zero risk on a live table — only worth doing as part of the
  larger "merge recipes into canonicals" end-state (see Plan & End-Product v0.2),
  or a deliberate schema-hygiene pass. Until then, this note is the safeguard.

## What was NOT changed
No schema migration, no backfill, no code change resulted from this audit — the
mirror is internally consistent and correctly linked via `recipe_version_id`. The
save/unsave fix (resolve-any-id + page passing true canonical) already handled the
only live bug. This note is the deliverable.
