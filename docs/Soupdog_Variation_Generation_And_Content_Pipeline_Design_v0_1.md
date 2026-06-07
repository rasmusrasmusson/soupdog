# Soupdog — Variation Generation, Reference Exemplars & Content Production Pipeline — Design v0.1

**Status:** DESIGN (not built). 2026-06-07. Builds on the Culinary Knowledge Layer
(v0.3) and the Atomic Decomposition work. Two linked ideas from Rasmus:
(A) the guide should generate EXPECTED VARIATION FAMILIES and decompose new recipes by
ANALOGY to curated exemplar recipes; (B) a DEMAND-RANKED content-production pipeline so
we build the exemplars/guides just-in-time for the recipes people actually want.

---

## 1. The core idea — guidance at the RECIPE level, not just the task level

The shipped guide layer anchors *individual tasks* (verified techniques the AI matches
to). This note raises it one level: anchor *whole recipe shapes*.

Two distinct capabilities:

### A1. Reference-exemplar decomposition (analogy)
When a user adds "tenderloin steak", the AI retrieves a detailed, verified **exemplar
recipe** for a NEIGHBOURING food ("ribeye steak") and uses it as a TEMPLATE — same
structure, adjusted for the differences (tenderloin is leaner, more tender; different
thickness/fat/doneness behaviour). "Cook this new thing like that known thing, adjusting
for what differs." This is retrieval-augmented decomposition at the recipe scale.
- Retrieval uses data we HAVE: `food_families` / `food_family_members`, culinary roles,
  `ingredients.parent_id` — tenderloin and ribeye are both beef / redmeat_tender, so the
  neighbour is findable.
- The exemplar carries hard-won structure (sear then rest; doneness by core_temp; timing
  by thickness) that a from-scratch decomposition would get inconsistently.

### A2. Expected-variation-family generation (combinatorial fan-out)
Don't make ONE recipe — make the FAMILY of expected variations along recognised axes.
Steak example: doneness (rare / medium-rare / medium / well) × thickness (thin / thick)
× count (1 / 2 / 4). One base recipe → a matrix of execution variants.
- Maps onto the EXISTING `execution_variants` table (43 rows; `variant_axes`,
  `derived_from_variant_id`, `divergence_score`, override tables). This is POPULATING
  existing structure, not new schema — same finding as every prior arc.
- The system PROPOSES the sensible axes (doneness for steak; not for soup); the human
  confirms/edits which variations are worth materialising.

### Why this compounds (the flywheel)
A few DEEPLY detailed, verified EXEMPLAR recipes (ribeye with all its doneness/thickness/
count variations, richly annotated) become reference models the AI uses to generate good
recipes + variations for RELATED foods — exactly as the verified task core anchors
decomposition. One curated ribeye improves every steak the system ever generates.
Curated knowledge captured as reusable DATA — the graph is the moat.

---

## 2. Timing & cost discipline (Rasmus's key constraint — design AROUND this)

Generating a variation family is EXPENSIVE (many AI calls) and WASTEFUL if done while the
user is still tweaking the base. Rules:
- **Variation generation runs AFTER the base recipe is SETTLED** — on PUBLISH, or as an
  explicit "generate variations" action. NEVER in the live import/edit loop.
- It is a DELIBERATE, COST-GATED operation (ties to membership tiers / the demand model /
  the credit gate in `src/lib/ai/anthropic.ts`). Could be a paid feature or a background
  job on published recipes.
- Reference-exemplar decomposition (A1) is cheaper (one retrieval + one decompose) and
  CAN run inline, but the EXEMPLARS it relies on are themselves built by the pipeline
  below — so A1 only gets good as the exemplar library grows.

---

## 3. Content production pipeline (Rasmus's 3-step process)

The goal: build exemplar + guide content JUST-IN-TIME for the recipes people actually
want, prioritised by demand. Three steps:

