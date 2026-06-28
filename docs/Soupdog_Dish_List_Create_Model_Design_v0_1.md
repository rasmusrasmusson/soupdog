# Soupdog — Dish-List Create Model Design v0.1

**Status:** design-settled, pre-build. The STRUCTURAL SPINE of the create flow. The
create page is restructured around "assemble a LIST OF DISHES into one meal." The
two-section IA (Describe / Upload), "Add another dish", who's-eating, and the
meta-review screen all ATTACH to this model — so building it first means they attach
in their final form (no rebuilds). 

**Relationship to other docs (no collision):**
- Extends `Soupdog_Create_Recipe_Front_Door_Design_v0_1` (the IA + slices + 1a spec).
  That doc named the pieces; THIS doc defines the underlying data model they hang off.
- Builds on the proven multi-dish backend (engine → save → display) and Slice-1
  assembly (`Soupdog_Multi_Dish_Recipes_Consolidation_v0_1` §9–11). Backend unchanged.

**Build principle (Rasmus, this session):** make choices that don't require later
rebuilds; if a piece's correctness depends on a neighbour, build the neighbour now.
It all ships before public release anyway — optimise build-ORDER for minimal rework,
not per-session size.

---

## 1. Why a dish-list is the spine (not the two-section layout)

Today the page is "one input → one recipe": paste/upload/prompt produces a single
preview. Multi-dish was grafted on (the `meal` branch assembles behind the scenes).
But the TRUE model of the create flow is:

> **A meal is a LIST OF DISHES.** Each dish enters the list some way (described,
> uploaded, or added), each resolves to LINK (existing) or MAKE (new), and the list
> composes into ONE meal (n=1 dish = a single-dish recipe; n>1 = a meal).

Once the page holds a *dish list* as its core state, everything else attaches cleanly:
- **Two-section IA (Describe / Upload)** = ways a dish ENTERS the list.
- **"Add another dish"** = add an entry to the list.
- **Who's-eating** = a property of the MEAL (the list as a whole), set once.
- **Meta-review** = describes the MEAL (composed from the list).

Building "two sections" first would be building an *input* to a model that doesn't
exist yet. Build the model first; the inputs and the review attach to it correctly.

---

## 2. The model — page state

The create page's core state becomes a **dish list** + meal-level properties:

```
CreateState {
  dishes: DishEntry[]          // the list being assembled
  whoseEating: ...             // meal-level (see §6 / who's-eating doc) — generic-persona default
  // meal-level meta (title/description/cuisine/tags) are DERIVED/REVIEWED, not entered (§5)
}

DishEntry {
  id: string                   // local list id
  source: 'describe' | 'upload' | 'added'   // how it entered
  rawInput?: string | File     // what the user gave (text / file), for make-dishes
  name?: string                // resolved/typed dish name
  resolution?:                 // filled after the resolve step
    | { status: 'linked', canonicalSlug, canonicalId, title, otherMatchCount }
    | { status: 'make',   recipeText? }    // generated/parsed content for the inline dish
    | { status: 'served', kind: 'none'|'acquire' }   // beer/wine/bought — §7, SEAM
  state: 'pending' | 'resolving' | 'resolved' | 'error'
}
```

Key: the page goes from a single `preview` to a **list of dish entries** that compose
into a preview. The existing `preview`/`dag` is the COMPOSED OUTPUT of the list, not
the primary state.

---

## 3. How dishes ENTER the list (the two-section IA)

Two entry surfaces, both append to `dishes[]`:

1. **Describe** — free text. May name ONE dish ("a carbonara") or SEVERAL
   ("carbonara, a green salad, and iced tea"). The existing `/api/recipes/generate`
   `meal` action already splits multi-dish requests into dish names → each becomes a
   DishEntry. A single-dish describe → one entry.
2. **Upload** — ONE unified box (image / text / file). Parses to a dish → one entry.
   (A multi-dish document is an edge case; v1 treats an upload as one dish unless the
   parser clearly returns multiple groups — then multiple entries. [OPEN])

