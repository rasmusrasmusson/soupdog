# Soupdog — Recipe Model: Reconciliation with EXISTING schema (v0.1)

**Status:** CRITICAL reframe. The recipe-model design (notes v0.1–v0.6, 2026-06-06)
was reasoned WITHOUT visibility into the live schema. A schema audit then revealed
that MOST of the designed model ALREADY EXISTS in the database — often more mature
than the design. This doc maps design → reality and isolates the genuine gaps.

**Process lesson:** audit the schema BEFORE designing. v0.1–v0.6's value is the
*reasoning* (the "why"), not a build spec. Do NOT build v0.6's 8 tables — that would
duplicate `execution_variants`/`tasks`/`equipment`/`food_families` (a `recipes`-mirror
mistake at scale).

## How a recipe ACTUALLY composes today (from the FK graph)
`recipe_canonicals` (identity) → `recipe_versions` (replace-history;
`parent_version_id` = lineage) → `version_steps` (steps; 755 rows) where
**`version_steps.task_id → tasks`** (steps reference catalogued tasks) and
`version_steps` carries `task_parameters` (jsonb), `is_parallel_prev`,
`parallel_group_id`, `blocking`, `appliance_settings`. Ingredients attach via
`version_step_ingredients (step_id, ingredient_id→ingredients)` and
`version_ingredients`. Forks = `execution_variants` (hang off a `version_id`),
expressing divergence through override tables.

## MAPPING: v0.6 concept → what already exists
| v0.6 concept | Exists as | Status |
|---|---|---|
| recipe identity | `recipe_canonicals` (has `composition_level` ≈ our `kind`, `source`, `confidence_score`, `is_published`) | EXISTS — richer |
| version / replace-history | `recipe_versions` (`parent_version_id` = lineage, `is_canonical_version`) | EXISTS |
| `recipe_element` (arrangement) | `version_steps` (`task_id`→tasks, `task_parameters`) | EXISTS — this IS the composition layer |
| atomic task | `tasks` (91 rows: `parameter_schema`, `is_passive`, `is_parallelisable`, in/out states, `completion_criterion`, `task_family`/`category`, `is_verified`, `content_reviewed`) | EXISTS — MUCH richer than v0.6 |
| tool | `equipment` (61 rows: `task_templates`, `capability_schema`, connected-appliance) | EXISTS — richer |
| ingredient link (typed FK) | `version_step_ingredients`, `version_ingredients` (FK→ingredients) | EXISTS — the "minimal hybrid" is already the reality |
| FORK | `execution_variants` (43 rows: `derived_from_variant_id`, `is_user_fork`, `is_canonical_variant`, `divergence_score`, `variant_axes`, `method_changes`, `variant_label`, `author_id`, `confidence`) | EXISTS — `divergence_score` IS our "unity"; this is more developed than v0.6 |
| fork divergence (reference-not-copy) | `variant_step_overrides` (per-step duration/temp/instruction/appliance overrides), `variant_ingredient_scaling`, `variant_equipment_overrides` | EXISTS — this IS copy-on-write/reference-with-divergence, built |
| concept grouping (m2m) | `food_families` (3 rows) + `food_family_members` (2 rows, m2m, `evidence_grade`/`confidence`) | EXISTS but BARELY POPULATED — likely the concept layer, underused |
| result-ingredient link | `ingredients.transformation_recipe_id`→recipe_versions, `ingredients.linked_canonical_id`→recipe_canonicals | EXISTS |
| Plan materialization | `materialization_policies` (1 row), `meal_merged_recipe` (1 row) | EXISTS, early |
| generic reference layer | `entity_relations` (0 rows: from/to type+id, relation_type, strength, bidirectional, confidence) | EXISTS, UNUSED — a designed general relation table sitting empty |

## KEY INSIGHTS from reconciliation
1. **Forks are already modelled — and better than v0.6.** `execution_variants` +
   override tables = reference-with-divergence. A variant references a version's
   steps and OVERRIDES specific fields (duration, temp, instruction) rather than
   copying. `divergence_score` already exists as a column. Our entire fork/unity
   design is implemented; we just didn't know.
2. **Tasks are first-class, parameterised, with execution semantics** — exactly the
   v0.5 insight, already built with passive/parallel flags (Cook Mode-ready) and a
   taxonomy started (`task_family`/`category`) — the thing v0.6 "deferred."
3. **`composition_level` on recipe_canonicals** is almost certainly the `kind` enum
   we planned to add. CHECK before adding anything.
4. **TWO recipe representations coexist** (the recurring theme): `recipe_canonicals/
   recipe_versions/version_steps` (the rich model) AND the flat `recipes` mirror
   (FKs to itself; the trap from earlier today). The rich model is authoritative;
   `recipes` is the mirror. recipe_steps→recipes (17 rows) is a SEPARATE older
   step table from version_steps (755 rows) — likely legacy.

## GENUINE GAPS (what v0.6 adds that does NOT yet exist)
These are the real candidates for build — concepts from tonight with no home yet:
- **Demand-capture front door** — pending-recipe-request entity + free→queue /
  paid→AI-gen routing. No table for "requested but not-yet-made recipe." NEW.
- **Curation gate workflow** — `content_reviewed`/`is_verified` flags exist on
  tasks/equipment, but no recipe-level curation QUEUE/state machine for additions
  going live (esp. AI-generated forks). Partial; needs the workflow.
- **Author modification guardrails** — "doneness OK, different meat = new recipe."
  No column/table expressing the permitted-variation envelope. NEW.
- **Concept layer activation** — `food_families` exists but has 3 rows; the curated,
  global, many-to-many CONCEPT grouping we designed is effectively unbuilt-in-practice.
  Decide: is `food_families` the concept layer (rename/repurpose) or is concept
  distinct? Likely repurpose.
- **`entity_relations` is empty** — a generic relation table that could back several
  of the above; decide whether to use it or purpose-built tables.

## RECOMMENDED NEXT STEPS (revised — much smaller than "build the model")
1. **Map the existing model fully** — get columns/FKs we still haven't seen
   (`version_ingredients`, `recipe_ingredients`, `recipe_equipment`, `execution_variants`
   relationships to overrides) and confirm how a recipe is READ/ASSEMBLED in code.
2. **Confirm `composition_level` = intended `kind`** before any kind work.
3. **Decide `food_families` vs concept** — is the concept layer this table?
4. **Scope the genuine gaps** (demand front door, curation workflow, guardrails) as
   the actual build backlog — grounded, small, real.
5. **Update HANDOVER** to record that the rich recipe model already exists; future
   sessions must START from the schema, not design in a vacuum.

## What tonight's design notes are now FOR
v0.1–v0.6 are the THEORY of the existing system — the "why" behind
`execution_variants`/`tasks`/etc., plus genuinely new layers (demand, guardrails,
curation flow). Keep them as the conceptual companion to the schema, NOT as a
build spec. This reconciliation doc is the bridge to reality.
