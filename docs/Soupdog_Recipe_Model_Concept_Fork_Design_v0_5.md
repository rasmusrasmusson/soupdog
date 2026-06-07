# Soupdog — Recipe Model: Concept / Recipe / Composition (v0.5)

**Status:** Design note, not built. Foundational. Sits UPSTREAM of `recipe.kind`,
the Plan & End-Product rework, the two-intents note, and Cook Mode. Do NOT add
`kind` or repoint plan schema until this is built.

**Guiding principle (v0.3):** the system MEASURES and SUGGESTS; the human NAMES and
DECIDES.

**v0.5 (2026-06-06)** resolves the field-level reference schema — and in doing so
SIMPLIFIES the model significantly. The "copy-on-write content blocks" idea from
the v0.4 build-questions section is SUPERSEDED. Key realisation: recipes don't OWN
forkable content; they compose REFERENCES to shared, catalogued, atomic entities
(ingredient / tool / task). Forking and unity live entirely at the composition
level. This collapses two sharing mechanisms into one.

## The composition model (v0.5 — the resolution)
**A recipe owns only an ORDERED ARRANGEMENT OF REFERENCES.** It does not contain
ingredient/step/tool content — it points at catalogued entities and supplies
recipe-specific parameters.

Three first-class, catalogued, ATOMIC entity types — each with its own section,
page, curation/improvement path, translations, and media:
- **Ingredient** — Ingredients section (typed: nutrition, culinary roles, FK,
  barcode, queryable — the relational heart; see "block_ingredient" note below).
- **Tool** — Tools section.
- **Task / technique** — Techniques section. (NEW in v0.5: tasks become first-class
  like ingredients/tools, instead of being recipe-owned step text.)

### Why tasks are first-class (the insight that simplified everything)
Steps/tasks are NOT recipe-specific content. "Add ingredients to bowl" is used in
~95% of baking recipes — identical instruction. Storing it in every recipe means
10,000 copies; making it a catalogued entity means ONE, improved once (graphics,
video, curated translations) and every recipe using it benefits instantly. You
CANNOT get curate-once leverage if steps are copied per recipe. So tasks join
ingredients and tools as reusable referenced entities. This collapsed the model:
there is now ONE sharing pattern (reference a catalogued entity), not two (entity
refs + recipe-internal copy-on-write blocks). Copy-on-write content blocks are
no longer needed.

### Schema shape
- `recipe (canonical)` — identity; gains `forked_from` (lineage), `kind` (later),
  concept membership.
- `recipe_element` — THE ONLY recipe-owned content. One row per referenced entity:
  `(recipe_id, position, role, parameters, → entity ref)`. Ordered arrangement +
  per-reference parameters (quantity, duration, which bowl).
- `ingredient` / `tool` / `task` — the catalogued atomic entities, shared globally.

### Atomic entities + copy-on-EDIT (the recursion stops here)
- A recipe REFERENCES an entity when it matches exactly (user points at it; system
  SUGGESTS matching existing entities first — dedup pressure, same as ingredient
  find-or-create).
- EDITING a referenced entity FORKS it into a NEW entity (atomic copy-on-edit).
  This is the same principle as recipe graduation, applied to the atomic leaf.
- **Entities are ATOMIC leaves — they do NOT recursively fork/version.** Tasks are
  NOT composite/partially-referenceable. This deliberately STOPS the recursion
  (no task-forks-from-task machinery, no turtles all the way down). Keeps tasks
  consistent with ingredients/tools (which are also atomic — ribeye is ribeye or a
  different ingredient).
- **Parameters absorb the "differs only by a value" case** to curb proliferation:
  "fold for {n} seconds" is ONE curated task used at many durations, not N tasks.
  ("add {ingredient} to bowl" likewise parameterises the ingredient.) This is
  parameterised-atomic, NOT composite.
- Accepted cost: the entity catalogues proliferate (many near-identical tasks).
  Handled by the SAME tools already planned for ingredients: suggest-matches-first
  (dedup), plus later AI/curation merge or parameterise. Known, handled problem.

