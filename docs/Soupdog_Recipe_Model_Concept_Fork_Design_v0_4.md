# Soupdog — Recipe Model: Concept / Recipe / Version / Fork (v0.4)

**Status:** Design note, not built. Foundational. Sits UPSTREAM of `recipe.kind`,
the Plan & End-Product rework, the two-intents note, and Cook Mode. Do NOT add
`kind` or repoint plan schema until this is built.

**Guiding principle (v0.3):** the system MEASURES and SUGGESTS; the human NAMES and
DECIDES.

**v0.4 (2026-06-06)** adds: fork-as-interactive-choice (unifies catalog & execution
views), per-participant defaulting, the fork-request demand front door, and — the
keystone — author-defined modification guardrails + the fork-vs-new-recipe boundary
that aligns the technical, social, and curation layers. Cross-references the
Content Provisioning & Budget, Demand Model, and quality-score systems rather than
duplicating them.

## The levels (catalog layer)
1. **Concept** — curated, GLOBAL, MANY-TO-MANY grouping of ingredients perceived as
   "the same thing." Perception-variance handled by OVERLAPPING concepts (e-commerce
   multi-category pattern). Own m2m membership, not `parent_id`. [v0.2]
2. **Recipe (canonical)** — a SIBLING under a concept; produces (a variant of) the
   concept. siblings == variations. [v0.2]
3. **Version** — REPLACE-history within one recipe. Exists.
4. **Fork** — two recipes joined by REFERENCES, not duplication. The set of
   references IS the relationship. Unity is MEASURABLE (referenced/total, length-
   weighted). [v0.3]

## Fork = interactive choice (v0.4 — unifies catalog & execution)
A fork and an "interactive choice in a recipe" are the SAME structure seen two ways:
- **Catalog view:** two reference-joined recipes producing two different result-
  ingredients. (Steak proves it's not pedantic — a diner sends back medium when
  they ordered medium-rare; they are genuinely different things.)
- **Execution view (Cook Mode):** the cook experiences ONE recipe with a CHOICE, not
  "two recipes." When they select, only the NON-REFERENCED (divergent) fields
  visibly change — shared content is referenced, so it doesn't move. The seam is
  invisible *because* shared content is referenced.
- **Steak walkthrough:** loads as medium-rare; ribeye 300g + other ingredients
  referenced (identical across forks); picture + oven-finish time owned/divergent.
  Cook picks "medium" → picture flips, oven time updates, shared ingredients
  unchanged. Feels like "the recipe adapted," not "I switched recipes."
- Choice can be made AHEAD (read-through) or MID-COOK. Mid-cook switching is
  graceful: completed referenced (shared) steps stay done; only downstream divergent
  steps change.
- Multiple independent choice points can coexist (doneness AND garlic-butter-or-not);
  each swaps its own divergent fields.
- **BACKLOG (UI):** how the author marks forks as "offer these together as a choice,"
  and the cook's select/change UI (pre-cook vs mid-cook).

## Default sibling selection (v0.4)
Which fork shows by default is a PRESENTATION policy on top of the structure
(doesn't strain the model). Resolution is PER-PARTICIPANT, not per-user-in-isolation:
- **For each participant:** resolve their preferred fork from their profile/prefs
  (`person_meal_prefs` / People & Groups) → else author default (may be AI-informed
  by popularity) → else first.
- This RESOLVES THE MIXED-DONENESS CASE AT SETUP: if participant prefs are known, a
  meal for 3 can pre-populate "2 medium-rare, 1 medium" before cooking starts; you
  only switch mid-cook for changes-of-mind (rarer).
- "Remember last selection" is too simple (a one-off cook-for-a-guest would mislead
  the default) — prefer usual/most-frequent/pinned, and consider WHO is
  participating. Ties to People & Groups personalization data.

## Mixed doneness → Cook Mode is PORTION-AWARE (v0.4)
"3 ribeyes, 2 medium-rare + 1 medium" is neither single fork — it's a per-portion mix
within one session. The CATALOG model holds untouched; the EXECUTION model gains a
requirement: **a Cook Mode session cooks N portions, each of which may follow a
different fork of the same concept.** Shared prep (season, sear) referenced and done
once; divergent finishing (oven time) tracked per-portion. Mirrors a real kitchen
(a table orders 3 donenesses; one ribeye prep, per-steak timing).
- **Mid-cook input wants CONVERSATION/VOICE** ("make one of these medium") far more
  than per-portion tap widgets → concrete justification for Cook Mode's voice
  surface. (See Cook Mode / Live Cooking Sessions note.)

## Fork requests = the DEMAND-CAPTURE FRONT DOOR (v0.4)
When a user wants a fork/recipe that doesn't exist, it is NOT a dead end. The request
becomes a stored pending recipe and routes by membership:
- **Free member** → request goes to the content team's TO-DO LIST (demand signal made
  concrete) + user is OFFERED AN UPGRADE to get it now. If they don't upgrade,
  content creators eventually make it → then it's live for everyone.
