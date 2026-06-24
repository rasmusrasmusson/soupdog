# Soupdog — Nutrient Pages Design v0.1

**Status:** design, not built. Light doc — the *content* decisions were largely settled
in the atomic-decomposition session (the four educational-content types + guardrails);
this doc adds the *mechanics* Rasmus asked for: the modal + link-to-full-page pattern
(like ingredients/tools), the route/page structure, and the data-graph queries.

**House style:** olive #2E4638, IBM Plex Serif. `[OPEN]` flags before any code.

---

## 1. Purpose & fit

Make the nutrition data Soupdog now holds **educational and navigable**, not just a
display panel. Every nutrient shown in a nutrition panel (recipe page, ingredient page)
becomes a **link**: tap "Vitamin E" → a quick **modal** (what it is + your daily %) with
"Learn more →" to a full **`/nutrients/[slug]`** page. Mirrors the existing
ingredient/tool/technique link-and-page pattern exactly.

**Why nutrients first** (decided previously): highest reader value, cleanest fit (the
data already exists — `nutrient` table + `ingredient_nutrition_current` view + demand-
model nutrient targets), lowest health-safety sensitivity of the educational types.
The flagship of the educational-content area.

**"One spine, two faces" — same pattern as Techniques.** The `nutrient` table already
feeds the *calculation* layer (recipe/ingredient nutrition). The same rows now also
render as *public pages*. One curated data source, two surfaces (the AI/calc face and
the human-reading face) — exactly the Techniques (`tasks`) precedent.

**Secondary purpose — the meal-planning explainer.** Nutrient (and later allergy/diet)
pages are the natural place to explain WHY the planner hit a target or flagged a gap —
closing the loop between the demand model's reasoning and the reader, the way a technique
page explains the decomposition.

---

## 2. The four educational-content types (carried from the decomposition session)

This doc builds type 1 (Nutrients). The other three are noted so the route namespace and
shared patterns are designed with them in mind — NOT built now.

1. **Nutrients — THIS DOC.** Page per nutrient: what it does / how much you need / what
   it's in / too much–too little / data graphs. Lowest sensitivity. Build first.
2. **Allergies — later, GUARDRAILS.** Page per allergen (EU-14 we hold + others).
   Informational, NOT advisory — explain, don't give medical guidance/dosing/"safe-for-
   you" assurances. Strong cross-linking (allergen → ingredients containing it).
3. **Religious / ethical (Halal, Kosher, …) — later, HIGHEST curation bar.** Descriptive,
   respectful, attribute variation ("some authorities hold X, others Y"), human-reviewed
   before live. Ties to `is_halal`/`is_kosher` flags.
4. **Diets (keto/paleo/Med/vegan) — later, LOWEST priority.** Descriptive only; never
   rank/recommend; no health claims; no weight-loss framing.

**Cross-cutting rule (all four, stricter than cooking content):**
INFORMATIONAL / EDUCATIONAL, never medical advice or prescriptive. Clear framing;
"consult a professional" where someone might ACT on it. Nutrients are the gentlest but
the rule still applies (e.g. sodium, vitamin A toxicity) — explain ranges, don't prescribe.

---

## 3. Route & page structure

- **`/nutrients`** — index. Grouped by category (Macros / Vitamins / Minerals / Fats &
  fatty acids / Amino acids / Other), human-labelled, with a search box + category filter
  buttons (derive from categories present — the Techniques/Ingredients pattern). Each
  nutrient links to its detail page. Doubles as a curation overview (draft vs published
  badge).
