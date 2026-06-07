# Soupdog — Culinary Knowledge Layer (Guide + Techniques/Tools Pages) — Design v0.4

**Status:** PARTLY BUILT. 2026-06-07. v0.4 = v0.3 + §2e (tasks that prepare a
TOOL/apparatus, not an ingredient — bain-marie, preheat oven), captured during the
curation build. v0.3 added §2c (typed completion signals) and §2d (heat-mechanism
taxonomy). This v0.4 is the single canonical version — discard any v0.2/v0.3 copy.
NOTE: Phase A (guide injection + verified core seed) and part of Phase B (Techniques
pages + task curation admin view) are now SHIPPED — see the handover; this doc is the
theory, the handover has the build status.
Supersedes BOTH the earlier guide-layer v0.1 AND the interim v0.2 drafts (same filename,
mid-edit — this v0.3 is the single canonical version; discard any v0.2 copy.) Widens it (per Rasmus) from tasks-only to the full task × ingredient × tool knowledge layer,
and tying it to the public Techniques and Tools pages. **Grounded in a CONFIRMED live
schema audit** (this session) — not assumptions.

---

## 0. Headline finding (audit before designing — again)

The schema is ALREADY BUILT for everything Rasmus intuited. The work is overwhelmingly
**populate + curate + expose**, not new structure. Confirmed live:

- **`tasks` (96 rows, 0 verified)** already has, unused/empty:
  `completion_criterion`, `completion_measurable`, `typical_duration_min_seconds`,
  `typical_duration_max_seconds`, `duration_is_exact`, `duration_label`,
  `typical_input_state`, `typical_output_state`, `required_equipment_type`,
  `optional_equipment_type`, `suggested_tool_slugs`, `parameter_schema`,
  `skill_level_required`, `is_passive`, `is_parallelisable`, `yield_factor`,
  PLUS content fields `description`, `tips`, `common_mistakes`, `image_url`, and the
  curation set `is_verified`/`content_reviewed`/`source`/`confidence`.
  → The task table is ALREADY the guide AND the Techniques page. It just isn't filled.
- **`equipment` (61 rows)** already has `task_templates jsonb`, `capabilities`,
  `capability_schema`, `parent_id` (CONCEPT hierarchy), `uses[]`, `summary`,
  `description_long`, `image_url`, `content_reviewed`, `source`. → Already the Tools
  page AND the tool side of the guide; `parent_id` is the "large-pan → Pan" concept
  tier Rasmus asked about — it EXISTS.
