# Soupdog — "Add a Recipe from an Ingredient": Two Intents (v0.1)

**Status:** Design note. Not built. Captures a product insight (2026-06-06) about
the "Create a recipe using this product" button on the ingredient page, which
currently links to `/my/recipes/import` (blank) and does NOT carry the ingredient.

## The core insight: one button, TWO user intents
Clicking "add a recipe" from an ingredient page conflates two different goals:

### Intent 1 — use the ingredient AS AN INPUT ("I have this; cook with it")
- e.g. "I have a Dr Oetker frozen pizza" / "I have potatoes — what can I make?"
- The ingredient is an INGREDIENT in the new recipe.
- **This is really the seed of a bigger capability:** define one or more
  ingredients you have → Soupdog shows matching recipes, or generates one. Later
  ties to INVENTORY ("suggest recipes from what people have").
- Natural home is **meal plan / inventory**, NOT a lone ingredient page — though
  the lone-ingredient case ("carry this one ingredient into a new recipe") is a
  lighter subset that could exist first.
- **Data model:** ingredient appears in the recipe's ingredient list →
  surfaces on the ingredient page as `linkedRecipes` ("In recipes").

### Intent 2 — make the ingredient AS A RESULT ("I want THAT; make it")
- e.g. user sees "chocolate mousse" and wants to cook it.
- **This is how people most often approach cooking** — look at the end
  product/ingredient and say "I want that."
- The ingredient is the OUTPUT of the new recipe.
- **Data model:** the recipe is set as the ingredient's
  `transformation_recipe_id` → surfaces as `transformationRecipe`
  ("what recipe makes this"). The column already exists on `ingredients`.

## The subtle problem in Intent 2: precise ingredients vs. the user's mental model
Soupdog defines ingredients PRECISELY, so a user's "chocolate mousse" recipe will
almost certainly produce a TECHNICALLY DIFFERENT mousse than the canonical
"chocolate mousse" ingredient they clicked. So we cannot naively say "this recipe
produces ingredient X."

**Resolution (Rasmus, sound + directly implementable):**
- Push the ingredient's **name** into the new recipe (so it's "chocolate
  mousse"-ish); let it resolve to its OWN precise result-ingredient as normal.
- BUT still **link from the clicked ingredient to the new recipe** — because the
  user clicked mousse, said "add a recipe for this," and on return EXPECTS to see
  their recipe on that ingredient's page. Honor the MENTAL MODEL even when the
  data diverges.
- **Mechanism that makes this clean:** `transformation_recipe_id` is a column ON
  THE INGREDIENT, so linking clicked-ingredient → new-recipe is a direct FK
  update on that ingredient, INDEPENDENT of whatever precise ingredient the
  recipe technically outputs. (Open Q: do we set the clicked ingredient's
  transformation_recipe_id, or hold a looser many "recipes associated with this
  concept" link? The clicked ingredient may already have a transformation recipe.)

## "Can't make it" cases
Some ingredients aren't makeable (a banana — you acquire it, you don't cook it).
Intent 2 should only be OFFERED for plausibly cookable/mixable ingredients.
**Dependency:** this maps onto the recipe `kind` enum from the Plan & End-Product
design (composed / simple / acquire / delivery / none). Banana = "acquire" →
don't offer "make this." Mousse = "composed" → offer it. So Intent 2 done WELL
leans on the kind model, which isn't built yet.

## UX direction (undecided)
Need a user-friendly way to let the user choose intent. Options to explore:
- Two distinct actions on the ingredient page ("Cook with this" vs "Make this").
- A single action that asks/branches based on ingredient kind (hide "Make this"
  for non-makeable kinds).
- For Intent 1: carry the selected ingredient into the new recipe (add to form,
  or show as a chip/button beside the form).
- For Intent 2: pre-fill the recipe name from the ingredient; on save, link the
  clicked ingredient → the new recipe via transformation_recipe_id.

## Dependencies & relationships
- **recipe `kind` enum** (Plan & End-Product v0.2) — gates which intents to offer.
- **Inventory** (future) — Intent 1's richer "what can I make from what I have."
- **Meal plan** — likely the real entry point for Intent 1.
- Existing mechanisms ready to use: `linkedRecipes` (Intent 1 surfacing),
  `ingredients.transformation_recipe_id` + `transformationRecipe` (Intent 2 link).

## Why not built now
The button looked like a small "close the loop" task, but the right behaviour
depends on the two-intents UX decision AND the kind-enum (for "can't make it").
Building a carry-the-ingredient button without resolving these would be premature
debt. Sequence: settle kind enum (Plan rework) → decide intent UX → build.
