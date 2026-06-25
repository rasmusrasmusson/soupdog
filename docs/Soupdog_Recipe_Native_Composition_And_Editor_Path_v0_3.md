# Soupdog — Recipe-Native Composition & the Editor Path (Dish·Schedule·Start addendum) v0.3

**Status:** design-first · pre-build. Extends `Soupdog_Dish_Schedule_Start_Model_v0_2.md`
with the composition feature ("add existing recipes to a recipe"), its two creation
entry points, and the editor dependency — grounded in a 2026-06-26 code read.
**Spine-adjacent:** the composition STORAGE and the editor are real builds; the
`meal`→instance RENAME stays deferred (named debt, §5).

---

## 1. The capability

Let a recipe **compose other recipes** (dishes / drinks) as inputs. This is the
user-facing form of Dish·Schedule·Start §2's resolution: *"merging dishes into a
meal" is the same operation as "adding ingredients to a recipe", one composition
level up.* Building this **heals** the original wrong decision (meal-as-separate-
object); it does not perpetuate it. Composition moves onto the recipe, where it
belongs.

---

## 2. "Meal" is dead as a backend TYPE, alive as a UI WORD

The key distinction settled this session:

- **Backend:** one object — a recipe (a dish producing one end-product) that may
  take other recipes as inputs. No separate meal type. An *instance* (timestamp +
  people) is the only other thing, and it's thin (§4 of v0.2).
- **UI:** "meal" survives as a *word and an affordance*, because that's how people
  think ("dinner = pasta + salad + wine"). A "meal" in the UI is simply a **composed
  recipe** whose inputs are dishes/drinks.

So a button **"Make this into a meal"** on a recipe = "start a new composed recipe
with this dish as its first input." The label speaks the user's language; the
backend does recipe-native composition. We do NOT purge the word from the UI — we
purge the separate backend object. This resolves the tension between conceptual
correctness and user intuition: the word lives up top, the correct model underneath.

---

## 3. Two creation entry points (same backend operation)

Both reach the *same* recipe-native composition; they differ only in where the user
starts.

1. **Import / AI-create flow** (`/my/recipes/import`). Today this parses + decomposes
   pasted/uploaded text into a DAG (decompose-save). Composition here is
   **conversational**: "add a salad and a glass of wine to this," and the AI composes
   the additional dishes in. NOTE: "import" is now a slightly poor name — the user
   also asks AI to *make* a recipe here — but end users won't trip on it; not worth
   renaming now.

2. **Start-from-an-existing-dish** ("on Pasta Carbonara → **Make this into a meal**").
   Composition starts from an existing recipe and adds more dishes — manually or via
   AI. Entered from the recipe page. `[OPEN 3a]` exact UX of "I want to make this
   into a meal" — does it fork a new composed recipe referencing the original, or
   mutate in place? Likely fork (the original dish stays a dish; the new composed
   recipe references it).

Both are one operation (compose recipes → a composed recipe), reached two ways. So
the composition capability must live where BOTH surfaces can use it — not bolted
into one editor.

---

## 4. The editor reality (verified in code, 2026-06-26) — why this gates the feature

Composition needs (a) a place to STORE "recipe references recipe as input" and (b) a
SURFACE to create it. Both are currently problematic:

**Storage — two mechanisms, neither the right home yet:**
- `meal_component` — the OLD meal-as-composition object (read by 7 files incl.
  `meal-merge.ts` and the cooking session). This is what §2 of v0.2 retires.
- `version_sub_recipes` — the INTENDED recipe-native home, but **deferred/unbuilt**:
  decompose-save's own header says *"groups → child canonicals is Option B,
  deferred."* It's referenced in types but not populated.
  → **Decision needed:** build `version_sub_recipes` (or equivalent) as the
  recipe-native dish-as-input edge. This is the `[OPEN 3a]` from v0.2 §3.

**Surface — the old structured editor is NOT usable for this:**
- The old editor (`/my/recipes/[id]/edit`, `/new`) writes task data to
  `appliance_settings.taskId`. decompose-save writes the REAL `version_steps.task_id`
  FK. Different locations.
- A **409 guard** (`structured_recipe_readonly`) refuses PUT on any recipe with a
  real `task_id`, because round-tripping through the old editor *strips task_id and
  ingredients* (it corrupted Tarte flambée v2–v4). So structured recipes — i.e.
  every decompose-imported recipe — are **read-only in the old editor**.
- Therefore "add a dish" CANNOT be built on the old editor without extending the
  very code we're retiring, and it would corrupt structured recipes.

**Consequence:** the import/AI flow is the *better* surface today — it already writes
the correct structured model. The structured editor's real fix is the **DAG-native
editor** (already queued as the unblock for the ~27 read-only recipes). Composition
is a capability that editor should provide.

---

## 5. Corrected build sequence

The dependency chain, grounded in §4:

0. **(now, independent)** small recipe-page display fixes (verb-only underline;
   suppress redundant "→" notes). Unrelated to composition.

1. **Composition storage** — build `version_sub_recipes` (or the chosen edge) as the
   recipe-native "dish-as-input" relation. Settles v0.2 `[OPEN 3a]`. Prerequisite
   for everything below.

2. **Composition via the import/AI flow** — "add a dish/drink" conversationally in
   `/my/recipes/import` (decompose-save already writes the structured model). Likely
   the **highest-value first surface**, since import/AI is the more common creation
   path than the structured editor.

3. **DAG-native editor** — replaces the `appliance_settings`-based editor; unblocks
   the ~27 read-only recipes AND becomes the manual surface for adding dishes/inputs.
   "Make this into a meal" (§3 entry point 2) rides here or on the import flow.

4. **Start-from-recipe** (separate thread) — mint a lightweight instance, reuse the
   cook path (Dish·Schedule·Start §5.2). Independent of composition; can interleave.

5. **DEFERRED, NAMED DEBT — retire `meal_component` / rename instance.** The started
   instance stays internally called `meal` for now. This is **legacy naming, not a
   structural separation** — the bad decision (separating meal from dish) is healed
   by §1–3; the surviving "meal" label on the instance is a contained, reversible
   cosmetic debt. Retire `meal_component` and align names in a dedicated spine
   session (v0.2 already flags this as spine-level, no-live-refactor-without-a-
   session). Do NOT let this block §1–4.

**Principle:** §1–4 deliver everything the user asked for (compose dishes; cook them)
WITHOUT §5. Carrying the "meal" name in the backend instance is named debt, not a
perpetuated wrong structure.

---

## 6. [OPEN] decisions to settle before building §1–3
- `[OPEN 3a]` storage edge: `version_sub_recipes` vs a dedicated dish-as-input table;
  how a composed recipe references sub-dishes (reuse sub-recipe machinery vs new edge).
- `[OPEN 3b]` "Make this into a meal": fork a new composed recipe referencing the
  original dish (lean) vs mutate in place.
- `[OPEN 3c]` composition in the AI flow: how the decompose prompt represents
  "add dish X" — as a sub-recipe find-or-create (it already matches sub-recipes/
  intermediates) vs an explicit composition instruction.
- `[OPEN 3d]` does §2 (composition) precede or follow the DAG-native editor? Lean:
  storage (§1) + AI-flow composition (§2) first; DAG-native editor (§3) folds in the
  manual surface + the read-only unblock together.