### Step 1 — A demand-ranked recipe backbone (NOT a flat "10,000 list")
HONEST CAVEAT: no authoritative measured global ranking of recipes exists, and popularity
is deeply REGIONAL (top dishes in China / India / US / Brazil overlap only partially). So
do NOT treat any list as ground truth. Instead build a **principled, tiered, region-aware
taxonomy**, treated as a refinable backbone, later cross-checked against REAL signal
(search volume; eventually Soupdog's own usage data once there are users — the demand
model feeds this).
- Structure: dish FAMILIES → representative DISHES → rough prevalence tier (global vs
  regional), with region tags. More useful than a flat list because it maps onto guide
  dependencies (below).
- Practical size: a few hundred families covering most of what people cook; the "10,000"
  is the long tail of variations within families (which A2 generates, not hand-authored).

### Step 2 — Derive the CORE / exemplar set + guides each tier needs
For the prioritised dishes, identify:
- **Exemplar recipes** to author in depth (the "ribeye" models) — one strong exemplar per
  technique-cluster (e.g. one great pan-seared steak exemplar serves all steaks; one
  braise exemplar serves all braises; one emulsified-sauce exemplar serves mayo/hollandaise/
  aioli). Exemplars are chosen to MAXIMISE reuse across the backbone, not 1:1 per dish.
- **Guide dependencies** each exemplar needs: which verified TASKS (technique core — mostly
  done), which TOOLS, which INGREDIENT affordances (roles), and the (ingredient × tool →
  task) interaction edges (`entity_relations`) if used. So authoring an exemplar surfaces
  exactly which guide rows must be verified first.
- This makes the work bounded: you don't verify all 96 tasks or all ingredients up front —
  only those the prioritised exemplars actually touch.

### Step 3 — Sequence the work to match demand
Order exemplar + guide creation by the tier ranking, so the first production sprint covers
(say) the top ~200 families' exemplars and ONLY the guide rows those need. Then expand
down the tail. Each sprint: pick the next demand tier → list its exemplars → list the
guide rows they depend on → verify those guide rows → author/generate the exemplars →
their variation families fan out via A2.

### How Claude can help with this content process
- Generate the tiered region-aware dish-family backbone (Step 1) as a PROPOSAL to refine
  (not authoritative; estimation).
- For any tier, propose the minimal exemplar set that maximises reuse (Step 2).
- For each exemplar, list its guide dependencies (tasks/tools/roles/interactions) so the
  verify-first work is explicit (Step 2).
- Draft the exemplar recipes themselves (then human/curation blesses) and propose their
  variation axes (A2).
- All AI-drafted, human-blessed — same MEASURE & SUGGEST / NAME & DECIDE principle.

---

## 4. Where this sits / dependencies

Downstream of:
- Decomposition working (✓ shipped) and the verified task core (✓ Phase A).
- `execution_variants` (exists, underused) for A2.
- Concept / food-family retrieval (data exists) for A1.
- Cost gate / membership (the enforcement work, still pending) for A2's cost discipline.
- The display layer (in progress) — generated variations still need to render well.

Its own build, AFTER the current knowledge-layer phases (Techniques/Tools pages,
display-layer fixes). This note captures it so it isn't lost; it is NOT next.

---

## 5. Open decisions (for when this is built)

1. Exemplar selection — how the AI picks the neighbour exemplar (food-family + role
   distance? explicit "modelled_on" links?).
2. Variation axes — system-proposed vs user-chosen; per-dish-type axis library
   (steak→doneness; pasta→none; cake→size). Possibly a new small lookup, or rides on
   `variant_axes`.
3. Trigger — on publish, explicit action, or background job; cost gating model.
4. Curation — generated variations go to a review queue before going live? (Likely yes,
   like AI tasks.)
5. The backbone's authority — start with AI estimation; when/how to replace with real
   demand signal (search, usage).
6. Exemplar depth standard — what makes a recipe a blessed "exemplar" vs an ordinary one
   (a flag? extra metadata? richer annotation requirement?).
7. Reuse mapping — one exemplar per technique-cluster; how clusters are defined.

**Guiding principle (unchanged):** system MEASURES & SUGGESTS, human NAMES & DECIDES.
Exemplars and the demand backbone are curated knowledge captured as reusable DATA;
variation families fan out from them; the AI is taught by curated models, not left to
invent each recipe cold.