- **`culinary_roles` (39) + `ingredient_roles` (292 across 299 ingredients)** — ingredient
  AFFORDANCES are already substantially populated. → Ingredient-guidance ("what can you
  do with this ingredient") RIDES ON ROLES; not new data.
- **`entity_relations` (0 rows, rich generic schema)**: `from_type/from_id →
  to_type/to_id`, `relation_type`, `strength`, `confidence`, `context`, `notes`,
  `source`, `is_bidirectional`. → The ready-made, currently-EMPTY home for the
  (ingredient × tool → task) "interaction" idea, and for ingredient↔task affordance
  edges if we want them explicit.
- **`ingredients`** has `parent_id` (concept tier), `uses[]`, `taste_profile`, content
  fields, and the same curation set.

Every concept tier, content field, and curation flag Rasmus described already has a
column. This is a fill-and-surface job.

---

## 1. The core reframe: ONE knowledge layer, TWO faces

There is a single body of **curated culinary knowledge** — tasks (techniques),
equipment (tools), ingredients, and the relationships among them. It has two faces:

- **AI face = the GUIDE.** Fed into the decompose prompt so the model MATCHES known,
  verified knowledge instead of inventing (fixes the consistency bugs: the boil/cook
  misplacement, the dropped "until crispy").
- **Human face = the PAGES.** `/techniques`, `/techniques/[slug]`, `/tools`,
  `/tools/[slug]`, `/ingredients/[slug]` render the SAME rows for users to browse/learn.

Same data, two renderers — exactly like RecipeDisplay (one recipe, preview + saved
view). **Curating a task improves BOTH the AI's decomposition AND the public Techniques
page, from one edit.** This is why Rasmus correctly felt they're "closely related":
they are the same spine.

---

## 2. Answering Rasmus's three questions

### Q1 — "Techniques & Tools pages are closely related to the guide." → YES, same spine.
A *technique* IS a task seen from the user side. Techniques page = public render of
`tasks` (name, description, tips, common_mistakes, image, typical duration, tools).
Tools page = public render of `equipment` (summary, description_long, uses, image,
parent concept, task_templates). The guide is the AI render of the same. Build the
DATA once; both faces fall out.

### Q2 — "Does the guide apply to ingredients — what to do given an ingredient?" → YES, via ROLES.
Two directions, both already supported:
- **Task → expectation** (v0.1): a task advertises what it expects (completion,
  duration, input/output state). Anchors the verb + fixes dropped criteria.
- **Ingredient → affordance** (Rasmus's addition): what tasks suit an ingredient.
  Rides on `culinary_roles`/`ingredient_roles` (292 rows already) + `ingredients.uses`.
  A "starch" affords boil/bake; an "acid" affords deglaze/dress; an "aromatic" affords
  sauté/bloom. The role→task affinity can live as `entity_relations`
  (role→task, relation_type='affords') OR be expressed in the guide text per role.

### Q3 — "A table where ingredient meets tool(s), with a guide for how to write the task." → `entity_relations`.
This is the richest idea and the one genuinely-empty piece. The (ingredient × tool)
→ task intersection ("spaghetti + pot-of-boiling-water → boil"; "onion + chefs-knife →
chop"; "egg + whisk + bowl → whisk") is a typed edge. `entity_relations` already models
typed edges with `context`/`notes`/`strength`/`confidence`. Represent as either:
- a relation per pair (ingredient→task 'typical_task', tool→task 'performs'), composed
  at retrieval time, OR
- a higher-order "interaction" relation keyed by context (more bespoke).
**Lean: keep it as simple typed edges (ingredient→task affordance, tool→task performs)
and let the guide COMPOSE the (ingredient×tool→task) suggestion at decompose time.** A
full first-class interaction table is deferred until the simple edges prove insufficient
(don't over-build the abstraction — v0.3 discipline).

The "guide for how to write the task" (phrasing) belongs with the TASK
(`duration_label`, `completion_criterion`, and a future display/template field — see the
deferred Instruction-Composition work), not duplicated per interaction.

---

## 2b. Machine truth vs the human filter (intermediate visibility)

A core purpose of Soupdog is to drive smart cooking appliances. To a machine,
"pasta + boiling water" is a perfectly ordinary ingredient — a node in the graph, no
stranger than any other. Every task produces new ingredient(s): Boil produces
"pasta-in-boiling-water" (and steam, ignored); Drain consumes that and produces TWO
new ingredients — cooked pasta AND pasta water (a genuinely useful ingredient chefs
reuse in sauces); Reserve (a mid-cook ladle) yields pasta water plus the slightly-
reduced pot contents.

**The graph stores ALL of this, rigorously and completely** (machine truth). It is what
an appliance executes against.

**The DISPLAY applies a HUMAN/CULTURAL FILTER** — it does NOT surface most of these
intermediates. A classic recipe never lists "pasta + boiling water" as an ingredient;
it just says "drain the pasta," absorbing the intermediate into the consuming task's
phrasing. The hiding is not a property of the data; it is a presentation choice for a
human audience. (Same family as: hiding node-ids, composing instructions instead of
baking sentences — all the human filter over the machine graph.)

**Intermediate-visibility rule (display layer):**
- The GRAPH keeps every intermediate (machine truth; appliances need it).
- The DISPLAY surfaces an intermediate as a named ingredient ONLY when it is
  **set aside / held and reused by a LATER, non-adjacent step** (e.g. reserved pasta
  water used in the sauce three steps on). Such a thing is something a cook handles
  and reuses separately, so it earns a name.
- Otherwise (the intermediate flows straight into the IMMEDIATELY-following step), it
  stays implicit — absorbed into that next task's phrasing ("drain the pasta").
- This is inferable from the graph: does the intermediate's edge go to the very next
  step, or is it held and consumed later?

This belongs to the deferred display-layer work (alongside instruction composition);
it does not change the guide/core-seed (Phase A). Tasks still declare typical input/
output STATE; specific multi-outputs (drain → pasta + pasta water) are recorded on the
NODE (the task is generic; the node names what it produced), with the task carrying
only a hint (e.g. "typically separates a solid from a liquid").

## 2c. Completion signals — doneness as a typed, measurable threshold (appliance-grade)

A crude `completion_measurable` boolean is too weak. The real model: **a task/step ends
when a MEASURED QUANTITY crosses a THRESHOLD.** What MATTERS for a smart appliance is
WHICH quantity — a probe reads core temp, a camera reads colour, a scale reads mass, a
timer reads time. This is the difference between "cook 9 min" (dumb timer) and "cook
until core 74°C" (smart probe) — i.e. between a recipe site and a control system. This
is core to the Soupdog appliance vision.

Model (replaces the bool):
- **`completion_type`** — enum (EXTENSIBLE; start with these, add as needed):
  - `time` — elapsed from task start ("9 minutes"). The crudest; always a fallback.
  - `core_temp` — internal probe ("until 74°C internal").
  - `surface_temp` — surface/IR ("pan to 180°C", crust temperature).
  - `color` — optical/camera ("until golden / browned / deep amber").
  - `volume` — "reduce by half".
  - `mass` — "until reduced to 200 g" (evaporation; a variant of volume).
  - `texture` — viscosity / firmness / probe resistance ("until thickened / coats the
    spoon / fork-tender / soft peaks").
  - `structural` — visual structural state ("until set / edges pull away / boiling"
    [bubble detection]).
  - `aroma` — chemical/olfactory ("until fragrant"). Harder to instrument; real.
  - `ph` — acidity ("until acidified to pH X") — pickling / fermentation / curing.
  - `subjective` — irreducibly human ("to taste", "until you like it").
  - (more will surface: salinity/Brix/moisture %, etc. — keep the enum open.)
- **`completion_target`** — the threshold value/qualifier (74, "golden", "half", pH 4.6).
- **`completion_criterion`** (existing text) — keeps the HUMAN phrasing ("until al dente").
- A step/task may have a PRIMARY signal plus fallbacks (e.g. core_temp primary, time
  fallback). v1 can store one primary; multi-signal is a later extension.

Implication: many things that read as "vague" to a person are MEASURABLE to a machine on
the right axis — "until golden" is a `color` threshold, not an unmeasurable hand-wave.
The guide should classify each task's typical completion TYPE so decomposition tags
steps with the right signal, and appliances know what to watch.

Schema: likely a new `completion_type` enum + `completion_target text` on `tasks` (the
TASK's TYPICAL signal) and ideally on the step/node too (the SPECIFIC signal for this
use). `completion_measurable` bool becomes redundant (derivable: type != subjective).
Confirm/added in the Phase A schema step before seeding.

## 2d. Technique taxonomy — principled spine (heat mechanism → method → verb)

"Fry" is a layman word for *conductive heating in fat*. Tasks should hang on a
PRINCIPLED spine, not a flat ad-hoc list, because an appliance cares about the MECHANISM
and TARGET, not the folk verb. Three layers:
- **Heat-transfer mechanism (physics):** conduction, convection, radiation, dielectric
  (microwave), and combinations.
- **Culinary method (technique):** the established classical taxonomy —
  - DRY heat: roast, bake (convection, dry air); grill/broil (radiation); sauté, sear,
    pan-fry, stir-fry, deep-fry (conduction in fat).
  - MOIST heat: boil, simmer, poach, steam, blanch (conduction/convection in water/vapour).
  - COMBINATION: braise, stew (sear then moist).
  - MECHANICAL/prep: knife cuts, mixing family, etc. (no heat).
- **Layman verb (what recipes say):** "fry", "cook", "brown" → map to a method.

Decision: DON'T import an external DB (none clean/open/licensable enough). ADOPT the
established culinary-method taxonomy as the organizing categories, GROUNDED in heat
mechanism, and note the mechanism per task. The existing `tasks.category`
(boil/fry/mix/knife_cuts/…) is a rough version; the improvement is making categories
PRINCIPLED (by mechanism + medium) rather than ad hoc. Likely: keep `category`, add
`heat_mechanism` (enum: conduction/convection/radiation/dielectric/none/combination)
and `heat_medium` (enum: fat/water/air/steam/none) where relevant. Lets "fry / sauté /
sear" share mechanism=conduction, medium=fat while staying distinct methods (params
absorb the intensity). Answers the earlier "fry → Sauté vs a general Fry parent"
question: they share a MECHANISM (the principled grouping) but are distinct METHODS —
so NOT one merged task, NOT a fake parent, but siblings under a shared mechanism.

Reconsider the Phase A `fry`-dupe cleanup accordingly: the AI `fry` should map to the
method the SOURCE implies (sauté if light-fat-moderate-heat; pan-fry if more fat; sear
if high-heat-browning) — or, if truly generic, a deliberate general method. Don't hard-
merge blindly; let the guide's mechanism/method distinction drive it.

## 2e. Tasks that prepare a TOOL, not an ingredient (apparatus-prep)

A gap surfaced while curating Melt: some tasks consume NO ingredient and produce NO
ingredient — they bring a TOOL into a required state or configuration. Examples:
- **Preheat the oven** → produces "oven at 200°C" (a tool in a state).
- **Build a bain-marie** → a pot of simmering water with a bowl over it: a TOOL
  ASSEMBLED from other tools (+ water). Used by "melt chocolate gently".
- Heat a pan before searing; bring oil to frying temperature; set up a steamer; line a tin.

The current node model assumes: inputs (ingredients) + task → output (ingredient). These
break it. So there is a THIRD node shape, alongside ingredient-transforming nodes
(chop, boil) and pure transfer/finish nodes (plate, season):
- **apparatus-preparation nodes**: inputs (tools, maybe an ingredient like water) + task
  → output (a TOOL in a state / an assembled apparatus). No food ingredient produced.

Design implications (NONE built — captured only):
- **A task can output a tool/apparatus-state.** Likely modelled via the existing
  `equipment` structure (a bain-marie = an assembly of pot + heatproof-bowl + water;
  `equipment.parent_id` / a future "assembled_from" `entity_relations` edge; "oven at
  200°C" = oven + a target-temp parameter).
- **Apparatus-prep is its own task FAMILY** (preheat / assemble / bring-to-temp). Worth a
  category so decomposition can emit these explicitly.
- **Tool-availability resolution** (the bain-marie twist): the SAME goal ("melt chocolate
  gently") resolves to DIFFERENT tool-prep depending on what the user HAS — a dedicated
  double-boiler (use directly), improvise a bain-marie (INSERT a make-the-tool step), or
  microwave (a different method). This is the (ingredient × tool → task) interaction
  idea (§Q3) extended: resolution can INSERT an apparatus-prep step. Downstream of an
  INVENTORY model (what the user owns) that doesn't exist yet beyond `equipment`.

Caveats / discipline:
- **Don't over-engineer.** Most recipes don't need explicit "build a bain-marie" steps —
  "melt the chocolate over a pan of simmering water" as one human instruction is fine.
  Apparatus-prep matters most for the MACHINE/appliance view (a robot needs "assemble the
  double-boiler" / "preheat to 200°C" explicitly). Another instance of machine-truth vs
  the human filter (§2b): the graph may hold the apparatus-prep node; the human display
  often folds it into the next instruction.
- Sequencing: this is a model extension touching the node model + equipment model +
  interaction/inventory layers. NOT next; build only when apparatus state genuinely needs
  to be first-class (e.g. appliance execution, or inventory-aware tool resolution).

## 3. What the guide block contains (fed to decompose)

For the candidate tasks retrieved for a recipe, a compact block the model must match to:
```
KNOWN TECHNIQUES (use the exact name; match by meaning; invent only if none fits, mark new):
- boil — cook submerged in boiling liquid until done. input: raw; output: cooked.
  expects: completion (duration 8–12m OR observable "until al dente"). tools: large-pot.
- bring-to-boil — heat liquid to a rolling boil. expects: observable "until boiling";
  NO fixed duration. tools: large-pot.
- fry / saute — cook in fat over heat. expects: observable ("until crispy/golden")
  and/or duration. tools: frying-pan.
- whisk — beat to combine/aerate. expects: observable ("until combined") if stated.
  tools: whisk, bowl.
...
```
Built straight from `tasks` columns: name, typical_input_state/output_state,
completion_criterion + completion_measurable, min/max duration, suggested_tool_slugs.
The expectation TRAVELS WITH THE TASK → fixes §0's bugs.

Optionally augment with ingredient affordances for the recipe's ingredients (from roles)
so the model knows "spaghetti is a starch → boil/bake typical".

---

## 4. Curation — the prerequisite (0 verified today)

Nothing is verified, so the guide is empty until a verified CORE exists. Need a curation
surface (now LOAD-BEARING). Two-track:
1. **Seed a verified CORE (~20–30 tasks + their guide metadata):** boil, bring-to-boil,
   simmer, steam, blanch, poach, fry, saute, sear, roast, bake, grill, whisk, stir,
   beat, fold, knead, chop, slice, dice, mince, grate, peel, drain, reserve, combine,
   mix, season, marinate, rest, chill, proof, reduce, plate. Fill
   completion_criterion/measurable, min/max duration, input/output state, suggested
   tools, description/tips. Could be AI-DRAFTED then human-blessed (set is_verified).
2. **Curation admin view:** review AI/seed tasks → edit metadata → bless. Same pattern
   reused for equipment + ingredient content (all share is_verified/content_reviewed).

The Techniques/Tools pages can SHIP showing verified items first; unverified hidden or
badged. Curation thus directly grows what users see and what the AI matches to.

---

## 5. Concept tiers (Rasmus asked) — already present, decide usage

- **Tools:** `equipment.parent_id` → "large-pan" parent "Pan". The guide/instruction can
  refer to the CONCEPT ("transfer to the pan") while the recipe stores the instance.
- **Ingredients:** `ingredients.parent_id` (+ the recipe-model "concept" overlapping-m2m
  idea from earlier docs, not yet built — parent_id is the simple tree today).
- **Tasks:** no explicit concept column; `task_family`/`category` approximate it
  (a family of related transformations). Decide later if tasks need a true concept tier
  or family suffices.
Decision: USE `parent_id` concept names in composed instructions/guide where it reads
better; don't build new concept structure now.

---

## 5b. Browsing & visibility (the "too much to show everyone" problem)

The full archive is enormous — especially ingredients (regional variations, brand
products, AND machine-generated transformation intermediates like "drained spaghetti").
A flat list of everything is useless to regular users but must EXIST (the AI + power
users need full granularity). The Techniques, Tools, and Ingredients pages all share
this. Resolution = THREE distinct filters, not one:

1. **Concept-first browsing (everyone).** Top level of each page shows CONCEPTS, not
   leaves, using the existing `parent_id` trees (`equipment.parent_id`,
   `ingredients.parent_id`; for tasks, `task_family`/`category` approximate it).
   "Onion" not red/white/shallot; "Pan" not large-pan/saute-pan. Variations are
   revealed on drill-down / "show all variations". The concept tier IS the browse
   hierarchy — no separate category system needed. (Same structure that anchors the
   guide and instruction composition — triple duty.)
2. **Hide transformation intermediates by default (everyone).** Much of the ingredient
   long tail is decomposition OUTPUT ("softened onion", "drained spaghetti"), not things
   you cook FROM. These are inferable via `transformed_from_id` (has a value = it's an
   intermediate). Hide from the default ingredient browse; reachable via search or from
   the recipe that produced them. Distinct from "variations" and from "unverified".
3. **Role-gate unfinished content (power users / admins).** `is_verified` /
   `content_reviewed` flags gate raw AI-generated / un-curated entries. Regular users
   see verified content; admins additionally see the curation queue. This is the ONLY
   place user-role enters — NOT the primary browse filter (keep browse simple; gate only
   what isn't ready).

So a regular user browsing Ingredients sees a few hundred VERIFIED CONCEPT ingredients;
the thousands of leaves, intermediates, and unverified rows exist underneath, reachable
deliberately. Same model for Tools (concept tools, verified) and Techniques (verified
tasks, grouped by family). This shapes Phase B (the pages); it does NOT affect Phase A
(the guide is AI-facing and uses the full verified granularity regardless).

## 5c. Category model — evolution (free-text now → locked later → maybe m2m)

Tasks have a `category` (boil/fry/knife_cuts/…). How it should work over time:
1. **Now:** FREE-TEXT, created inline in task edit mode. Correct while the vocabulary is
   still forming (e.g. "thermal state change" invented during curation). Don't lock early
   — let the vocabulary EMERGE from real curation, then formalise. (Same measure-first
   discipline as the demand backbone.) The Techniques filter buttons are DERIVED from
   categories present in the data, so they self-update as curation proceeds.
2. **Later:** LOCKED vocabulary — user SELECTS from existing categories (prevents drift
   like "thermal state change" vs "phase change"); creation still allowed but via a
   deliberate FORM (intentional act, not an accidental typo). Filter buttons become a
   fixed set automatically.
3. **Possibly:** a task in MORE THAN ONE category (m2m). OPEN — no clear example yet, and
   the inability to think of one is informative: categories look mostly single-membership.
   The cross-cutting dimension may ALREADY be covered by `heat_mechanism`/`heat_medium`
   (orthogonal to category), which would argue AGAINST m2m and FOR category as a clean
   single "what family is this." Leave undecided; revisit only if a real multi-category
   case appears.

## 6. Build sequence (smallest-useful-first)

**Phase A — verified core + guide injection (the consistency win):**
0. **Schema additions FIRST** (small): `completion_type` enum + `completion_target` on
   `tasks` (§2c); `heat_mechanism` + `heat_medium` enums where relevant (§2d). Confirm
   live columns; `completion_measurable` becomes derivable/redundant.
1. Seed ~25-30 core tasks' guide metadata against the RICHER model (typed completion +
   mechanism/method), AI-draft → bless. Model Bring-to-a-boil/Boil/Drain/Reserve per
   §2b. Map the AI `fry` dupe by method, not a blind merge (§2d).
2. Retrieval: parse-verbs → candidate verified tasks (+ always-on core).
3. Inject the §3 guide block (incl. each task's completion TYPE + target) into the
   decompose prompt; matching discipline + new_task flag.
4. Re-run eval + Carbonara: cook-time on the RIGHT node, fry keeps "until crispy" (now
   typed `color`/`texture`), consistent verbs, fewer invented tasks; measure tokens.

**Phase B — Techniques & Tools pages (the human face, near-free after A):**
5. `/techniques` + `/techniques/[slug]` render verified `tasks` (description, tips,
   common_mistakes, duration, tools, image). `/tools` + `/tools/[slug]` render
   `equipment` (summary, description_long, uses, image, parent concept, task_templates).
   These are READ pages over now-populated data — like the recipe view over recipe data.
6. Curation admin view (bless/edit/merge) to grow both faces.

**Phase C — ingredient affordances + interactions (the richer guide):**
7. Surface ingredient→task affordances (from roles) in the guide and on
   `/ingredients/[slug]` ("commonly: boiled, baked").
8. Populate `entity_relations` for tool→task ('performs') and ingredient→task
   ('typical_task') as curation matures; let the guide compose ingredient×tool→task
   suggestions. First-class interaction table only if simple edges prove insufficient.

**Phase D (deferred, own docs):** instruction composition (compose readable line from
task verb + columns + concept tool, stop baking sentences); recipe-model concept tier
for ingredients.

---

## 7. Open decisions (settle before Phase A build)

1. **Core task list + metadata source** — which ~25-30; AI-draft then bless (lean).
2. **Completion model (§2c)** — confirm the `completion_type` enum starter set
   (time/core_temp/surface_temp/color/volume/mass/texture/structural/aroma/ph/
   subjective) + `completion_target`; agree `completion_measurable` is retired. Keep
   the enum EXTENSIBLE (salinity/Brix/moisture etc. later).
3. **Technique taxonomy (§2d)** — adopt classical method categories grounded in
   `heat_mechanism`/`heat_medium`; decide exact enum values; decide whether the AI `fry`
   maps to sauté/pan-fry/sear by source-implication vs a general method.
4. **Retrieval strategy** — verb-keyed + always-on core (lean) vs category vs semantic.
5. **Guide token budget** — core always-on + retrieved candidates; measure.
6. **new_task signalling** in decompose output (explicit flag for curation) — yes.
7. **entity_relations usage shape** (Phase C) — simple typed edges vs first-class
   interaction. Defer; lean simple.
8. **Curation surface scope** — minimal bless/edit first; merge later.
9. **Multi-output on the node (§2b)** — confirm the node records its named outputs;
   task carries only a separation hint.
10. **Per-step vs per-task completion** — store the typical signal on the task AND the
    specific signal on the step/node? (Lean: task = typical/default, node = override.)

**Guiding principle (unchanged):** system MEASURES & SUGGESTS, human NAMES & DECIDES.
The knowledge layer is curated culinary knowledge captured as reusable DATA — the graph
is the moat; the guide teaches the AI to populate it consistently; the pages teach users.
One spine, two faces.
