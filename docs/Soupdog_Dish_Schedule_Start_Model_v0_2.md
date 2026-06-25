# Soupdog — Dish · Schedule · Start (the unified instance model) · Design v0.2

**Status:** design-first · pre-build · SPINE-LEVEL (do not refactor live without a dedicated session)
**Date:** 2026-06-24
**Supersedes:** parts of `Soupdog_Participants_On_Recipes_And_Meals_Design_v0_1.md`
(the participants/nutrition design is folded in as §6 here; v0.1's `meal` /
`meal_component` framing is replaced by this model).
**Relates to:** Plan & End-Product Model v0.1 (this settles its merge-vs-bridge open),
Ingredient–Process Model, Atomic Decomposition v0.3.
**House style:** olive `#2E4638`, IBM Plex Serif, numbered sections, `[OPEN]` flags.

---

## 1. The model in one paragraph

A **dish** is an unscheduled recipe producing ONE end-product — it may be simple
(tomato soup), a drink (a glass of red wine — a drink is just a dish), or composed
(soup *with* a glass of wine = one composed dish). On its own a dish has no people
and no timestamp; it is a *method* for producing one end-product. **Scheduling**
assigns a dish to a person's plan at a time. **Starting** (cooking) can happen from
the plan (a scheduled dish) or straight from the recipe (unscheduled) — one cook
path, two entry points. **Starting always has at least one assigned person**, where
a person may be a known individual or a **persona stand-in**. Portioning, nutrition,
and warnings are always computed per assigned person. **There is no separate "meal"
type — only dishes (types) and their scheduled / started instances.**

---

## 2. Why this exists (what it resolves)

Two things in the live codebase are both called "meal" and have been conflated:

- the **`meal` table** (plan rows: `recipe_id`, `meal_date`, `scheduled_time`,
  `meal_participant`) — a genuine INSTANCE; and
- the **`/my/meals/[id]` editor + `meal_component`** — a COMPOSITION mechanism
  ("build a multi-dish meal").

The composition mechanism is redundant. Under the locked invariant (*output is
always ONE ingredient; a recipe is the method; the method composes downward*),
"merging dishes into a meal" is the SAME operation as "adding ingredients to a
recipe", one composition level up. So multi-dish-ness belongs to the **recipe**,
not to a separate meal object. What remains genuinely distinct is **type vs
instance**: a recipe is a type ("Spaghetti Carbonara"); an instance is "the
carbonara on Thursday 19:00 for Rasmus + Natasha". A type cannot hold "Thursday".

**Resolution (answers Plan & End-Product's merge-vs-bridge): BRIDGE, not merge.**
- Keep the INSTANCE (date/time/people) as a thin layer.
- RETIRE `meal_component` as a parallel composition object.
- Composition becomes RECIPE-NATIVE (a recipe may take dishes-as-inputs the way
  it takes ingredients).

---

## 3. The dish (type)

- One node: a recipe producing one end-product.
- **Kinds** (descriptor, not separate objects): simple · drink · composed.
  A drink is a dish whose end-product is a beverage. A composed dish references
  other dishes as inputs (soup + wine).
- Composition is recipe-native — "multiple dishes together" is one composed
  recipe, NOT a container of meals. This is the decomposition design's recursion
  stated top-down (Meal = ONE recipe → end product, composed of dish sub-recipes
  → group sub-recipes → atomic steps).
- A dish has NO people and NO timestamp. It is unscheduled by nature.

`[OPEN 3a]` How a composed dish references its sub-dishes in schema — reuse the
existing sub-recipe / composition tables (version_sub_recipes, version_steps
referencing dishes) vs a dedicated "dish-as-input" edge. Decompose-time
find-or-create already matches sub-recipes; this likely rides that.

---

## 4. The instance (schedule + people) — what "meal" becomes

An instance is **a timestamp + people, each assigned to a dish** (default: the one
shared dish). It is thin: it references dishes and carries scheduling + assignment.
It NEVER composes — composition is the recipe's job.

- **Single-dish dinner** — everyone assigned to the same dish.
- **Wine vs soda (the v2 case)** — adults assigned to one dish, children to
  another, within the same occasion. The instance holds *people-assigned-to-dishes*;
  multiplicity of dishes in an occasion is assignment, not composition. (This is
  the clean generalisation of v0.1 §9's "participant-scoped components": instead of
  scoping components of a meal, a participant points at a dish.)

So: **instance = timestamp + participants, each participant assigned to ≥1 dish.**
The existing `meal` table already nearly is this (`recipe_id`, `meal_date`,
`scheduled_time`, `meal_participant`); what leaves is `meal_component`.

`[OPEN 4a]` Per-person dish assignment shape (for wine/soda): a join
(participant × dish) on the instance. v1 default = all participants → the one
dish; the join is the seam, populated for real only in the multi-dish case.

---

## 5. Scheduling & Starting

### 5.1 Scheduling
A user schedules a dish onto **a person's** plan at a time — their own plan, or
someone else's if `person_access` grants the right (managed child, delegated
client, etc.). Scheduling is what creates the instance ahead of time.

### 5.2 Starting (cooking) — one path, two entry points
- **From the plan** — a scheduled dish; Start uses the existing instance.
- **From the recipe** — unscheduled; Start mints a lightweight instance on the
  spot (today's date/now, the caller's plan), then follows the same cook path.

This is v0.1 §7's "cook-a-recipe-directly mints a lightweight meal" — restated:
starting from the recipe just creates the instance *now* instead of ahead of time.
No parallel recipe-cook stack.

