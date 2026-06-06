# Soupdog — Recipe Model: Concept / Recipe / Version / Fork (v0.1)

**Status:** Design note, not built. Foundational. Emerged 2026-06-06 from working
through a chocolate-mousse + roast example. This model sits UPSTREAM of: the
`recipe.kind` enum, the Plan & End-Product rework, and the "add recipe from
ingredient" two-intents note — all of which depend on these levels being settled.
Do NOT add `kind` or repoint plan schema until this is resolved.

## The problem it solves
The current DB has only `recipe_canonicals → recipe_versions` (two levels). Real
user behaviour needs more distinctions, which that structure conflates. Worked out
via two examples:
- **Chocolate mousse:** one ingredient/concept a user searches & clicks, but there
  may be 100 different mousse recipes → 100 (technically distinct) result
  ingredients.
- **Roast (medium vs medium-rare):** user thinks "I'm adding two oven-time options
  to ONE recipe," not "I'm making two recipes."

## The levels (settled this session)
1. **Concept** — a user-meaningful GROUPING label, at ANY scale. "Chocolate
   mousse" is a broad public concept; "my roast" can be a narrow personal one.
   The user draws the boundary wherever feels natural.
   - KEY INSIGHT: the concept layer does DOUBLE DUTY — it unifies the 100 sibling
     recipes AND captures the user's "these are one thing" perception. The
     mousse-grouping and "I perceive my variants as one" are the SAME mechanism at
     different scales. (Lives at/near the ingredient layer — ties to the
     "precise-ingredient vs user mental model" point in the two-intents note.)
2. **Recipe (canonical)** — a SIBLING under a concept. An independent recipe that
   produces (a version of) the concept. The 100 mousses are 100 canonicals.
3. **Version** — REPLACE-history within one recipe. v2 supersedes v1
   (`current_version_id`). This is what `recipe_versions` already does.
4. **Fork / branch point** — SHARED CORE with a DIVERGENCE. See below.

### Correction made this session: siblings == variations
"The 100 recipes" and "a variation" are the SAME thing. Whether a recipe arrives
fresh-written or by tweaking an existing one (add salt, change servings, electric
whisk instead of hand), the result is another SIBLING. There is no structural
difference between "a sibling" and "a variation." (Earlier framing over-split
these — collapsed.)

## Fork / branch point — the "one edit covers both" want
The roast example exposed TWO different user wants tangled together:
- **Want A — "I perceive these as one."** → solved by the CONCEPT grouping.
- **Want B — "I don't want to maintain two copies; one edit covers both."** →
  NOT solved by grouping alone. Needs SHARED SUBSTANCE with a divergence.

**Model:** a fork = a SHARED CORE (media/picture, common ingredients, common
steps) + a DIVERGENCE POINT (doneness, salt, whisk). Lightweight: one thing to
maintain, a single edit to the core covers all branches. Shared media is part of
the shared core (same dish photo even as method forks).

### Graduation: fork → sibling
A fork is lightweight until it diverges enough to really be its own dish. At that
point it can GRADUATE into a full sibling canonical under the concept.
- User choice ("make this its own recipe").
- **AI can SUGGEST graduation** when divergence is high ("this isn't a variation
  anymore, it's a different dish").

### "Too many forks" — no technical limit
There is NO technical reason to cap forks (a branch point with N options is cheap
regardless of N). The "you've added 10 forks, stop it!" instinct is a MODELING
SMELL, not a guardrail to enforce. The honest response is either:
- graduate some forks into separate sibling recipes, or
- recognise the user is really building a PARAMETERISED recipe (e.g. roast with a
  "doneness" parameter taking any value), not 10 discrete forks.
So: surface graduation / parameterisation prompts, not a hard cap.

## Three orthogonal axes (the deep takeaway)
The old model conflated three genuinely independent things:
1. **History** — versions; what replaces what over time.
2. **Catalog** — concept → sibling recipes; how recipes relate as alternatives.
3. **Execution branching** — options/forks within one recipe; choices made while
   cooking (the roast's doneness). Connects to **Cook Mode / Live Cooking
   Sessions** — a branch point is a decision the recipe presents to the cook at
   execution time, not a catalog entry.

## Open questions (for the build-design pass — fresh)
- Where does "concept" physically live? At the ingredient layer, a new table, or
  a grouping key? (It behaves like the human-facing label above precise
  ingredients.)
- Is "fork" an in-recipe branch (a step with options) or shared-component recipes?
  Lean: in-recipe branch point for the lightweight case; graduate to sibling
  canonical when it outgrows that.
- Parameterised recipes (doneness as a parameter) vs discrete forks — when is each
  right?
- How does graduation actually re-home a fork as a sibling without losing lineage
  (canonical→canonical "forked-from" link)?
- ONLY after this: where does `recipe.kind` live (likely the canonical/recipe
  level, intrinsic & stable), and the Plan & End-Product bridge.

## Why captured, not built
Every "next small thing" this session (save fix, mirror audit, add-recipe button,
kind enum) turned out to depend on something upstream. The chain terminates HERE:
the recipe model itself. This is foundational and worth a deliberate, fresh
design+diagram pass before any schema. Everything downstream (kind, Plan rework,
two-intents feature, Cook Mode execution branching) hangs off getting these levels
right.