### Forks, unity, graduation — all at the RECIPE level (unchanged in spirit)
- A **fork** = a recipe sharing most element-references with another, swapping some
  (medium-rare task → medium task) or changing parameters (oven time).
- **Unity** = shared element-refs ÷ total element-refs (length-weighted naturally).
  Trivial to compute now (count shared refs).
- **Graduation** = copy the remaining shared refs into recipe-owned/new entities;
  keep `forked_from`. Cutting the cord = stop sharing refs.
- Fork-as-interactive-choice (v0.4) still holds: shared refs don't move on a
  choice-swap; only the divergent element-refs change. Seam invisible because
  shared entities are referenced.

## Ingredient link must stay relational (decided earlier; reaffirmed)
Even though parameters/step content can be flexible, the recipe→ingredient link is
the RELATIONAL HEART and must be DB-enforced (typed FK), because the roadmap runs
on ingredient queries:
- Inventory → meal plan ("kitchens upload inventory, get meals they can make").
- "What recipes use ingredient X" (two-intents Intent 1 / linkedRecipes).
- Nutrition roll-up, allergen queries, culinary-role system.
Pure-JSONB content would make these slow/fragile and drop FK safety (the exact
class of bug that cost hours this session). So: the ingredient reference is typed +
FK'd; flexible/JSONB is fine for step/media payload the DB needn't reason about.
(This is the "minimal hybrid" decision.)

## Flagged for the ERD / build pass (mechanical)
- **Polymorphic reference on `recipe_element`** — a row points at ONE of
  ingredient/tool/task. Postgres polymorphic FKs are finicky. LEAN: three nullable
  FK columns (`ingredient_id`, `tool_id`, `task_id`) + a CHECK that exactly one is
  set — so the DB still enforces each link (preferred given this session's FK
  lessons). Alternative `(entity_type, entity_id)` pair loses FK enforcement.
- **Parameter storage** on `recipe_element` (jsonb is fine — recipe-specific,
  DB needn't reason about it) vs typed where it must be queried.
- **Migration** of the existing 40 recipes (old recipe_versions →
  version_ingredients/version_steps) into the composition model.
- **Reconciliation with `recipe_versions`** — a version = a snapshot of a recipe's
  element arrangement (still to nail vs the composition layer).

## DEFERRED (separate problem, doesn't block schema)
- **Technique-section taxonomy** — how tasks are ORGANISED for browsing
  (e.g. "cutting techniques > cut a steak"). Storage (atomic task entity) is
  independent of discovery (category hierarchy over tasks). Likely a category tree,
  possibly many-to-many — SAME SHAPE as the concept→ingredient grouping, so that
  pattern probably transfers. Design later; costs nothing structural to defer.

## The model, end to end (where v0.5 leaves it)
- **Concept** — curated, global, many-to-many grouping of ingredients. [v0.2]
- **Recipe** — a sibling under a concept; composes element-references. [v0.5]
- **recipe_element** — ordered arrangement + parameters + one entity ref. [v0.5]
- **Ingredient / Tool / Task** — atomic catalogued shared entities; copy-on-edit
  forks them; parameterised to curb proliferation. [v0.5]
- **Version** — replace-history (snapshot of arrangement; reconcile in build).
- **Fork / unity / graduation** — at recipe level over shared refs. [v0.3/v0.4/v0.5]
- **Author guardrails + fork-vs-new keystone** — [v0.4]
- **Execution (Cook Mode)** — fork-as-choice, portion-aware, per-participant
  defaulting, voice. [v0.4]
- **Demand** — fork-requests front door; free→queue / paid→AI-gen-contributes;
  quality tiers; curation gate. [v0.4]

## Why this is the foundation
The conceptual model is now resolved from concept level down to the composition
schema. What remains is the mechanical ERD (polymorphic-FK choice, version
reconciliation, migration) + the deferred technique taxonomy. v0.5's simplification
(tasks first-class → one reference pattern, no copy-on-write blocks) makes the
build materially cleaner. Everything downstream (kind, Plan rework, two-intents,
Cook Mode, inventory→meal-plan) hangs off this.
