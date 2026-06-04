# Soupdog — The Ingredient–Process Model

*Design note · v0.1 · Draft for review · June 2026*

**Status.** A design note, not an implementation plan. It records a unifying
model for what an *ingredient*, a *process*, a *recipe*, and a *meal* are, and
how they relate — arrived at while cleaning up a mislabelled "Ice cube" row.
The model is largely already *latent* in the live schema; this note makes it
explicit so future work builds toward it deliberately. Open questions are
flagged **[OPEN]**. Nothing here is built beyond the one-line ice-cube lineage
fix that prompted it.

---

## 1. The single invariant

> **Every ingredient is the single output of a process. Every process consumes
> one or more input ingredients and produces exactly one output ingredient.**

That one rule generates the whole content model. There is **one node type** —
the *ingredient* — and **one edge type** — the *process* that turns inputs into
an output. Everything else (raw materials, transformed states, dishes, meals)
is a position on a single compositional spectrum, not a separate kind of thing.

- A **raw input** (water, salt) is an ingredient with no process beneath it — a
  leaf of the graph.
- A **transformed state** (an ice cube) is an ingredient whose process is
  trivial: one input (water), one passive task (hold sub-zero for a time), one
  output.
- A **dish** (a stew) is an ingredient whose process consumed many inputs.
- A **meal** is an ingredient whose process consumed other high-composition
  ingredients (dishes). It doesn't matter that its inputs are themselves
  composed — it is still one specific object: the single output of its process.

Turtles all the way down; one node type the whole way up.

## 2. What a process is

A process (the thing a recipe describes) is:

- **one or more tasks**, each performed by one of two actors — a **human** or a
  **machine**. *Passive* steps (resting, freezing, proving) are not a third
  actor: they are a human- or machine-initiated wait, i.e. a task whose "work"
  is elapsed time in an environment.
- **zero or more tools** used by those tasks.
- **one or more input ingredients** consumed.
- **exactly one output ingredient** produced. ← the invariant.

The single-output rule is the load-bearing constraint. It is what lets the graph
stay resolvable and lets any node be reasoned about identically to any other.

## 3. `transformed_from_id` and a recipe are the SAME edge at different scales

The live schema already has two mechanisms that, under this model, are revealed
to be the same thing:

- **`ingredients.transformed_from_id`** — a pointer "this ingredient was made
  from that one." This is the **degenerate process**: one input, one (often
  passive) task, one output. Too trivial to warrant a full authored recipe, but
  still a real edge in the graph. (Ice cube → water is exactly this.)
- **A full recipe** (`recipe_canonical` + versions + steps + ingredients) — the
  **rich process**: many inputs, many tasks, tools, one output.

They are the **same edge type** at different complexity scales. A clean future
model would let `transformed_from_id` be understood as "the recipe for this
ingredient is trivial," and a full recipe as "the transform for this ingredient
is rich" — one concept, two storage shapes for cost reasons.

**[OPEN]** Whether to literally unify these in storage, or keep the cheap
pointer for trivial transforms and the recipe tables for rich ones (likely the
latter — same concept, pragmatic split).

## 4. A meal is an ingredient (this unifies the live meal layer)

The model predicts a meal is not a distinct type — it is a high-composition
ingredient. This **retroactively explains the existing meal layer**:

- `recipe_canonicals.composition_level` (the meal/dish/component enum) is best
  understood as a **descriptor of process-tree depth**, not a *type* distinction.
- `meal_component` = the input-ingredient edges of a meal's process (which
  dishes go in).
- `meal_merged_recipe.payload` = the meal **materialised as one object** — the
  single interleaved step list. This *is* "the meal as a single output
  ingredient." The L1/L2 merge logic is the *implementation* of "compose several
  ingredient-processes into one new ingredient-process."
- The handover's own prior conclusion — *"a meal IS a new materialised recipe,
  not links to dish recipes"* — is this principle, reached pragmatically before
  it was named.

So nothing new needs building to make meals fit; the model just names what the
meal layer already is, and suggests `composition_level` is a descriptor.

## 5. `food_state` is an adjective, never a substitute for being an ingredient

The `food_state` enum (`frozen, refrigerated, room_temp, hot, thawed_partial,
dried, fermented, cured`) is a **transient property of an ingredient at a point
in a process** — "add the butter (room_temp)," "serve the ice cube (frozen)." It
is an **adjective on a noun**, not an alternative to being a noun.

The "reclassify Ice cube as a food_state" backlog note was a category error: it
tried to demote a noun (an ingredient) to an adjective (a state). An ice cube is
an ingredient — the single output of freezing water — that *also* happens to be
in the `frozen` state. The fix is therefore **not** reclassification; it is
giving it its missing lineage edge: `ice_cube.transformed_from_id → water`.

**Reversibility note.** Ice→water→ice is physically reversible, but the graph
encodes a *directed* edge ("ice cube made from water"). The cycle-guard trigger
on `transformed_from_id` deliberately forbids `A from B` *and* `B from A` — a
circular lineage is unresolvable. Melting is not a new ingredient; it is the ice
cube observed in a non-frozen state, which is just water again. One forward edge
is all that's needed.

## 6. Cleanups this model predicts (NOT done here)

- **cold water / hot water** are currently role-less standalone ingredient rows.
  Under the model these are almost certainly *water in a food_state* (a transient
  adjective), wrongly promoted to distinct nouns — UNLESS a recipe genuinely
  consumes "hot water" as a precursor it transforms further, in which case "hot
  water" is the legitimate single-output of a trivial heating process. Decide
  per-row; don't auto-merge.
- **`composition_level`** reframed from type → descriptor (no urgent change).
- The generic **Beef / Lamb / Pork** rows were marked `is_category = true` in the
  red-meat cleanup — consistent with this model: a category is not an ingredient
  (you can't cook "beef"); real cuts are the ingredients, each the output of a
  butchery process.

**[OPEN]** Per-row decision rule for state-vs-ingredient (when is "hot water" a
real precursor vs. just water+state?). Likely: it's a distinct ingredient only
if some process consumes it and transforms it further.

## 7. Why this matters

This is the "graph of food" thesis made precise. One node type and one edge type
mean every reasoning capability the platform builds — substitution, scaling,
nutrition roll-up, the Demand Model's matching, cooking-rule transfer — operates
**identically** on a raw ingredient, a dish, and a meal. No special cases by
"level." The uniformity is the leverage: build a capability once, it works
everywhere on the graph.

## 8. Next step

Review and mark up. If adopted, the model informs (not blocks) later work:
the meal editor, the `composition_level` descriptor reframing, and the
state-vs-ingredient cleanup. The only thing built from it now is the ice-cube
lineage fix.