- **`/nutrients/[slug]`** — detail page. Sections:
  1. **What it is / what it does** (prose).
  2. **How much you need** — daily reference + (if logged in) "your target" from the
     demand model's `person_nutrient_targets`. Honest about ranges & that needs vary.
  3. **Found in** — DATA GRAPH: ingredients richest in this nutrient (live query, §5).
  4. **Too little / too much** — deficiency & excess, framed as information not advice.
  5. **Tips / common confusions** (optional, like Techniques' tips/mistakes).
  6. Unit, category, aliases.
- **`/nutrients/[slug]/edit`** — admin edit form (bless/edit AI-drafted content), fixed
  bottom save bar, admin-gated (ACCOUNT id, not person id — the recurring trap). Mirrors
  `/techniques/[slug]/edit`.

`slug` derives from `nutrient.key` (or a dedicated `nutrient.slug`) — **[OPEN] 4a**.

---

## 4. The modal + linking pattern (what Rasmus asked for)

### 4.1 Linking surface
Every nutrient row in a nutrition panel becomes a link to the nutrient. The panels
already iterate `nutrientMeta` (key/name/category/unit), so each row can carry
`/nutrients/<slug>`. Surfaces to update:
- `src/components/recipe/RecipeDisplay.tsx` (recipe nutrition panel)
- `src/app/ingredients/[slug]/page.tsx` (ingredient nutrition panel)
- (later) the demand-model "for your table" panel — link the named nutrients.

Headline macros (calories/protein/…) AND detailed micronutrients all become linkable.
The omega rollup rows ("Omega-6 (total)") link to a rollup concept page or the parent
fatty-acid group — **[OPEN] 4b** (do rollups get their own page, or link to the most
representative isomer / a "fatty acids" overview?).

### 4.2 The modal (quick info)
Tapping a nutrient name opens a lightweight modal — NOT a full navigation — showing:
- name + one-line "what it is",
- (if logged in) "X% of your daily target" for THIS context (this serving / this 100g),
- unit & category,
- **"Learn more →"** → full `/nutrients/[slug]` page.

This is the ingredient/tool quick-look pattern. **[OPEN] 4c:** is there an existing
reusable modal component (ingredient/tool quick-look) to extend, or is each currently a
full-page link with no modal? If no modal exists yet, decide: build a shared
`<QuickInfoModal>` (reusable for ingredients/tools/nutrients) vs nutrient-specific now,
generalise later. Recommendation: build it nutrient-shaped but with a generic enough
prop shape that ingredients/tools can adopt it (don't over-engineer, but don't preclude).

### 4.3 Context-awareness (the nice bit)
The modal's "% of your daily target" makes the panel *educational in context* — not just
"Vitamin E 25.63mg" but "Vitamin E 25.63mg — 171% of your daily target." This needs:
- the demand-model target for that nutrient for the logged-in person (`person_nutrient_
  targets` / the resolve-requirement cascade), and
- the amount in the current context (serving or 100g).
Logged-out: show the generic daily reference instead of "your target." Degrades cleanly
(the demand model's persona floor already gives a reference when nothing's known).

---

## 5. Data graphs (Soupdog's unique value — generated from our data)

These are the reason a Soupdog nutrient page beats a generic web article: the graphs are
live queries over our own ingredient data.

- **"Ingredients richest in this nutrient"** — rank ingredients by the nutrient's value in
  `ingredient_nutrition_current` for `nutrient_key = X`, top N, link each to its ingredient
  page. (Respect is_product/is_category — show real foods.) Caveat honestly: ranked over
  *matched* ingredients (~205), not a universal database.
- **"% of daily target in a typical serving"** — needs a serving size per ingredient AND
  the daily target. Serving size is **[OPEN] 5a** (do we store per-ingredient serving
  sizes? If not, 100g is the honest fallback, labelled as such).
- (later) **"this nutrient across a recipe"** — already computable from the recipe
  nutrition route; a nutrient page could show example recipes high in it.

Graphs render with the existing chart approach (the recipe/ingredient panels already
render data; reuse). Keep them calm and small — no dashboard clutter, the cookbook
aesthetic.

---

## 6. Content: generation, storage, guardrails

### 6.1 Storage — [OPEN] 6a
Where does per-nutrient prose live?
- **Option A:** content columns on `nutrient` (`description`, `function`, `deficiency`,
  `excess`, `tips`, `published` bool, `content_reviewed` bool). Simple; mirrors how
  `tasks` carries its content. Recommended for v1.
- **Option B:** a separate `nutrient_content` table (versioned, multi-locale-ready).
  More than needed now; the i18n future might want it eventually.
Lean A; note B as the migration path if locale/versioning is wanted later.

### 6.2 Generation
AI drafts a first pass per nutrient (function / how much / found in / too much-too little
/ tips), `published=false`, `content_reviewed=false`. Human blesses via the edit page
before it goes live (same flywheel as task curation). The "found in" *prose* should defer
to the live data graph rather than hard-coding ingredient lists (data stays fresh).

### 6.3 Guardrails (the standing rule)
- Informational, never medical advice/dosing/prescription.
- State ranges and that needs vary (age/sex/activity/pregnancy/conditions).
- "Consult a professional" framing where someone might act (deficiency/excess sections,
  anything toxicity-adjacent: sodium, vitamin A, iron, selenium).
- Cite reference frameworks generically (e.g. "official dietary references") rather than
  inventing precise authority claims; human review confirms.
- No "good/bad nutrient" moralising; no weight-loss framing.

---

## 7. [OPEN] decisions to settle before building
- **4a** slug source: derive from `nutrient.key` vs add `nutrient.slug`.
- **4b** omega rollups & grouped pseudo-rows: own page vs link to group overview vs
  representative isomer.
- **4c** modal: extend an existing ingredient/tool quick-look modal vs build a shared
  `<QuickInfoModal>` vs nutrient-specific. (Confirm whether a quick-look modal exists at
  all today, or if ingredients/tools currently link straight to full pages.)
- **5a** serving sizes: do we store per-ingredient servings? If not, 100g fallback
  (labelled) for the "% of target in a serving" graph.
- **6a** content storage: columns on `nutrient` (lean) vs `nutrient_content` table.
- **scope** which nutrients get pages: all 71, or the consumer-meaningful subset first
  (macros + common vitamins/minerals + omega rollups), leaving the 18 amino acids +
  obscure fatty-acid isomers for the Effort-2 protein-quality feature / later? Lean:
  start with the consumer subset; amino acids ride the future protein-quality feature.

---

## 8. Build sequence (when settled — non-spine, additive, satisfying)
1. Storage (6a) + AI-draft content for the consumer-subset nutrients; admin edit page.
2. `/nutrients` index + `/nutrients/[slug]` detail (prose sections), admin-gated edit.
3. "Ingredients richest in this nutrient" data graph (the unique-value bit).
4. Make nutrient names linkable in RecipeDisplay + ingredient panel.
5. The quick-info modal (4c) with context-aware "% of your daily target."
6. (later) "% of target in a serving" graph (needs 5a); allergy pages (type 2, guardrails);
   then religious/ethical (type 3, human-reviewed); diets (type 4) last.

**Effort:** medium, NON-spine, additive (new route + modal + linkifying existing panels +
content). Does NOT touch the recipe/ingredient/person spine — unlike the concepts/variants
work, this can be built without settling foundational questions. Good "make today's
nutrition work visible & educational" follow-on.

---

## 9. Relationship to other work
- **Concepts/variants** (the other open nutrition design): a nutrient page is per-nutrient,
  orthogonal to ingredient concepts — no dependency. Build either order.
- **Demand model** (`person_nutrient_targets`, resolve-requirement cascade): supplies the
  "your daily target" / "% of target" numbers. Already exists (Phase 0/1).
- **Techniques pages**: the structural template (index + detail + admin edit + "one spine
  two faces"). Copy the shape.
- **Effort-2 protein-quality feature**: the natural home for amino-acid pages + complete-
  protein content; nutrient pages for the 18 AAs can wait for it.
