# Soupdog — The Plan & End-Product Model

*Design note · v0.1 · Draft for review · June 2026*

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

**[OPEN]** Exact kind set and how it's stored (enum on the recipe? derived from
structure?). The five examples are the acceptance test for whatever we pick.

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
  end-product ingredients. **[OPEN]** Whether to literally merge the tables, or
  keep them separate with a clean 1:1 "every meal materializes an ingredient
  row" bridge. The bridge is lower-risk; full merge is cleaner but deep.
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

- **Do NOT build yet.** This reframes the plan's spine; settle §3 (kinds) and §4
  (unify vs bridge) first.
- The earlier guidance was "stabilize meals first." This model makes the plan
  *depend* on the meal/ingredient layer — so meal stability is a prerequisite,
  not a parallel track.
- Natural first buildable step once settled: make the plan reference an
  end-product ingredient (with a bridge so composed meals materialize as
  ingredient rows), keeping recipe-kind minimal (composed/simple/acquire to
  start; delivery later).

## 8. Relationship to existing notes

- **Ingredient–Process Model** — this is its application to the plan. Same one-
  node-type/one-edge-type spine; this note adds "recipe = acquisition method,
  not just cooking" and "the plan references the end node."
- **Demand / Role / etc.** — unaffected; they already operate on ingredients +
  participants, which is exactly what the plan would now reference.
