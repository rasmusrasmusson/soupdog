# Soupdog — Recipe Model: Concept / Recipe / Composition (v0.6 — spec-complete)

**Status:** Design COMPLETE at the conceptual + schema level. Not yet built.
Foundational — sits UPSTREAM of `recipe.kind`, the Plan & End-Product rework, the
two-intents note, Cook Mode, and inventory→meal-plan. No open CONCEPTUAL questions
remain; what's left is build execution (DDL, constraints, RLS+grants, migration).

**Guiding principle (v0.3):** the system MEASURES and SUGGESTS; the human NAMES and
DECIDES.

**v0.6 (2026-06-06)** finalises the ERD and resolves the last two schema decisions
(element attachment, concept derivation). Supersedes v0.5's open build-questions.

## The model in one paragraph
A **recipe** is a sibling under a **concept**, and owns only an ORDERED ARRANGEMENT
OF REFERENCES (`recipe_element`s) to three first-class, catalogued, ATOMIC entity
types — **ingredient / tool / task**. Entities are shared globally (curate once,
all benefit); editing one forks it into a new entity; parameters absorb
"differs-only-by-a-value." A recipe produces a **result-ingredient**, through which
its concept membership is DERIVED. Versions own their arrangement (replace-history).
Forks, unity, and graduation operate at the recipe level over shared references.

## FINAL ERD (entities + key columns)
- **CONCEPT** (id PK, name, slug, curated) — curated, global grouping.
- **CONCEPT_INGREDIENT** (concept_id FK, ingredient_id FK) — many-to-many; an
  ingredient may sit in several concepts (overlapping concepts handle
  perception-variance, e-commerce multi-category pattern).
- **RECIPE** (id PK, result_ingredient_id FK, forked_from FK→recipe,
  current_version_id FK, kind, quality_tier).
- **RECIPE_VERSION** (id PK, recipe_id FK, version_number) — replace-history.
- **RECIPE_ELEMENT** (id PK, version_id FK, position, role, parameters jsonb,
  ingredient_id FK, tool_id FK, task_id FK) — THE ONLY recipe-owned content.
- **INGREDIENT** (id PK, name, nutrition, barcode, …) — typed, FK'd, queryable
  (relational heart; inventory/nutrition/"what-uses-X" run on it).
- **TOOL** (id PK, name).
- **TASK** (id PK, name, params jsonb, media jsonb) — Techniques section; curated
  once, referenced everywhere.

## Decision 1 — RESOLVED: elements attach to recipe_version (not recipe)
For a version to MEAN anything, the thing that differs between v1 and v2 must be the
ARRANGEMENT. If elements lived on the recipe, all versions would share one
arrangement and "version" would be empty. So each VERSION owns its element
arrangement. Editing → new version → new (or mostly-shared) elements. Bonus: v2 can
REFERENCE most of v1's elements and own only the changed ones — versions are
"forks of yourself over time," same reference-sharing mechanism as forks between
recipes. Pleasing consistency.

## Decision 2 — RESOLVED: recipe→concept is DERIVED via the result-ingredient
A recipe produces a `result_ingredient`; ingredients belong to concepts
(CONCEPT_INGREDIENT). So a recipe's concept(s) = its result-ingredient's concept(s).
Chain: `recipe → result_ingredient → concept_ingredient → concept`.
- Storing a direct recipe→concept FK would DUPLICATE this and risk drift (the
  dual-source-of-truth bug class that bit the mirror table this session). Derived =
  single source of truth.
