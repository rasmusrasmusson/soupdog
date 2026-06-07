# Soupdog — Atomic Recipe Decomposition: editorial → executable graph (v0.3)

**Status:** Design note, not built. Defines what a Soupdog recipe fundamentally IS
going forward. Builds on recipe-model v0.6 + the AS-BUILT schema. Existing recipes
stay as-is; governs NEW recipes (import-first).

**v0.2 (2026-06-07)** resolved the four open questions and reframed decomposition
as building an executable DEPENDENCY GRAPH (DAG).
**v0.3 (2026-06-07)** adds: find-or-create reuse at ALL THREE catalogue levels
(ingredient / task / sub-recipe-intermediate), and a forward-pointer to the
commercial value of the intermediate catalogue (see companion strategic note).

## The principle
Old recipes are **editorial** (prose for a human to interpret). Soupdog recipes are
**executable** — a structured graph for the IoT age (connected appliances, Cook Mode,
automation, parallel scheduling, division of labour). An AI **decomposition** pass
converts editorial → executable.

## RESOLVED Q1 — Granularity: MAXIMALLY ATOMIC
One step = one catalogued task applied to a minimal input. **One ingredient per
add-step, always** (4 ingredients added → 4 "add" steps, even if the source bundles
them). Stop at the culinary verb — do NOT model physical micro-motions (pick up,
pour, set down) or retrieval/opening; assume continuity (the bowl persists between
steps). Rationale: per-ingredient atomicity enables exact add-order/timing, parallel
prep, and per-portion/fork divergence (one portion gets ingredient Z, another
doesn't). Verbosity is absorbed by the display layer (Q4).

## RESOLVED Q2 — Task matching: match on TRANSFORMATION, parameters absorb variants
Find-or-create against the `tasks` library (91 rows):
- Match on the underlying **culinary transformation**, not wording. "Sauté" /
  "fry gently" / "cook in a little oil" → same task ("sauté") + parameters.
- **Parameters absorb intensity/duration/medium.** "stir" / "stir gently" /
  "stir vigorously" = ONE task + vigour parameter, not three. (v0.5 parameterised-
  atomic principle.)
- **Different transformation = different task.** sauté ≠ sear ≠ boil ≠ fold (genuinely
  different motions/conditions), even though all "apply heat" or "mix."
- **Bias to reuse, but NEVER collapse distinct transformations.** Over-matching
  produces WRONG recipes (sear→sauté); over-creating is merely untidy. So lean to
  reuse, but a wrong collapse is the worse error.
- New/uncertain tasks enter **unverified / AI-sourced** (`source`/`is_verified`/
  `content_reviewed`/`status` cols), usable-but-flagged, blessed by the curation gate;
  periodic AI/curation merge of near-duplicates. Library GROWS with each upload and
  SATURATES over time (early uploads create many tasks; later ones mostly reference).
  This is the compounding content moat: every editorial upload enriches the shared
  executable catalogue. Same find-or-create pattern already used for ingredients.

## Find-or-create at ALL THREE catalogue levels (v0.3)
The find-or-create pattern is not just for tasks — it applies recursively at three
levels, all the same mechanic (match → reference if found, else create-unverified,
curation blesses, library saturates):
1. **Ingredient** — already how it works.
2. **Task** — Q2 above.
3. **Sub-recipe / intermediate (a GROUP)** — NEW in v0.3.

When decomposition produces a group (an intermediate-producing sub-graph), the AI
**searches for an existing matching sub-recipe / intermediate BEFORE writing a new
one, and references it if found.** Much kitchen prep is shared and highly repetitive
— especially in cuisines like Indian (ginger-garlic paste, fried onions/birista,
tarka/tempering, spice blends). "Chop 200g red onion → chopped red onion",
"ginger-garlic paste", "basic tomato sauce", "marinated chicken" recur across huge
numbers of recipes. Catalogue once, reference everywhere.

Backed by existing schema: a group = a sub-recipe (`version_sub_recipes`); its output
= a result-ingredient (`ingredients.transformation_recipe_id` → the sub-recipe that
makes it). Referencing a shared "ginger-garlic paste" sub-recipe is the SAME machinery
as referencing a shared task or ingredient.

**Effect on AI cost/quality:** doesn't speed a SINGLE decomposition (the AI still must
recognise "this is chopping onion" to match it), but in AGGREGATE over time it:
- reduces what gets written/stored (reference vs generate fresh sub-recipe content),
- improves quality/consistency (the shared prep is curated once — timing, technique,
  video — and all recipes inherit the good version vs many mediocre re-derivations),
- compounds saturation (early recipes create the common preparations; later recipes
  increasingly just reference them, so marginal decomposition gets lighter).

**Caveat — matching sub-recipes is FUZZIER than tasks** (a sub-recipe is a small graph,
not one verb), so dedup/curation discipline matters MORE here: parameterise
("chopped onion" with quantity/cut parameters, not 50 variants) + curation merge of
near-duplicate intermediates. Same answer as tasks, higher stakes.

## RESOLVED Q3 — When it runs: INLINE (two internal steps, one user action)
Decomposition runs INLINE during import — NOT a separate user-visible stage.
- Internally TWO steps in one import call: **step 1 = parse/extract** (bundled,
  faithful) → **step 2 = decompose into the atomic executable graph**.