Plus **[+ Add another dish]** — appends an empty entry the user fills (describe or
upload that one). This is how a meal is built incrementally, and why NO "is this a
meal?" toggle is ever needed — the list length IS the answer.

---

## 4. How each dish RESOLVES (link / make / served)

Per the standing principle — reuse decided by SEARCH + USER, not silently by AI — each
entry resolves against the user's catalogue (reusing the proven `meal`-action logic):
- **single clear match** → `linked`
- **multiple matches** → `linked` to best for now; the PICKER is Slice 2 (`otherMatchCount`
  is the hook) — see front-door doc.
- **no match** → `make` (generate text if described-only; or the uploaded/parsed text)
- **served-not-made** (beer/wine/bought) → `served` — §7, SEAM (recipe.kind).

Resolution is per-entry and can show inline status in the list ("linked ✓" / "making…").

---

## 5. How the list COMPOSES into one meal (reuses proven backend)

Unchanged from the proven Slice-1 assembly, just driven by the list:
- `make` entries → their text combined → parsed → multi-group extraction.
- `linked` entries → `resolvedDishes`.
- decompose(extraction, resolvedDishes) → one meal DAG (or pure-link DAG if all linked).
- decompose-save persists it (meal-aware; pure-link supported).

**Meal-level meta is DERIVED/REVIEWED, not entered (the §2 reframe):**
- **Title** = menu-style from dish names (built; "A with B"). Editable.
- **Description** = composed (for a pure-link meal, "A meal of X and Y"; for made,
  from parse). System-owned; editable.