### 5.3 Start requires ≥1 person (MANDATORY)
Portioning, nutrition, and allergy/diet warnings are all per-person; with nobody
assigned there is nothing to size or check against, and an "optional people" branch
would re-introduce exactly the kind of second code path that bred the meal/dish
mess. So Start ALWAYS has at least one assigned person. The range of "person" is
what flexes (see §6), not whether a person exists.

---

## 6. Who is a "person" — known individual ⟷ persona stand-in

**Decision: a participant is ALWAYS a person; an unknown eater is a *persona
person*. People are never optional — the persona is the floor.**

The demand model already runs on personas as the bottom rung (`toddler`, `child`,
`adult_female`, `adult_male`, `adult_unspecified`), with honest low (grey)
confidence. So "unknown eater" is not a missing person — it is a person resolved
only to the persona floor. This keeps ONE uniform rule and one code path:

- **Known individual** — full profile; high-confidence portioning/warnings.
- **Persona stand-in** — population-average; low-confidence ("best guess" grey
  dot). Honest, not broken.

Two motivating cases, same mechanism:
- **Logged-out / not-yet-known user** — a persona person (e.g.
  `adult_unspecified`) so the recipe view, portioning, and the "for your table"
  panel all work before sign-in, as a gentle, honest invitation.
- **Canteen / unknown diners** — even cooking for strangers, the cook cooks *with
  people in mind*. So the eaters are persona people, not "no people". The
  warnings/portioning run at persona confidence.

**Rasmus's note (recorded):** persona-as-person should be made MANDATORY once
built — because there is always *someone* in mind, known or not. Build personas as
first-class assignable participants; until then, the self-person fallback stands in.

`[OPEN 6a]` Persona-person SHAPE is deferred (name the seam, don't model it yet):
a single representative persona? a count (N persona people)? a distribution ("180
adults, 20 children")? a named house-diner profile? Only matters when the
commercial/group surface is built. The seam: **"participant" accepts a
persona-person, not only a known person.**

---

## 7. The per-person panel (folded from Participants v0.1 §3)

Unchanged in intent; restated against this model. When an instance has assigned
people, the panel shows three honest layers:

1. **Meal total** — the dish's full nutrition (one end-product ⇒ one figure;
   composed dish = sum of its sub-dishes).
2. **Plating** — per person, recommended share + cook-friendly phrasing
   (encourage, never shame). Demand-model plating split.
3. **Per-person portion nutrition + "% of daily"** — `share ×
   recommendedServings × perServing`, ÷ each person's resolved DAILY target;
   honest confidence dot; "% of day" reads low by design (one occasion).

**Single source of truth for nutrition (settled this session):** nutrition comes
from the canonical recipe-nutrition route (`/api/recipes/[versionId]/nutrition`) —
the SAME source the recipe page uses — never a stale stored `nutrition_per_serving`
field. The match route returns plating + each person's daily targets + the recipe
`versionId`; the panel fetches nutrition and does the portion math. Guarantees the
meal panel and the recipe page never disagree.

Compact 5-macro summary inline; full 71-nutrient per-person breakdown on tap
(reuses `NutrientDetailModal`, which already anticipates this panel). "% of daily"
lights up for the 5 macros the demand model resolves; other nutrients show amounts
only until the target table broadens (honest current state).

---

## 8. What is SHIPPED vs what this note defers

### Shipped & verified this session (works under the current tables)
- Shared presentational `<Participants>` (extracted from PlanView).
- `match` route resolves a plan-meal id (B1) AND returns per-person daily targets
  + recipe `versionId` + recommendedServings.
- `MealFitPanel` fetches the canonical nutrition route and renders per-person
  portion macros + "% of day" (single-source-of-truth).

### Deferred — the SPINE REFACTOR (its own dedicated session)
- Retire `meal_component`; make composition recipe-native (§2–§4).
- Unify the two `/my/meals/[id]` meanings into ONE = the instance; the per-person
  panel lives there; multi-dish *composition* moves to the recipe editor.
- Per-person dish assignment join (§4a) for the wine/soda case.
- Persona-people as first-class assignable participants (§6), then mandatory.

**Do NOT refactor live without settling §3a, §4a, §6a and confirming the build
sequence.** This touches the meal editor, the build/materialisation path, the plan
creation flow, and the decomposition layer at once.

---

## 9. Immediate (non-spine) consequence to decide now

The per-person panel currently only mounts on the `/my/meals/[id]` *editor* page,
which shows blank chrome for a plan-meal id (it expects an editor-composed meal).
The plan does not link anywhere that mounts the panel for a plan meal. So the
shipped feature has **no clean rendering home** yet.

Two near-term options (NOT the spine refactor — just giving the panel a home):
- **(A)** A thin read-only "scheduled dish" view for a plan meal that mounts
  `<MealFitPanel>` + the dish, linked from the plan row. Small.
- **(B)** Mount the panel on the recipe view when reached with an assigned set of
  people (the recipe what-if from v0.1 §5). Larger; converges with the recipe
  participants surface.

`[OPEN 9a]` Pick A or B as the panel's interim home, OR fold this into the spine
refactor and leave the panel reachable only via direct URL until then.

---

## 10. Principle check
- *Output is always one ingredient* — honoured: dish = one end-product; composed
  dish sums its sub-dishes; instance never composes.
- *Type vs instance* — honoured: recipe = type, instance = time + people; bridge,
  not merge.
- *Name the seam, don't build the abstraction* — honoured: persona-person shape,
  per-person dish assignment, composed-dish edge all NAMED, none modelled yet.
- *One uniform rule over special cases* — honoured: Start always ≥1 person;
  unknown eater = persona person, not a no-people branch.
- *System measures & suggests; human names & decides* — honoured: persona
  confidence is honest, never a false verdict.
