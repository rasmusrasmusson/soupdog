# Soupdog — Recipe Model: Concept / Recipe / Version / Fork (v0.3)

**Status:** Design note, not built. Foundational. Sits UPSTREAM of: the
`recipe.kind` enum, the Plan & End-Product rework, the "add recipe from
ingredient" two-intents note, and Cook Mode. Do NOT add `kind` or repoint plan
schema until this is built.

**v0.3 (2026-06-06)** RESOLVES the two structural questions left open in v0.2
(fork representation, graduation lineage) — on a firm guiding principle: **the
system MEASURES and SUGGESTS; the human NAMES and DECIDES.** The conceptual model
is now considered settled; remaining work is schema design + diagram.

## Guiding principle (new in v0.3)
The system can measure *how much* two recipes differ, but it CANNOT know what a
difference *means* or *why* it's happening. Whether a divergence amounts to "a new
dish" is a **subjective, cultural, human** judgment (vodka sauce is a named dish;
"roast with a bit of chili" usually isn't — but might be in some family/country).
And a user mid-experiment looks identical to a user who has permanently drifted.
**Therefore the system never acts on divergence — it only surfaces a signal and
suggests. The human names and decides.**

## The levels
1. **Concept** — curated (humans now, AI later), GLOBAL, MANY-TO-MANY grouping of
   ingredients perceived as "the same thing." Perception-variance handled by
   OVERLAPPING concepts referencing shared ingredients (e-commerce multi-category
   pattern), not per-user concepts. Own m2m membership, NOT the existing
   `parent_id` (which stays for product↔category). [from v0.2]
2. **Recipe (canonical)** — a SIBLING under a concept; an independent recipe
   producing (a variant of) the concept. siblings == variations (a tweak makes a
   new sibling). [from v0.2]
3. **Version** — REPLACE-history within one recipe (`current_version_id`). Exists.
4. **Fork** — NOT a separate entity. See below.

## Fork representation — RESOLVED (v0.3)
**A fork is two separate recipes joined by REFERENCES, not duplicated content.**
- Each recipe field/component either OWNS its content or REFERENCES another
  recipe's. The set of references IS the relationship — no dedicated "fork" table.
- Duplication-with-an-"update-both"-rule was rejected: it's denormalization, and
  the sync rule is exactly where silent drift bugs breed (cf. the `recipes` mirror
  table issue earlier this session). References = one source of truth; the fork
  points at it.
- **Free benefit — UNITY IS MEASURABLE.** Because forks are reference-based, "how
  united are two recipes" = the fraction of fields that are references vs. owned,
  weighted by recipe size (so short recipes don't read as spuriously united/
  diverged). 1-of-100 referenced = weak link; 80-of-100 = strong. You could not
  compute this cleanly under duplication. Drives ambient UI (connection icon /
  colour / unity score) and the graduation signal below.

## Graduation — RESOLVED (v0.3): graduation = converting references to copies = an act of NAMING
- "Cutting the cord" has a precise mechanical meaning: **replace a reference with
  an owned copy.** There is no separate "graduated" state — just a spectrum of how
  many fields are references vs. copies.
- **Graduation is fundamentally an ACT OF NAMING.** Technically every change makes
  a different result-ingredient; what makes something "a different dish" is that a
  human decided to NAME it and treat it as its own thing. So graduation happens
  when the user decides "this is my own thing now," names it, and (some/all)
  references convert to copies + a new sibling identity forms.
- **NEVER automate the cut.** Divergence is a SIGNAL to suggest, never to act —
  because the system can't tell experimentation from permanent drift, and naming
  is subjective/cultural. Cord cuts ONLY on explicit user consent.

### The signal: algorithm vs AI (division of labour)
- **Algorithm** — % of referenced values, weighted by recipe length. Cheap,
  always-on. Powers a SUBTLE ambient signal (icon/colour/unity value) + a gentle
  "these have diverged a lot" nudge. Length-weighting prevents premature nudges on
  short recipes.
- **AI** — does it BETTER by adding CULTURAL knowledge: recognises "tomato soup +
  vodka = an existing named dish" (suggest linking/naming accordingly) vs "tomato
  soup + cognac = nobody's named that → here's a creative new-dish suggestion."
  The algorithm measures HOW MUCH they differ; AI understands WHAT the difference
  means and can suggest names.

### Lineage
On graduation, keep a cheap `forked_from` breadcrumb
(`recipe_canonicals.forked_from_id → recipe_canonicals.id`, nullable) even as
references convert to copies. Enables discovery ("recipes derived from this"),
attribution/credit, and "people who made X also made Y." Examples where this
matters: a roast fork that drifts into its own dish; a shared tomato-sauce base
forking into arrabbiata/vodka sauce that each become directly-searched recipes; a
user privately forking a published recipe, developing it, then publishing it as
their own.

## Content reuse (from v0.2, consistent with fork-by-reference)
Reuse is a PULL declared by the CONSUMER (a recipe references the ingredient's
picture; a fork references another recipe's steps) — NO inheritance. "One edit
covers both" works because referencers point at the shared source. Who may declare
reuse = ADMIN RIGHTS (rides on the Sharing & Delegation access model; no new
permission concept).

## Three orthogonal axes (the old model conflated these)
1. **History** — versions; what replaces what over time.
2. **Catalog** — concept → sibling recipes (curated, many-to-many); alternatives,
   related by reference (unity measurable), lineage via `forked_from`.
3. **Execution branching** — choices made WHILE cooking (roast doneness). NOTE:
   v0.3 treats the roast's medium/medium-rare as a FORK (two recipes, reference-
   joined) at the catalog level. Whether an in-recipe "option at a step" ALSO
   exists as an execution-time concept (a single recipe presenting a choice to the
   cook, distinct from two forked recipes) is the one nuance to confirm in the
   schema pass — it connects to Cook Mode. Open: is "medium vs medium-rare" best
   modelled as two forks, or one recipe with a parameter/branch? (See below.)

## Remaining for the BUILD/SCHEMA pass (not conceptual — mechanical)
- **Diagram** the model (concept ↔ ingredient m2m; concept → recipe; recipe →
  version; recipe field → owned-or-reference; `forked_from`).
- **Field-level reference mechanism:** how a recipe field points at another
  recipe's field (per-component reference table? a reference type on each
  ingredient/step row?). This is the core schema question.
- **Unity metric:** exact formula (referenced/total, length weighting) + where
  computed (on read? materialised?).
- **Parameterised recipe vs discrete forks:** is "doneness" a parameter on ONE
  recipe or two forks? (Ties to execution-branching / Cook Mode.) Confirm.
- **Graduation operation:** the actual "convert references → copies + set
  forked_from + new identity" transaction.
- THEN: `recipe.kind` (likely on the recipe/canonical level — intrinsic, stable);
  then the Plan & End-Product bridge.

## Why this is the foundation
Every "next small thing" this session bounced off an upstream dependency; the
chain terminates at this model. v0.3 settles the CONCEPTUAL model end-to-end
(levels, fork-by-reference, measurable unity, graduation-as-naming, system-
suggests-human-decides, lineage). What remains is schema design + diagram — a
deliberate pass. Everything downstream (kind, Plan rework, two-intents, Cook Mode)
hangs off getting this right.