- **Cuisine / difficulty / tags** = from parse where available; for a pure-composition
  these are AMBIGUOUS — keep optional/unobtrusive, do NOT demand input. (This is the
  #2 "system populates / review-not-form" piece, now attaching to the list model.)

---

## 6. Who's-eating attaches to the MEAL (not per dish)

Per `Soupdog_Create_Recipe_Front_Door_Design_v0_1` §10: who's-eating is a meal-level
property set on the INPUT side (it should shape what's made). **DEFAULT = generic
personas** (the common content-creator case is a generic recipe first; specific
people/sizes are later VARIATIONS via execution_variants). Personas easily accessible,
never mandatory. SHALLOW: sets the meal's servings. DEEP (shapes generated quantities/
portions via the demand model) = NAMED SEAM, not now. This attaches to the meal in §2's
state and is built as its own focused piece ON the dish-list spine.

---

## 7. Served-not-made dishes (beer/wine/bought) — SEAM

From live testing (front-door doc §11): "beer" got an awkward generated stub. Some
dishes are SERVED, not MADE. In the dish-list model these are a `served` resolution
(`kind: none|acquire`) — represented as a meal component with no method, NOT pushed
through recipe generation. Downstream of wiring `recipe.kind`; SEAM. The dish-list
model RESERVES the `served` resolution status so adding it later is not a rebuild.

---

## 8. Build sequence (rework-minimising)

1. **Dish-list spine** — restructure the page state to `dishes: DishEntry[]`; the
   existing describe→meal and upload→single flows become "append + resolve an entry";
   the composed preview is derived from the list. (The biggest structural step.)
2. **Two-section IA + [+ Add another dish]** — the entry surfaces onto the list.
3. **Who's-eating (#4)** — attach meal-level, generic-persona default, sets servings.
4. **Meta-review (#2)** — present derived/system meta as review-not-form on the list's
   composed preview.
5. **Served-not-made (#7)** — when recipe.kind lands; reserved status already in model.

Each step attaches to the spine in its FINAL place — no rebuilds.

---

## 9. [OPEN] decisions to settle while building the spine

1. Does an UPLOAD ever produce multiple dish entries (a multi-dish document), or is an
   upload always one dish in v1? (Lean: one dish unless the parser clearly returns
   multiple groups.)
2. Resolution timing: resolve each entry as it's added (incremental), or all at once on
   "compose"? (Lean: as-added, so the list shows linked/make status live.)
3. Editing an entry after it's resolved (change a dish, remove one) — list CRUD. Needed
   for "Add another dish" to feel real. Scope for the spine build.
4. Where the composed preview lives relative to the list (below it? a step after?) —
   presentation, settle during build.
5. Single-dish (n=1): does it still show the dish-list UI (a list of one), or collapse
   to the simple single-recipe preview? (Lean: one flow — a list of one — so there's no
   separate code path, per "a meal is just the n≥1 case".)

None are spine-level blockers; settle inline during the spine build.

---

## 10. What does NOT change

The proven backend: `/api/recipes/generate` (meal action), `/api/recipes/import`
(parse), `/api/recipes/decompose` (+resolvedDishes), `/api/recipes/decompose-save`
(meal-aware, pure-link), `RecipeDisplay` + `dagToRecipe` (shows linked dishes). The
dish-list model is a CLIENT-SIDE restructure of the create page that drives these
unchanged endpoints. No schema, no API changes for the spine.

---

## 11. SPINE INCREMENT 1 — the concrete first build (next session opens here)

Banked pre-build (design ready; the spine is the highest-stakes client refactor, so it
gets fresh focus). Grounded in a trace of the current page state (`src/app/my/recipes/
import/page.tsx`):

Current state today (the things the refactor touches):
- `text` / `manualTitle` / `uploadFile` — single-input fields.
- `status` ('idle'|'loading'|'decomposing'|'done'|'error'), `error`, `preview` (the
  single composed output), `sourceExtraction`.
- `genPrompt` / `genLoading` / `genClarify` / `genExisting` — the describe/butler flow.
- Handlers: `handleImportFile` (text/file → parse → decompose → preview),
  `handleGenerate` (prompt → generate → clarify/existing/generate/meal), `handleCreateMeal`
  (meal assembly → preview), `handleSave`.

### Increment 1 = minimal VIABLE dish-list (the spine made visible). Build ADDITIVELY —
preserve the proven single-dish/upload/meal paths underneath; route through the list.
1. Add `dishes: DishEntry[]` state (the §2 model).
2. Dish-list UI: render entries with status (empty entry = a Describe box; resolved =
   "linked ✓ / making…" + remove button).
3. `[+ Add another dish]` appends an empty entry.
4. Refactor `handleGenerate`/`handleCreateMeal` so a multi-dish describe POPULATES the
   list (each dish → an entry) instead of going straight to compose.
5. A "Compose meal" action: resolved list → existing assembly (decompose → preview).
   Preview stays as-is (RecipeDisplay) for now.
6. Keep single-dish/upload working: n=1 flows through the list as a list-of-one (settle
   §9 #5 — lean: one flow, no separate path).

### Verification (how to know increment 1 works)
- Describe "carbonara, green salad, iced tea" → THREE entries appear in the list, each
  showing linked/make status. Add-another-dish appends a 4th empty entry. Compose →
  the same proven meal preview. Existing single-dish describe + upload still produce a
  correct preview. No regression to save.

### Then (later increments, attach to the spine in final form)
2 = two-section IA (Describe / unified Upload) as entry surfaces · 3 = who's-eating (#4,
generic-persona default, meal-level) · 4 = meta-review (#2, system-populated, review-not-
form) · 5 = served-not-made (#7, when recipe.kind lands; `served` status already reserved).

### Risk note
Largest client refactor of the feature; everything attaches to it. Build additively,
verify each proven path still works (describe-single, upload, describe-meal, pure-link,
save) BEFORE adding list-only behaviour. Trace the current handlers first.

---

## 12. Findings from spine 1a + existing-match testing (BANKED, settle later)

### 12.1 Existing-match summary — SHIPPED
`generate` now returns `description` + `isMeal` per existing match; the import page shows
a MEAL tag + description summary + view-live link under each match (the "you already made
it, here's what it is" moment). Proven live. Done.

### 12.2 [OPEN] Existing-match ordering / coexist — now concretely motivated
Describing a meal you ALREADY SAVED ("aglio e olio + green salad") returns FOUR matches:
the exact combined meal, its two components, AND a variant. Two problems:
- **Noise:** showing the components alongside the actual whole-meal match is confusing —
  the combined meal is the real match; its parts are not what the user asked to "already
  have". Filter: when a whole-meal match exists, prefer it; suppress its component dishes
  from the "you already have" list (or rank the meal first and de-emphasise parts).
- **Coexist/ordering:** when the whole meal exists, should it BLOCK the dish-list path, or
  OFFER BOTH ("view existing — or build a new version")? Currently `existing` wins and
  short-circuits before meal-detection, so the dish-list flow is unreachable for already-
  saved combos. For the dish-list to be the primary create path, decide: meal-detection
  before whole-meal-existing? or an explicit "build new version" that enters the dish list?
→ This is a `generate`-flow refinement (NOT spine work). Settle deliberately; don't patch
reactively. The dish-list spine doesn't depend on it.

### 12.3 Test-data hygiene — Green Salad mislabeled as MEAL
A single-dish "Green Salad" shows `composition_level='meal'` (the MEAL tag rendered for it).
Display is faithful; the DATA is wrong — likely a stale test artifact from pure-link save
testing (save sets composition_level='meal' when linkedDishes>0 || terminalCount>1). Plus
accumulated test meals/drafts generally. Cleanup pass (data, not code): audit
composition_level on single dishes; prune test drafts. Not a code fault in 1a.

---

## 13. ROOT-CAUSE FIX — the MEAL action was never wired (+ data hygiene)

### 13.1 The bug: multi-dish was unreachable
Investigation (triggered by "where do I add another dish?" → a single-katsu preview kept
appearing) found that `generate`'s system prompt defined only THREE actions
(clarify/existing/generate) and the route had NO `meal` branch. The create page consumes
`data.meal.dishes`, but `generate` never produced it — so the dish-list path was
UNREACHABLE. Multi-dish "worked" earlier only by luck (the model occasionally volunteering
meal-shaped output the route ignored), which is why it was non-deterministic.

### 13.2 Fix (one file: generate/route.ts)
- **Prompt:** added a 4th action **MEAL** with explicit multi-dish detection ("a dinner
  with X and a Y" = two dishes; "chicken katsu and a green salad" = two dishes; a single
  dish merely listing ingredients = one dish). Rule: if >1 dish, use MEAL, never collapse
  into one GENERATE.
- **Route:** added a `meal` branch that resolves each named dish against the catalogue
  (dishes only, never meals): exact title > published > first → LINK (with canonicalId/
  slug/title + otherMatchCount); no match → MAKE. Returns `{ meal: { dishes } }` — the
  shape the dish-list UI already consumes. Verified live: the dish list now appears with
  link/make status + Add-another-dish + Compose.

### 13.3 Data hygiene done (was breaking resolution)
The §12.3 Green Salad mislabel turned out to be LOAD-BEARING: the meal-resolution filter
excludes `composition_level='meal'`, so a single dish wrongly tagged 'meal' would never
LINK (showed "will be made" even though the user had it). Fixed:
- **Green Salad** (`fa9b38d1-...`) → composition_level 'dish' (+ removed 1 stale
  version_sub_recipes row). Now links correctly.
- **"Carbonara Sunday dinner"** (`7eebd68c-...`) — empty test shell (0 steps/ingredients/
  linked) → DELETED via FK-safe teardown.
- Only genuine meal left tagged 'meal': "Spaghetti Aglio e Olio with Green Salad". Clean.

### 13.4 Teardown template correction (recurring trap)
`execution_variants` does NOT have a `canonical_id` column — it references the recipe by a
DIFFERENT column (likely `recipe_canonical_id` or `recipe_id`; confirm before use). The
standard teardown's `delete from execution_variants where canonical_id = ...` FAILS with
42703. For empty shells it's skippable (no variants). Fix the column name in the teardown
template before relying on it for a recipe that HAS variants.
Also: the Supabase SQL editor errors (42601 "syntax error at end of input") on some
multi-statement blocks — run teardown statements ONE AT A TIME.