- **User sees ONLY step 2's output** (the finished atomic recipe). No confusing
  "bundled-then-morphs" UX. User waits a bit longer once, at import.
- **Step 1's bundled extraction is PERSISTED but hidden** — it's the re-decomposition
  source. If step 2 is wrong or the decomposition rule improves later, **re-run ONLY
  step 2** against the stored step-1 output — no re-import, no re-parse, cheaper.
- Why inline (not a separate pass): both are AI calls you pay for regardless (import
  already uses AI), so two stages save no money and only add UX confusion + a queue.
  Membership free/paid tiering belongs to the DEMAND feature (who can request brand-
  new recipes), NOT to decomposing recipes already being imported.
- Implementation note: persist the raw parsed/bundled recipe (text/JSON) in a
  column/small table as the regeneration source.

## RESOLVED Q4 — Structure & display: FULL DEPENDENCY DAG (the big reframe)
A recipe is a **directed acyclic graph**, not a flat sequence.
- **Nodes** = atomic task-steps. **Edges** = dependencies (this step needs that
  intermediate first).
- **Groups = intermediate-producing SUB-GRAPHS = sub-recipes**, backed by the
  existing **`version_sub_recipes`** (parent_version_id / child_version_id /
  child_canonical_id). "Marinade" is a sub-recipe producing *marinated chicken*; the
  parent consumes it. A group is the same "produces a result-ingredient" pattern,
  recursively.
- **Intermediates fan out.** "Chop 200g onion" → an intermediate consumed by BOTH
  "Sauce" (100g) and "Salad" (100g): one node, two outgoing edges. A DAG expresses
  this; a linear list cannot.
- **Parallelism / division of labour read off the graph.** Independent sub-graphs
  (no dependency edge) run concurrently or split across cooks. Uses existing
  `is_parallelisable` / `parallel_group_id` (on version_steps + tasks).
- **Bottom-up derivation.** When groups aren't explicitly labeled, DERIVE them by
  tracing dependencies backward from the final product; convergence points (combines,
  incl. PLATING) are group boundaries. **Explicit labels override derivation**
  (a cook named "Marinade"/"Masala sauce" for a reason — Vindaloo/Tikka do this).
- **The recursion (one structure, all levels).** Meal = ONE recipe → ONE end product,
  composed of dish sub-recipes, each composed of group sub-recipes, each a chain of
  atomic steps. Backed by `version_sub_recipes` + `meal_component` +
  `meal_merged_recipe`. Same abstraction at meal / dish / group / step.
- **Display follows structure.** Show each sub-graph as a readable section (by label
  or derived); within a section, contiguous same-task(+same-tool) atomic steps
  collapse into one readable line ("Add yogurt, curry paste, garam masala, 4g salt to
  the bowl; combine") — re-bundling the atoms back toward the editorial sentence.
  Data stays atomic underneath (Cook Mode/appliances/timing read the atoms); humans
  read the re-bundled view. Editorial in → executable graph in the middle →
  editorial-readable out.

### Ambition cost (honest)
The decomposition AI must BUILD A GRAPH, not a list: identify intermediates, infer
dependencies (what must precede what), find convergence points. This is meaningfully
harder than linear atomic decomposition — dependency inference is the hard part and
leans on the curation gate for early correctness. But it is the RIGHT target: a
linear decomposition would discard exactly the structure (parallelism, reuse, sub-
recipe composition, meal=recipe) that makes Soupdog valuable. The same DAG powers
Cook Mode scheduling, division of labour, meal-merge, and intermediate reuse — one
structure, many features.

## Why the schema already supports all of this (recurring theme)
`version_steps` (task_id, task_parameters, is_parallel_prev, parallel_group_id,
blocking, appliance_settings); `tasks` (parameter_schema, is_passive,
is_parallelisable, completion_criterion, suggested_tool_slugs, required_equipment_type,
is_verified/content_reviewed/source); `version_ingredients.step_id`;
`version_step_ingredients`; **`version_sub_recipes`**; `meal_component`;
`meal_merged_recipe`; `materialization_policies`. Decomposition POPULATES existing
structure; it is not new schema.

## Quality & curation
AI-decomposed recipes enter at the AI quality tier (AI < chef < lab) and pass the
curation gate. Decomposition (esp. dependency inference, tool inference, completion-
vs-duration) won't be perfect — the gate is exactly why AI-drafting is safe.

## The moat
Decomposition is how Soupdog's structured-content advantage BUILDS ITSELF from
editorial sources. Every editorial recipe uploaded → converted to an executable DAG
AND enriches the shared curated task/tool/ingredient catalogue. Editorial recipes are
pre-IoT artifacts; Soupdog turns them into executable graphs and accumulates a
reusable catalogue as a side effect of normal uploads.

## Remaining before build (now mostly mechanical / prompt-design)
- The decomposition PROMPT: emit a DAG (nodes + dependency edges + intermediates +
  group/sub-recipe boundaries), do find-or-create task matching, infer tools
  (anchored to suggested_tool_slugs), map "until X" → completion_criterion.
- Dependency-inference quality: how the AI determines edges + convergence points
  (the hard part) — needs examples + eval.
- How sub-recipe boundaries map onto version_sub_recipes rows at insert time.
- Display: the collapse-contiguous-same-task rule + section rendering from the DAG.
- Storage of the persisted step-1 bundled extraction (column vs small table).
