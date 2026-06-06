# Soupdog — Recipe Model: Concept / Recipe / Version / Fork (v0.2)

**Status:** Design note, not built. Foundational. Sits UPSTREAM of: the
`recipe.kind` enum, the Plan & End-Product rework, and the "add recipe from
ingredient" two-intents note — all depend on these levels. Do NOT add `kind` or
repoint plan schema until this is resolved.

v0.2 (2026-06-06) resolves three open questions from v0.1: concept placement,
concept ownership, and the content-reuse mechanism. Two questions remain open
(fork representation, graduation lineage).

## The problem it solves
Current DB has only `recipe_canonicals → recipe_versions` (two levels). Real user
behaviour needs more distinctions. Worked out via two examples:
- **Chocolate mousse:** one concept a user searches/clicks, but 100 different
  mousse recipes → 100 (technically distinct) result ingredients.
- **Roast (medium vs medium-rare):** user thinks "two oven-time options on ONE
  recipe," not "two recipes."

## The levels
1. **Concept** — a user-meaningful GROUPING. See "Concept" section below (resolved
   in v0.2).
2. **Recipe (canonical)** — a SIBLING: an independent recipe producing (a variant
   of) the concept. The 100 mousses are 100 canonicals.
3. **Version** — REPLACE-history within one recipe (`current_version_id`). Already
   exists as `recipe_versions`.
4. **Fork / branch point** — SHARED CONTENT + a DIVERGENCE. See below.

### Settled: siblings == variations
"The 100 recipes" and "a variation" are the SAME thing. A recipe arriving
fresh-written or by tweaking an existing one (salt, servings, electric whisk) is
another SIBLING. No structural difference between sibling and variation.

## Concept — RESOLVED in v0.2
- **Curated, global, many-to-many.** A concept is a curated grouping (humans now,
  AI later) of ingredients perceived as "the same thing." NOT user-owned.
- **Many-to-many:** an ingredient can belong to multiple concepts; a concept
  gathers many ingredients. (Concept "defines its children", rather than each
  ingredient having ONE parent.)
- **Perception varies across a global audience — handled by OVERLAPPING concepts,
  not per-user concepts.** A clever curator who knows different audiences group
  the same ingredient differently simply creates two concepts that both reference
  the shared ingredient. This is the standard e-commerce pattern (same product in
  "Kitchen" AND "Gifts" AND "Under $50") — not a conflict, a feature.
- Recipes attach to a concept via their RESULT-ingredient's membership in that
  concept's set.
- Implementation hint: a many-to-many membership (concept ↔ ingredient), NOT the
  existing single `parent_id` (which stays for product↔category). Keeps the two
  relationship types from getting muddied.

## Content reuse — RESOLVED in v0.2: PULL, not inheritance
The decision to reuse content lives with the CONSUMING entity, declared as a
REFERENCE — nothing is pushed/inherited from a parent:
- A mousse RECIPE says "use the picture from the Chocolate Mousse INGREDIENT."
- A roast FORK says "use all these steps from THAT fork, plus my own divergence."
- **No magic inheritance** concept→members or core→forks. Each consumer explicitly
  references what it borrows → predictable, no "why did my picture change"
  surprises.
- **"One edit covers both" works via REFERENCE:** if both roast forks reference the
  same source steps, editing the source updates both BECAUSE they point at it.
  Shared-ness is an opted-into reference, not a structural parent.
- **Decouples concept (grouping) from content-reuse (referencing)** — two separate
  mechanisms; previously tangled.

### Who may declare reuse — ownership / admin rights
Not "the concept decides" or "the source decides" — whoever has ADMIN RIGHTS over
the entity making the reference. The owner of the mousse recipe decides it borrows
the mousse-ingredient picture. **Rides on the Sharing & Delegation access model
(`person_access` grants) — no new permission concept needed.**

## Fork / branch point — the "one edit covers both" want
The roast exposed TWO tangled wants:
- **Want A — "I perceive these as one"** → the CONCEPT grouping.
- **Want B — "one edit covers both; don't maintain two copies"** → SHARED CONTENT
  via reference (above). A fork = shared content (media/picture, common
  ingredients, common steps, all by reference) + a divergence (doneness, salt).

### Graduation: fork → sibling
A fork is lightweight until it diverges enough to be its own dish, then it can
GRADUATE into a full sibling canonical under the concept.
- User choice ("make this its own recipe").
- AI can SUGGEST graduation when divergence is high.

### "Too many forks" — no technical limit
No technical reason to cap forks. "10 forks, stop it!" is a MODELING SMELL, not a
guardrail: respond by graduating some to siblings, or recognising a PARAMETERISED
recipe (roast with a "doneness" parameter taking any value). Surface prompts, not
a cap.

## Three orthogonal axes (deep takeaway)
1. **History** — versions; what replaces what over time.
2. **Catalog** — concept → sibling recipes (curated, many-to-many); alternatives.
3. **Execution branching** — forks/options within one recipe; choices made while
   cooking (roast doneness). Connects to **Cook Mode / Live Cooking Sessions** — a
   branch point is a decision presented to the cook at execution time.

## Open questions (for the build-design pass — fresh)
- **Fork representation:** in-recipe branch (a step with options) vs a recipe that
  REFERENCES another's components? The v0.2 content-reuse-by-reference model leans
  toward: a fork is a recipe referencing another's components, graduating to a
  full sibling when it outgrows that. Confirm.
- **Graduation lineage:** how does a fork re-home as a sibling without losing
  "forked-from" lineage (canonical→canonical link)?
- **Parameterised recipes** (doneness as a parameter) vs discrete forks — when each?
- ONLY after the above: where `recipe.kind` lives (likely the canonical/recipe
  level — intrinsic & stable), then the Plan & End-Product bridge.

## Why captured, not built
Every "next small thing" this session bounced off an upstream dependency; the chain
terminates at the recipe model. v0.2 resolves concept + content-reuse + ownership.
The remaining open questions (fork representation, graduation) plus schema design
deserve a deliberate, fresh design+diagram pass before any live-DB migration.
Everything downstream (kind, Plan rework, two-intents, Cook Mode) hangs off this.
