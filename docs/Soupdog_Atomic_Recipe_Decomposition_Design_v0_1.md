# Soupdog — Atomic Recipe Decomposition: editorial → executable (v0.1)

**Status:** Design note, not built. Defines what a Soupdog recipe fundamentally IS
going forward. Builds on the recipe-model notes (v0.6) and the AS-BUILT schema.
Existing recipes stay as-is; this governs NEW recipes (import-first).

## The principle
Old recipes are **editorial** — prose written for a human to interpret ("combine
yogurt, curry paste, garam masala and 4g salt, coat the chicken"). Soupdog recipes
are **executable** — a structured graph for the IoT age (connected ovens, Cook Mode,
automation, per-step timing). The bridge between the two is an AI **decomposition**
pass that makes the implicit atomic structure explicit.

**Atomic step = one task, on a minimal input, with the tool named.** Not "add all
this and stir" but:
1. Ingredient: yogurt · Tool: bowl · Task: add to bowl
2. Ingredient: curry paste · Tool: bowl · Task: add to bowl
3. Ingredient: garam masala · Tool: bowl · Task: add to bowl
4. Ingredient: salt (4g) · Tool: bowl · Task: add to bowl
5. Tool: bowl, whisk · Task: combine
6. Ingredient: chicken · Tool: bowl · Task: coat

## Why this is possible NOW (schema already built for it)
The reconciliation/as-built audit showed the schema ANTICIPATED this:
- `version_steps.task_id → tasks`, plus `task_parameters` (jsonb),
  `is_parallel_prev`, `parallel_group_id`, `blocking`, `appliance_settings`.
- `tasks` (91 rows): `parameter_schema`, `is_passive`, `is_parallelisable`,
  `typical_input_state`/`typical_output_state`, **`completion_criterion`** +
  `completion_measurable`, `suggested_tool_slugs`, `required_equipment_type`,
  `task_family`/`category`, and `is_verified`/`content_reviewed`/`status`/`source`.
- ingredient↔step link via `version_step_ingredients` / `version_ingredients.step_id`
  (nullable today — that's why current recipes show "—" in per-step columns).
So decomposition POPULATES existing structure; it is not new schema.

## The decomposition rule (the substance of the feature)
For each editorial instruction, AI produces atomic steps:
- **Split bundled actions.** "Combine A, B, C" → add A, add B, add C, combine.
- **One task per step**, mapped to the tasks library (see find-or-create below).
- **Name the tool per step.** Tool often NOT stated in source ("combine yogurt…"
  implies a bowl) → infer it, preferring `tasks.suggested_tool_slugs` /
  `required_equipment_type` so inference is anchored, not guessed.
- **Duration vs completion criterion.** "Sauté until golden" is a STATE, not a time
  → map to `completion_criterion` ("until golden"), do NOT invent a duration.
  "Simmer 20 min" → duration. Tasks table distinguishes these already.
- **Granularity ceiling.** Atomic but NOT absurd. Decompose real culinary actions
  (add / stir / sauté / coat / fold); do NOT model trivial implicit motions
  ("pick up spoon"). Assume continuity (the bowl from step 1 is still there in
  step 2). State the ceiling explicitly so recipes don't explode into nonsense.
- **Carry quantities** through to the step that uses them ("4g salt" → that step's
  parameter). An ingredient may appear in MULTIPLE steps (salt in marinade AND at
  finish) — allowed; map each occurrence to its step.

## Task find-or-create against the library (the COMPOUNDING mechanism)
When decomposition hits an action, AI does find-or-create against `tasks`:
1. **Search the existing library** for a matching task → if found, REFERENCE it
   (inherits its curated media, translations, parameter schema, completion criteria).
2. **If genuinely novel, CREATE a new task** → now every FUTURE recipe can reference
   it. The library GROWS with each upload and SATURATES over time (early uploads
   create many tasks; later uploads mostly reference, rarely create). Marginal cost
   of each new recipe drops. This is "curate once, benefit everywhere" — curate
   "fold egg whites" once (video/translations/tips), all recipes using it inherit.
This is the SAME find-or-create pattern already used for ingredients; tasks behave
like ingredients — a shared catalogue matched-first, extended only when new.

### Dedup discipline (or the library bloats)
Task matching is FUZZIER than ingredients: "sauté" / "fry gently" / "cook in a little
oil" may be the same task. Rules:
- **Prefer matching an existing task + PARAMETERS over creating a new one.** "stir"
  vs "stir gently" vs "stir vigorously" = ONE task with a vigour/duration parameter,
  NOT three (the v0.5 parameterised-atomic principle). Parameters absorb
  "differs-only-by-a-value."
- Suggest-matches-first; create only when genuinely novel.
- Periodic AI/curation merge of near-duplicates.

### Curation gate for new tasks (shared library = needs a gate)
The tasks library is GLOBAL — a task the AI invents from one recipe becomes available
to everyone. So new tasks enter **unverified / AI-sourced** (use existing
`source`/`is_verified`/`content_reviewed`/`status` columns), usable-but-flagged, and
pass the curation gate before being blessed (canonical, curated media). Library grows
automatically; quality is gated. Same principle as AI-generated recipes entering at
the AI quality tier.

## Storage vs display
- **Store atomic** — the fine-grained execution graph (machine-precise: Cook Mode,
  appliance automation, per-step timing all need this).
- **Display grouped/readable for humans** — 8 editorial steps may become 30+ atomic
  steps; a human reading the recipe page shouldn't wade through 30 one-line rows.
  Present atomic data re-bundled into readable groups (the recipe page already groups
  by `group_label`). Data atomic underneath; display human-friendly on top.

## Where the decomposition runs
- **Import pass (primary)** — the dominant path for new recipes (Word/Excel/PDF/text).
  AI already reads the step text; decomposition is a prompt + insert-logic change to
  populate `task_id`, `task_parameters`, tool refs, and `version_*.step_id`.
- **Manual creation** — the editor offers per-step task/tool/ingredient structure
  (later build; low priority while no manual-creation volume).
- **Paid AI-generation** — the demand-model paid path produces recipes already in
  atomic form. (Ties to Content Provisioning & Demand docs.)

## Quality & curation (consistent with the model)
AI-decomposed recipes enter at the AI quality tier (AI < chef < lab) and pass the
curation gate. Decomposition won't be 100% perfect (tool inference, completion-vs-
duration, granularity judgment) — the gate is exactly why it's safe to let AI draft.

## Why this matters (the moat)
This is more than parsing: it's how Soupdog's structured-content advantage BUILDS
ITSELF from editorial sources. Every editorial recipe uploaded makes the executable
task library richer for the next one. Editorial recipes are legacy artifacts of the
pre-IoT age; Soupdog converts them into executable graphs and accumulates a curated,
reusable task/tool/ingredient catalogue as a side effect of normal uploads.

## Open / to decide before build
- Exact granularity ceiling (where "atomic" stops) — needs a concrete rule + examples.
- Task-matching threshold (fuzzy match strictness) + the normalization approach.
- Whether decomposition is inline in import or a SEPARATE enrichment pass (import
  fast/bundled, then a "structure into execution graph" pass — possibly the paid path).
- Human-display grouping rule (how to re-bundle atomic steps readably).
