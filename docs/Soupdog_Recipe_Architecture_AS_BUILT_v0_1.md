# Soupdog — Recipe Architecture AS BUILT (ground truth, v0.1)

**Status:** Evidence-based map of how the recipe model ACTUALLY works in the live DB
+ code, as of 2026-06-06. This is the document whose absence caused a long
design-in-a-vacuum detour. FUTURE SESSIONS: start here. Pairs with the
Reconciliation doc (design→reality) and the v0.1–v0.6 design notes (the "why").

## The LIVE read path (confirmed from recipes/[slug]/page.tsx + row counts)
A recipe is assembled by querying `.from('recipes')` (the mirror, as entry row for
slug/title/author) and joining BOTH representations, then choosing:

**RICH model (authoritative — 39 of 41 canonicals):**
`recipe_canonicals` (identity: slug, current_version_id, author_id, is_published,
  source, confidence_score, **composition_level** ≈ the intended `kind`)
  → `recipe_versions` (replace-history; parent_version_id = lineage; title, cuisine,
    servings, times, nutrition_per_serving, is_canonical_version)
    → `version_steps` (755 rows; order_index, instruction, **task_id → tasks**,
       task_parameters, is_parallel_prev/parallel_group_id/blocking, appliance_settings)
    → `version_ingredients` / `version_step_ingredients` (→ ingredients, typed FK)
    → `version_equipment` (→ equipment)
Code picks this branch when version_steps/version_ingredients have data
(`hasNewData` → `mapNewSchemaRecipe`).

**LEGACY model (fallback — only 2 SEED recipes):**
`recipes` → `recipe_steps` (17 rows) / `recipe_ingredients` / `recipe_equipment`.
Used via `mapLegacyRecipe` when no version data. The only recipes without
version_steps are the two all-zero-UUID seeds (00000000-…-0002-…0001 and …0002 =
Chicken Tikka Masala, Sourdough Loaf). Effectively DEAD WEIGHT.

## Key facts (row counts)
- 41 recipe_canonicals total; 39 have version_steps (rich); 2 are legacy-only seeds.
- tasks: 91 · equipment: 61 · version_steps: 755 · execution_variants: 43.
- execution_variants: 40 `is_canonical_variant=true` (one default per recipe),
  3 other, **0 `is_user_fork=true`** → fork infrastructure BUILT but DORMANT, and
  NOT surfaced in the public read path.
- food_families: 3 / food_family_members: 2 → concept layer barely populated.
- entity_relations: 0 → generic relation table, unused.

## What this means (the honest practical state)
1. **The rich model IS the system.** 95% of recipes. `version_steps.task_id→tasks`
   means steps already reference catalogued tasks — the "tasks first-class" design
   is the live reality.
2. **Forks are built but unused & unsurfaced.** execution_variants + override tables
   (variant_step_overrides etc.) implement reference-with-divergence and carry
   `divergence_score`, but no user forks exist and the recipe page doesn't render
   variants. So: data layer ready, UX/read path not wired.
3. **Legacy path serves 2 seed recipes only** — a removable simplification (see below).
4. **`recipes` mirror** is the entry row but its content-fallback is legacy-only;
   its `canonical_id` is the inert self-FK trap (see mirror-table note).

## CONCRETE, SMALL, SAFE CLEANUP OPPORTUNITY
Migrate or reseed the 2 legacy seed recipes into the rich model (give them
version_steps), THEN remove the entire legacy read branch:
`recipe_steps` / `recipe_ingredients` / `recipe_equipment` joins + `mapLegacyRecipe`
+ the dual-read fork in recipes/[slug]/page.tsx. Removes a real chunk of dual-schema
complexity that has caused confusion (and fed the mirror-table bugs). LOW risk
(2 known seeds), HIGH clarity payoff.

## VERIFY-BEFORE-BUILD checklist (carried from reconciliation)
- `recipe_canonicals.composition_level` — confirm it's the intended `kind` enum
  (USER-DEFINED type). Do NOT add a duplicate `kind`.
- `food_families` — decide if this IS the concept layer (likely; repurpose +
  populate) before building any new concept table.
- `entity_relations` (empty) — decide if it backs any of the genuine gaps.

## GENUINE GAPS (real build backlog — confirmed nothing exists for these)
- Demand-capture front door (requested-but-not-made recipe + free→queue/paid→AI-gen).
- Curation-gate workflow at recipe level (flags exist on tasks/equipment only).
- Author modification guardrails (permitted-variation envelope).
- Surfacing forks in the read path + first real user-fork flow (infra is ready).

## NEXT SESSION OPENERS (grounded, small)
1. (Optional quick win) the legacy-path removal above.
2. Confirm composition_level=kind; decide food_families=concept.
3. Pick ONE genuine gap to scope properly (demand front door is the most
   product-defining and the most clearly absent).