- This is also what v0.4 already committed to ("recipes attach via their
  result-ingredient's membership"); the interim ERD's direct FK was dropped to match.
- Edge case (recipe before its result-ingredient exists) doesn't arise: every recipe
  produces a result-ingredient (two-intents note — even a 1:1 materialised one).
- The `result_ingredient_id` link is LOAD-BEARING TWICE: it derives concept AND is
  the Intent-2 "make this" relationship (recipe page's `transformation_recipe_id`
  seen from the recipe side).

## Polymorphic reference on RECIPE_ELEMENT — RESOLVED (three nullable FKs + CHECK)
A `recipe_element` references exactly ONE of ingredient/tool/task. Implemented as
three nullable FK columns (`ingredient_id`, `tool_id`, `task_id`) — each a real FK so
the DB enforces existence — plus a CHECK so exactly one is set:
```sql
CHECK (num_nonnulls(ingredient_id, tool_id, task_id) = 1)
```
Chosen over `(entity_type, entity_id)` because the latter loses FK enforcement — and
this session's bugs were exactly unenforced-id problems.

## Atomic entities + copy-on-EDIT (recursion stops at the leaf)
- Reference an entity when it matches (system SUGGESTS existing matches first — dedup,
  like ingredient find-or-create). EDIT forks it into a NEW entity (atomic
  copy-on-edit) — same principle as recipe graduation, at the leaf.
- Entities do NOT recursively fork/version — tasks are NOT composite/partially-
  referenceable. Stops "turtles all the way down" and keeps tasks consistent with
  ingredients/tools (all atomic).
- **Parameters** absorb "differs only by a value": "fold for {n}s" is ONE task at
  many durations; "add {ingredient} to bowl" parameterises the ingredient. NOT
  composite — parameterised-atomic.
- Proliferation (many near-identical entities) handled by suggest-matches-first +
  later AI/curation merge/parameterise — same as ingredients today.

## Forks / unity / graduation — at the RECIPE level
- **Fork** = a recipe sharing most element-references, swapping some (medium-rare
  task→medium task) or changing parameters (oven time).
- **Unity** = shared element-refs ÷ total (length-weighted). Trivial to compute.
- **Graduation** = copy remaining shared refs into new/owned entities; keep
  `forked_from`. = an act of NAMING (subjective/cultural → suggested, never
  automated; algorithm signals, AI adds cultural meaning).
- **Fork-as-interactive-choice** (Cook Mode): on a choice-swap, shared refs don't
  move; only divergent element-refs change → seam invisible.

## Cardinality note for DDL
RECIPE→INGREDIENT "produces result" is likely ONE-ingredient-to-MANY-recipes
(`INGREDIENT ||--o{ RECIPE`), not strictly 1:1 — multiple recipes can produce the
same precise result-ingredient. Confirm when writing DDL.

## Carried context (unchanged from earlier versions)
- Ingredient link stays RELATIONAL (typed FK) — inventory→meal-plan, "what uses X",
  nutrition roll-up all run on it (minimal-hybrid decision).
- Author guardrails + fork-vs-new-recipe keystone (aligns technical / social /
  curation layers). [v0.4]
- Execution (Cook Mode): portion-aware sessions, per-participant defaulting, voice
  input. [v0.4]
- Demand: fork-requests front door; free→queue+upgrade / paid→AI-gen-contributes-to-
  catalogue; quality tiers (AI<chef<lab); curation gate (human now, AI at scale).
  [v0.4] See Content Provisioning & Budget + Demand Model docs.

## BUILD EXECUTION (what remains — no conceptual questions left)
- DDL for the 8 tables above + the polymorphic CHECK.
- RLS policy + GRANT on EVERY new table (the session's recurring gotcha).
- `gen_random_uuid()` defaults + grants on new tables.
- MIGRATION of the existing 40 recipes (old recipe_versions / version_ingredients /
  version_steps) into the composition model — biggest single build task.
- Backfill `result_ingredient_id` for existing recipes.
- THEN: add `recipe.kind` enum (composed/simple/acquire/delivery/none); then the
  Plan & End-Product bridge (repoint plan FK).

## DEFERRED (separate, doesn't block)
- **Technique-section taxonomy** — how tasks are ORGANISED for browsing
  ("cutting techniques > cut a steak"). Storage (atomic task) ≠ discovery (category
  hierarchy). Likely a category tree, possibly many-to-many — SAME SHAPE as
  concept→ingredient grouping, so that pattern probably transfers. Design later.

## Why this is the foundation
Resolved end to end: concept → recipe → version → element → atomic entities, with
every reference mechanism specified (polymorphic FK+CHECK, version-owned elements,
derived concept, forked_from). The v0.5→v0.6 work turned a vague "mirror-table debt"
worry (start of session) into a complete, buildable spec. Everything downstream
hangs off this.
