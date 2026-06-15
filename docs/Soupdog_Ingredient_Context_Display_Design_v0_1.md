# Soupdog — Ingredient Context-Display Model (v0.1)

**Status:** design note. Captures a model articulated in the 2026-06-14 session.
Not built. Sits on top of existing structure (the ingredient page already renders
in sections); the new idea is choosing *which* sections to show per viewing
context. Reconciles with three existing design docs (see §6).

---

## 1. The one-line idea

An ingredient is a single record with many **sections**. *Different contexts show
different subsets of those sections.* One ingredient, several faces — the same
"one spine, many faces" principle already used for tasks (one `tasks` row feeds
both the AI guide and the public Techniques page).

This is a **presentation** model. It adds no new ingredient data and does not
change the ingredient/recipe spine. It decides visibility, not content.

---

## 2. Why this exists — the variation problem

Every recipe ends with an **end-product**, and that end-product is an ingredient
(Plan & End-Product Model). A Negroni recipe yields a "Negroni" ingredient; a
recipe is the *method of obtaining* that ingredient (and a method can be "buy it
from a delivery service", not only "cook it").

The hazard: the precise-ingredient model means **even a tiny recipe variation
produces a new ingredient**. If every variation surfaced as its own browsable
page / search hit, the catalogue would be unusable — a hundred near-identical
"Negroni" entries.

The resolution (already designed, see §6): a person searching sees the **Concept**
("Negroni"), not the swarm of underlying ingredient variations. The concept is the
public-facing identity; the individual ingredients sit beneath it. Concrete
variation ingredients are addressable but not *browsable* — you reach one only if
you already know its specific id/slug (e.g. arriving from the exact recipe that
produced it).

So there are two orthogonal axes:
- **Identity granularity** — Concept (what you search) vs. ingredient variation
  (what a specific recipe produces). *Handled by the Concept layer.*
- **Section visibility** — which parts of an ingredient render in a given context.
  *This note.*

---

## 3. The sections that exist today

The ingredient detail page (`app/ingredients/[slug]/page.tsx`) already renders
these sections (via the `Section` component + `sec(key)` lookups):

`how-to-use` · `storing` · `variations` · `composition` · `nutrition` ·
`allergies` · `culture` · `diets` · `production` · `history` · `confused-with` ·
`product` — plus the intro region (name, hero image, lead text, taste).

**What does NOT yet exist as a rendered section: the METHOD / recipe.** The data
is already fetched — the ingredient API returns `transformationRecipe`
({ title, slug }) when `ingredients.transformation_recipe_id` is set and the
recipe is published — but the page never renders it. So "this ingredient is made
by this recipe" is wired in the API and invisible in the UI. (Adding that section
is the smallest concrete next step; see §7.)

Note the method is **not always a recipe to cook**. "Method" generalises:
- a composed/simple cooking recipe (the usual case),
- an *acquire* method ("buy from X"),
- a *delivery* method (order it),
- *none* (raw whole ingredient — a lemon has no method).

This mirrors the `recipe.kind` enum discussed in the Plan & End-Product work
(composed / simple / acquire / delivery / none). The method section renders
according to kind.

---

## 4. The three contexts (from the session)

| Context | Where it appears | Sections shown |
|---|---|---|
| **In a recipe** | The end-product / a component, viewed while reading a recipe | name · hero image · nutrition · **method** |
| **Standalone ingredient page** | The full `/ingredients/[slug]` page | everything **except** the method |
| **Inline mention** | An ingredient clicked/hovered inside a recipe's ingredient list | mini image · name · brief description |

Two deliberate asymmetries to preserve:

1. **The recipe context SHOWS the method; the standalone page HIDES it.** Rationale:
   on a recipe you want to know how the end-product is obtained; on the ingredient's
   own reference page the method is either obvious, irrelevant, or belongs to a
   specific variation rather than the concept. (Revisit: a *concept* page might
   show "common methods"; a *variation* page reached by id might show its one
   method. Decide alongside the concept-vs-variation page split.)

