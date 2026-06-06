# Soupdog — The Plan & End-Product Model

*Design note · v0.2 · Two key opens DECIDED · June 2026*

**Status.** A design note, not an implementation plan. It is the direct sequel
to the Ingredient–Process Model note and carries that model to its full
generality: **everything a person wants is an ingredient, and a recipe is the
method of obtaining it.** Arrived at while questioning why the meal plan holds
"dishes." Nothing here is built; opens are flagged **[OPEN]**. Do not migrate
the plan schema until the opens are settled. (System is pre-launch with dummy
data — no existing content/plans to preserve, which removes migration risk but
not design risk.)

---

## 1. The invariant

> **A plan entry is one desired end-product. That end-product is an ingredient.
> A recipe is how to obtain that ingredient. One entry = one item.**

The plan does not hold "dishes," or "meals," or "recipes." It holds the single
*thing the person wants*, on a date/slot. How that thing is obtained — cooked,
composed, bought, delivered, or just picked up — lives entirely in the recipe,
not in the plan.

## 2. The five canonical examples (the model's test set)

Each is exactly ONE item in a plan; the recipe is how to get it. Any future
change to the plan/recipe model must still hold for all five:

| Wanted item (ingredient) | Recipe (method of obtaining)                    | Recipe kind |
|--------------------------|-------------------------------------------------|-------------|
| An apple                 | acquire / wash                                  | acquire     |
| A bowl of oatmeal        | a short cooking process                         | simple      |
| A 5-course dinner + 3 wines | a deeply composed process (many sub-items)   | composed    |
| A wedding banquet for 200 | an enormous composed process                   | composed    |
| Order a pizza            | call / pay / wait — external procurement        | delivery    |

The banquet and the apple are **the same shape to the plan** — both are one
ingredient on a slot. All difference lives downstream in the recipe.

## 3. The key generalization — recipe = method of ACQUISITION

A recipe is NOT always cooking steps. It is the method of obtaining an
ingredient, of which cooking is one kind. Provisional kind taxonomy:

- **composed** — combine other ingredients via a (usually cooking) process;
  the multi-dish meal case. Inputs are themselves ingredients.
- **simple** — one short process (oatmeal); few inputs.
- **acquire** — obtain a raw item (the apple); recipe is near-trivial.
- **delivery / order** — procure from an external provider (the pizza); no
  cooking, but still a process with steps (order, pay, wait, receive).
- **none / given** — you already have it; no method needed.

**DECIDED (v0.1): EXPLICIT ENUM** on the recipe — a `kind` column
(composed / simple / acquire / delivery / none). Rationale: recipe-kind drives
cook-mode EXECUTION TEMPLATES (a delivery recipe runs nothing like a composed
one), so it must be a reliable, deliberate property, not a fuzzy inference that
could misfire mid-cook. The five canonical examples are the acceptance test for
the kind set. Derived-from-structure was considered and rejected as fragile for
something that gates UI/execution behavior.

## 4. What this implies for the schema (the big move)

If a meal IS an end-product ingredient (Ingredient–Process Model §4), and the
plan references end-product ingredients, then:

- **The plan should reference the end-ingredient, not a recipe.** Today a plan
  entry has `recipe_id → recipe_canonicals`. Under this model it should point at
  the *ingredient* (the wanted item); the recipe is reached *through* the
  ingredient (its method of obtaining), not referenced directly by the plan.
- **`recipe_canonicals` and `ingredients` want to unify.** Today meals live in
  `recipe_canonicals` and raw items in `ingredients` — two tables for what the
  model says is one node type. A meal, an apple, and a banquet are all
  end-product ingredients.
  **DECIDED (v0.1): BRIDGE, not merge.** Keep both tables; every meal/recipe
  materializes a 1:1 `ingredients` row (the end-product), linked. The plan
  references the INGREDIENT row. Rationale: lower-risk, reversible, lets each
  table keep its natural columns (ingredients: nutrition_per_100g, roles;
  recipes: versions, servings, cuisine). Cost to manage: the materialization
  must stay in sync (create/update/delete a meal → mirror the ingredient row),
  and there are two rows for "one thing" — accepted as a pragmatic impurity. A
  full table merge remains the purer end-state and can be revisited later if the
  duplication proves annoying.
  Implementation sketch: a meal-create writes the recipe_canonical AND an
  ingredients row (composition_level high), with a link column (e.g.
  ingredients.made_by_recipe_id → recipe_canonicals.id, and/or
  recipe_canonicals.produces_ingredient_id). The plan FK moves from
  recipe_id → recipe_canonicals to ingredient_id → ingredients.
- **Build, don't link.** A composed meal-ingredient is *built from* its
  component dishes (its recipe captures them as inputs); the plan and the
  meal-ingredient do NOT hold pointers to the constituent dishes. (Consistent
  with the handover's prior "a meal IS a materialised recipe, not links.")

## 5. Provenance / propagation edge (flagged, not solved)

We may still want a relation from a composed meal-ingredient back to its source
dishes — NOT for the plan, but to propagate changes: if a source dish's photo or
a step is edited, the composed meal may want to know. This is a **provenance/
lineage edge**, separate from both the plan and the recipe's input list.
**[OPEN]** whether to model this now or defer; likely defer until there's a
concrete propagation need.

## 6. What this resolves / simplifies

- "Should the plan hold meals or dishes?" — wrong question. It holds ingredients
  (end-products). Meal vs dish vs apple is just composition depth of the item.
- The Phase 1 "For your table" panel, the Demand Model matching, plating — all
  operate on an end-product ingredient + its participants, uniformly, regardless
  of whether that item is an apple or a banquet.
- "Order a pizza" and "cook a tagine" stop being special cases — both are
  ingredients with a recipe of some kind.

## 7. Scope discipline / sequencing

- **Do NOT build the plan rework casually** — it's spine-level — but the two
  gating opens are now DECIDED (bridge; explicit kind enum), so it IS buildable.
- The earlier guidance was "stabilize meals first." This model makes the plan
  *depend* on the meal/ingredient layer — so meal stability is a prerequisite,
  not a parallel track. Confirm meals are stable before starting.
- **First buildable step (decisions applied):**
  1. add `recipe.kind` enum (composed/simple/acquire/delivery/none);
  2. add the bridge: materialize a 1:1 ingredients row per meal/recipe, with a
     link column both ways; backfill existing meals (dummy data, low risk);
  3. repoint the plan FK: recipe_id → ingredient_id;
  4. update plan API + PlanView + add/swap flows to reference end-ingredients;
  5. keep recipe-kind minimal at first (composed/simple/acquire); delivery/none
     later.

## 8. Relationship to existing notes

- **Ingredient–Process Model** — this is its application to the plan. Same one-
  node-type/one-edge-type spine; this note adds "recipe = acquisition method,
  not just cooking" and "the plan references the end node."
- **Demand / Role / etc.** — unaffected; they already operate on ingredients +
  participants, which is exactly what the plan would now reference.