- **Paying member** → AI GENERATES it on the spot AND it's saved to the catalog for
  EVERYONE. "This user paid for the community" — paid generation is a CONTRIBUTION,
  not a private purchase. Demand literally funds supply, recipe by recipe; the
  catalog grows fastest where demand is highest; free users benefit from paid users
  (healthy flywheel + soft upgrade nudge).
- This is the front door to **Content Provisioning & Budget** (make-vs-queue
  economics) and the **Demand Model** (predict/measure what to build): (a) predict &
  pre-make, (b) monitor & queue requests, (c) paid users self-serve via AI credits.
- See those docs for the fulfillment economics; this note just establishes the
  front-door bridge.

## Author guardrails + the FORK-vs-NEW-RECIPE boundary (v0.4 — KEYSTONE)
Two kinds of guardrail on AI/user modification:
1. **Global safety** ("don't make a recipe for a bomb") — system-level, all AI gen.
2. **Per-recipe author-defined modification envelope** — the author declares what's a
   PERMITTED VARIATION vs. what becomes a NEW RECIPE. (e.g. ribeye recipe: "change
   doneness = OK (fork); replace ribeye with another meat = NOT a variation → new
   recipe.") This is the author drawing the identity/naming boundary PROACTIVELY
   (complements graduation-by-naming, which is the reactive version).

**The boundary decides which path a requested change takes:**
- **Within guardrails** → a **FORK**: references preserved, stays united, enters
  catalog as a variation.
- **Breaks guardrails** → a **NEW RECIPE**: system CUTS all references, COPIES the
  fields that still make sense, becomes a user-generated recipe (loosely linked via
  `forked_from` lineage at most).

**The boundary aligns THREE layers consistently (why it's the keystone):**
- **Technical:** references-kept vs. references-cut-and-copied.
- **Social / ownership:** a fork is explicitly "a variation of someone else's recipe"
  → resolves the "I paid but everyone gets it" tension (you funded filling a gap, it
  was never *your* recipe). A new recipe is more genuinely THEIRS → user may need to
  consent to publication.
- **Curation:** a within-guardrails fork gets a LIGHTER check; a guardrail-breaking
  new recipe gets a FIERCER one.
One distinction, consistent consequences — the sign of a good abstraction.

## Quality & curation (v0.4)
- **Quality score already exists: AI-generated < chef < lab.** Generated recipes
  enter at the honest (AI) tier; the score reflects provenance. No new mechanism.
- **Curation gates ALL catalog additions** (forks and new recipes) before they go
  live. Intensity PROPORTIONAL to originality (light for guardrail forks, fierce for
  new recipes; new recipes may also require user consent to publish). Curator is
  human now, **AI eventually** (necessarily, at scale).

## The three connected models (map)
- **Recipe model (catalog)** — THIS note: concept / sibling / version / fork-by-
  reference, measurable unity, graduation-as-naming, author guardrails, fork-vs-new.
- **Execution model (Cook Mode)** — fork-as-interactive-choice, portion-aware
  sessions, per-participant defaulting, voice input. (See Cook Mode note.)
- **Demand / provisioning** — fork-requests as front door; membership-gated
  fulfillment; paid gen contributes to shared catalog; quality tiers; curation.
  (See Content Provisioning & Budget + Demand Model docs.)

## Remaining for the BUILD/SCHEMA pass (mechanical, not conceptual)
- Diagram: concept ↔ ingredient m2m; concept → recipe; recipe → version; recipe
  field → owned-or-reference; `forked_from`.
- Field-level reference mechanism (per-component reference table? reference type on
  each ingredient/step row?). Core schema question.
- Author-guardrail representation (what fields/changes are permitted-variation).
- Unity metric formula + where computed (read-time vs materialised).
- Graduation operation (convert references→copies + set forked_from + new identity).
- Pending-recipe-request entity + routing to content queue / paid AI gen.
- THEN: `recipe.kind` (recipe/canonical level, intrinsic & stable); Plan & End-
  Product bridge.

## Why this is the foundation
Every "next small thing" this session bounced off an upstream dependency; the chain
terminates at this model. v0.4 settles the CONCEPTUAL model end-to-end across catalog,
execution, and demand layers, with the fork-vs-new-recipe boundary as the keystone
tying identity, references, ownership, monetization fairness, and curation together.
What remains is schema design + diagram — a deliberate pass.
