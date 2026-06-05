# Soupdog — Role Strength & Substitution Model

*Design note · v0.1 · Draft for review · June 2026*

**Status.** A design note, not an implementation plan. It records a refinement
to the culinary-role model: roles need a notion of *how strongly* an ingredient
performs a job, not just *whether* it performs it — because substitution depends
on magnitude, not mere presence. Arrived at while finishing the role-assignment
cleanup. Nothing here is built; the 50-ingredient role-assignment chore proceeds
with the simple single-primary model and this layers on later. **[OPEN]** flags
unresolved choices.

---

## 1. The problem the current model has

`ingredient_roles` currently expresses two things per ingredient–role pair:
- `is_typical_primary` (boolean) — is this the ingredient's main job?
- `confidence` (numeric) — how sure are we the role applies at all?

Neither answers the question substitution actually asks: **how good is this
ingredient at this job?**

Worked example. Looking for a protein substitute:
- Ingredient A (lentils) has protein as its **primary** role.
- Ingredient B (paneer) has protein as a **secondary** role.
- But paneer delivers more protein per 100g than lentils.

→ Paneer is the better protein swap, yet a primary-flag-based ranking would put
lentils first. The boolean is not just insufficient, it actively misleads.

## 2. The key distinction — two different meanings of "strength"

"How good at the job" splits into two genuinely different things:

**(a) Objective magnitude — how much of the functional substance it delivers.**
For the macro/structural roles this is a *nutrition number we already store*:
- protein  → `nutrition_per_100g.protein`
- fat      → `nutrition_per_100g.fat`
- fiber    → `nutrition_per_100g.fiber`
- starch   → derivable from carbohydrates
A separate stored "protein strength" would DUPLICATE this and risk drift. So for
macro roles, substitution magnitude should READ THE NUTRITION DATA, not a new
field.

**(b) Functional intensity — how hard it performs a job with no single nutrient
proxy.** This is where a stored value genuinely adds information:
- acid     → lemon and tomato both "do acid," but lemon does it harder
- umami    → no clean nutrition column captures this
- aromatic → punch / potency, not a macro
- bittering, sweetener-as-flavor, thickener, emulsifier, etc.
These flavor/texture roles need an explicit stored intensity because nothing in
`nutrition_per_100g` expresses them.

## 3. Three ORTHOGONAL axes (do not conflate)

A role assignment carries three independent facts:
1. **is_typical_primary** — is this the *main* job this ingredient is brought in
   to do? (identity / default display / "what kind of thing is this")
2. **confidence** — how sure are we the role *applies*? (evidence quality)
3. **intensity** — how *strongly* does it perform the role? (NEW)

These are different. A tomato might have acid as a non-primary role (1=false),
that we're certain applies (2=high), at modest strength (3=low-medium). Collapsing
any two of these loses real information. In particular, `confidence` is NOT
strength — "we're sure it's a bit acidic" ≠ "it's very acidic."

## 4. Proposed schema change (NOT yet applied)

Add one column:
- `ingredient_roles.intensity numeric` — how strongly this ingredient performs
  this role. **[OPEN]** scale: 0–1 vs 1–5. Lean 0–1 to match `confidence`.

For macro/structural roles, leave `intensity` null and derive magnitude from
`nutrition_per_100g` at query time. For flavor/texture roles, populate
`intensity`. **[OPEN]** whether a hybrid (store intensity for ALL roles, seeded
from nutrition for macros) is worth the denormalization — probably not; derive
macros live to avoid drift.

## 5. How substitution then works

To find substitutes for "ingredient A in role R":
1. **Candidates** = ingredients that also have role R (primary OR secondary —
   presence, not primacy, is the gate).
2. **Rank by closeness in the right magnitude:**
   - if R is a macro role (protein/fat/fiber/starch) → compare
     `nutrition_per_100g` for R's nutrient.
   - if R is a flavor/texture role → compare `intensity`.
3. Optionally weight by `confidence` (down-rank shaky assignments) and by other
   shared roles (a swap that matches MORE of A's roles is a better swap).

So `is_typical_primary` is for *display and identity*; magnitude (nutrition or
intensity) is for *substitution ranking*. Different jobs, different fields.

## 6. Relationship to existing models

- **Ingredient–Process Model:** unchanged. Roles are functional tags on the
  ingredient node; intensity is a property of the tag. Works identically for a
  raw ingredient, a dish, or a meal (a composed ingredient can have emergent
  roles with their own intensity).
- **Demand Model:** role intensity could later sharpen meal balance/scoring
  (a meal "has acid" is weaker information than "has acid at sufficient
  intensity"). Out of scope for now.

## 7. Scope discipline / next steps

- **Now:** finish the role-assignment cleanup with the SIMPLE model — single
  primary role per ingredient (plus obvious secondaries if cheap). No intensity,
  no schema change. Gets the food model "complete enough."
- **Later (deliberate):** add `intensity`, decide the scale, decide derive-vs-
  store for macros, and build substitution to consume nutrition + intensity.
  This is a Food Model amendment, built when the substitution feature is.
- **[OPEN]** Confirm whether any current feature already reads
  `is_typical_primary`; if substitution isn't built yet, primary assignment
  accuracy matters less now and can be refined when intensity lands.