2. **The standalone page may be barely reachable at all.** Per the session and the
   concept design: we may not let users freely *browse* or *search* raw ingredient
   pages — you reach one by knowing its specific name/id, or by following a link
   from a recipe/concept. Search lands on the **concept**, not the ingredient. The
   "inline mention" is the most common way an ingredient is seen; the full page is
   the rare deep-link.

The "inline mention" face already exists in code as `IngredientPreviewCard`
(used in the Composition section: mini card with image + name). That component is
the seed of context 3 — reuse it, don't reinvent.

---

## 5. Shape of the eventual implementation (not a build spec)

Likely the lightest thing that works:

- A single source of ingredient data (the existing API), and a **section-set
  selector keyed by context** — an enum `'recipe' | 'standalone' | 'inline'` that
  maps to the list of section keys to render. The page/component passes its
  context; one render path honours it. No data duplication.
- The method becomes a first-class section (`method`), populated from
  `transformationRecipe`, shown in the `recipe` context, hidden in `standalone`.
- `inline` resolves to the existing preview card.

Open until the concept layer is activated:
- Is the thing rendered a **concept** or a specific **ingredient variation**?
  The context-set may differ (a concept shows "methods", plural; a variation shows
  its one method). This note assumes the section *selector* is the same mechanism
  either way — only the populated content differs.

---

## 6. Reconciliation with existing design docs

This note is **not new theory** — it's the presentation layer over three settled
pieces. Do not re-derive those; cite them.

- **Plan & End-Product Model (v0.1):** "a plan entry is one end-product, the
  end-product is an ingredient, a recipe is the method of obtaining it." Establishes
  that recipes produce ingredients and method-kinds (composed/acquire/delivery/none).
  The `ingredients.transformation_recipe_id` link is the realisation.
- **Recipe Model Concept/Fork (v0.2–v0.6) + Reconciliation (v0.1):** the **Concept**
  is a curated, global, many-to-many grouping of ingredients perceived as the same
  thing; it's what search surfaces, not the variation swarm. Reconciliation found
  `food_families` + `food_family_members` IS the concept layer (currently
  underpopulated, not wired to search).
- **Culinary Knowledge Layer (v0.5):** "one spine, two faces" — the principle this
  note extends from tasks to ingredients (one record, context-dependent faces).

---

## 7. GATING / sequencing

Three distinct pieces; only the first is safe to build without touching gated
design:

1. **Render the method section + recipe hero image (presentation only).**
   - Show `transformationRecipe` on the ingredient page (data already fetched).
   - Add a hero image to recipes (new column on `recipe_versions`, render in the
     recipe view / `RecipeDisplay`, wire the existing `ImageUpload`).
   - No spine change. Buildable now. NOTE: the method link only renders where data
     exists, and today **nothing writes `transformation_recipe_id`**, so it will be
     mostly empty until piece 3 lands.

2. **Context-aware section selector (this note).** Presentation abstraction; needs
   the context→section-set mapping in §4 confirmed and the concept-vs-variation
   page question (§5 open) settled. Its own focused build.

3. **Recipe-save writes an end-product ingredient + concept membership + the
   `transformation_recipe_id` link.** ⚠️ GATED. This is the Plan & End-Product
   spine work — do NOT build until that doc's §3 (recipe kinds) and §4
   (merge-vs-bridge) opens are settled AND meals are stable. Building auto-creation
   of end-product ingredients prematurely is exactly the spine change the handover
   warns against. Until this exists, piece 1's method link has little data to show.

**Recommended order:** settle the concept-vs-variation page split → activate/populate
the concept layer (`food_families`) and point search at it → then piece 3 (write the
links) → then piece 2 (context selector) has real data to switch on. Piece 1 (hero
image) is independent and can ship any time.

---

## 8. Smallest honest next step

If a quick visible win is wanted before the gated work: **recipe hero image** (fully
independent) and **render the already-fetched `transformationRecipe` link** on the
ingredient page (one file; renders for any ingredient that happens to be linked).
Neither touches the spine. Everything else waits on the concept/end-product decisions
above.
