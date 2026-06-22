# Soupdog — Nutrition Data Sourcing & Quality Design
**Document:** Soupdog_Nutrition_Data_Sourcing_Design_v0_1
**Status:** Design — not built. Settle §10 open decisions before any schema work.
**Date:** 2026-06-22
**House style:** olive #2E4638 · IBM Plex Serif · numbered sections · `[OPEN]` flags · phased

---

## 1. Purpose

Today every ingredient carries a single flat `nutrition_per_100g` JSONB blob with ~8 macro
keys, produced by an AI (Haiku) estimate. This is fine as a floor but is the wrong shape for
where Soupdog is going:

- It is shallow (no micronutrients, no fatty-acid breakdown, no amino acids).
- It is unsourced (a food-industry customer cannot ask "where did this number come from?").
- It is single-valued (there is no way for a better source to coexist with, and supersede,
  a weaker one).

The long-term ambition is **lab-grade, provenance-tracked nutrition** — eventually including
data Soupdog measures itself (sent to a lab, or, if the business does extremely well, a
Soupdog lab). This document settles how nutrition data should be stored, sourced, graded, and
displayed so that the cheap data we can get *now* and the lab data we may produce *later* live
in the same structure with no rework.

Guiding principle (consistent with prior design work): **build the data layer for lab-grade,
evidence-graded, multi-source nutrition from day one; name the lab pipeline as a seam; do not
build the lab abstraction yet.**

## 2. Reuse the existing evidence ladder — do NOT invent a parallel quality field

Soupdog already has an evidence system, live since Food Model Stage 1:

`evidence_grade` enum = `e0_inferred, e1_literature, e2_expert, e3_tested, e4_validated,
u_user_feedback`, with `evidence_rank()` (higher grade wins).

It was built for Food Model *rules*, but it is exactly the quality vocabulary nutrition needs.
**Nutrition values must ride on this same ladder.** One evidence vocabulary across the whole
platform is far stronger than two, and `evidence_rank()` already encodes supersession.

Nutrition mapping onto the ladder:

| Grade | Nutrition meaning | Example provenance |
|---|---|---|
| `e0_inferred` | AI-estimated (today's blob). The honest floor. | Haiku estimate, 2026-06 |
| `e1_literature` | Published composition tables. | USDA SR Legacy FDC #173410 |
| `e2_expert` | Authority lab-analysed with metadata. | USDA Foundation Foods FDC #748608, n=12 |
| `e3_tested` | **Soupdog tested it.** Sent to a lab, or measured a cooked recipe. | Soupdog assay 2027-03-14, n=5 |
| `e4_validated` | Repeated / cross-validated Soupdog or independent confirmation. | 3 assays + USDA agree |
| `u_user_feedback` | User-supplied correction (lowest trust, flag for review). | user report |

The architecture does **not** change between an AI estimate and a Soupdog lab result — both are
"a value + a grade + provenance." Whether provenance reads "USDA FDC #748608" or "Soupdog Lab,
assay 2027-03-14" is just different metadata on the same shape. A later lab result automatically
outranks USDA, which automatically outranks the AI estimate, via `evidence_rank()` — no
special-casing.

## 3. The structural decision — per-nutrient rows, not one blob

If a single nutrient (say, vitamin C for "ripe tomatoes") can simultaneously have an AI estimate
(e0), a USDA value (e2), and eventually a lab value (e3), then nutrition cannot stay as one
`nutrition_per_100g` JSONB per ingredient. It must become **per-nutrient, multi-source rows**.

Proposed shape (illustrative — exact columns in §10 opens):

```
ingredient_nutrient_value
  id
  ingredient_id        -> ingredients
  nutrient_id          -> nutrient (lookup; see §4)
  amount_per_100g      numeric
  unit                 (g / mg / µg / kcal / IU…)
  evidence_grade       evidence_grade enum
  source_kind          ('ai' | 'usda_foundation' | 'usda_sr_legacy' | 'literature'
                        | 'soupdog_lab' | 'manufacturer' | 'user')
  source_ref           text   (FDC id, DOI, assay id, …)
  sample_count         int    (n, where known — USDA & lab provenance)
  measured_at          date
  retrieved_at         timestamptz
  notes                text
  created_at / created_by
```

Plus a resolved **"current best" view** — `ingredient_nutrition_current` — that, per
(ingredient, nutrient), picks the row with the highest `evidence_rank()` (ties broken by most
recent `measured_at`). This mirrors the Food Model's `target_state_rules_current` view exactly:
the app reads the *current* view; the history of all sources is preserved underneath.

**Migration note:** the existing flat `nutrition_per_100g` blob is decomposed into e0 rows
(one per present key, `source_kind='ai'`). The blob can be kept transiently as a derived cache
of the current view for read performance, but the rows become the source of truth. `[OPEN]`
whether to keep the blob as a cache or drop it (§10).

## 4. Nutrient as a lookup, not free-text keys

Today's keys are ad-hoc strings (`saturated_fat`, `vitamin_c`). For lab-grade breadth (fatty
acids incl. omega-6/omega-3, all vitamins, minerals, amino acids) we need a controlled
`nutrient` lookup table: id, name, category (macro / vitamin / mineral / fatty_acid /
amino_acid / other), unit, display_order, and — critically — a `fdc_nutrient_id` column so USDA
nutrient numbers map cleanly on import. This is the nutrition analogue of the culinary_roles
lookup. Seed it from the USDA nutrient list (≈150 nutrients) so imports are a straight join.

## 5. First real population — USDA FoodData Central (the cheap credible win)

USDA FoodData Central is the right backbone:

- **License: CC0 1.0 (public domain).** Free to ingest, store, and commercialise; only a source
  attribution is requested. Critical for a B2B play — no licence we could lose.
- **Depth:** full nutrient spectrum incl. fatty-acid (omega-6/-3) and amino-acid breakdowns.
- **Provenance:** Foundation Foods carries sample counts, methods, location, date — credible to
  a food-industry customer in a way an AI estimate never is.
- **Access:** bulk JSON/CSV download (no rate limit) for base ingredients; REST API
  (~1,000 req/hr on a free key) for targeted lookups.

Strategy:
- **SR Legacy** = the broad workhorse (≈150 nutrients across many foods) → most ingredients to e1.
- **Foundation Foods** where it exists = better provenance → e2.
- USDA populates **base ingredients** (tomato, olive oil, feta). It will NOT cover branded
  products in Soupdog's markets (US-skewed; Label Insight branded feed stopped Nov 2023). For
  branded/local products, the existing barcode + Open Food Facts + manual path remains; those
  stay e0/e1. So USDA is the **base-ingredient backbone, not a branded source.**

## 6. The hard part is matching, not fetching

Getting the data is easy; mapping *our* ingredient ("Extra virgin olive oil") to the correct
FDC food id is the real work. This is a fuzzy-match + curation problem and follows Soupdog's
standing principle: **system measures & suggests, human names & decides.**

- AI proposes the best FDC match (name + category + role signals) with a confidence.
- A curation surface lets an admin confirm / correct / reject (mirrors the task-curation admin
  view already built for the guide layer).
- On confirm, the full nutrient profile imports as e1/e2 rows with `source_ref = FDC id`.
- Store the chosen `fdc_id` on the ingredient so re-import / refresh is deterministic.

`[OPEN]` whether unmatched ingredients stay e0 (AI) silently or are queued for curation (§10).

## 7. Lab tier (e3/e4) — named seam, NOT built

This is the long-term ambition and the reason the whole layer is evidence-graded from the start.
When Soupdog does well enough to send ingredients/cooked recipes to a lab (or build its own),
lab results enter as `source_kind='soupdog_lab'`, `evidence_grade='e3_tested'` (or `e4_validated`
once repeated/cross-checked), with assay id, sample count, and date as provenance. Because the
schema and `evidence_rank()` already exist, **a lab value slots in with zero schema change and
correctly supersedes USDA and AI.** Nothing about the lab pipeline (sample tracking, assay
ingest, chain-of-custody) is built now — it is named here so the data layer never has to be
reworked to accommodate it. This is the "name the seam, don't build the abstraction" discipline.

A subtle point worth recording: lab testing applies at **two levels** — an *ingredient*
(authoritative composition of, e.g., a specific olive oil) and a *cooked recipe / end-product*
(actual measured nutrition of the finished dish, which differs from the calculated sum because of
cooking losses). The evidence-graded value model serves both: an ingredient-level lab value and a
recipe-level lab value are the same row shape attached to different entities. Recipe-level lab
data would eventually let Soupdog *validate* its retention-factor calculation against reality —
a strong B2B story.

## 8. Display (#14 from the recipe-display list) — comes LAST, and is honest

The "show more nutrients / Omega-6" expansion the user originally asked for is **Phase 3**, not
Phase 1 — there is no point building a richer panel over empty data. Once §3–§6 land:

- Tiered nutrition panel: macros → micros (vitamins, minerals) → fatty acids → amino acids,
  expandable ("More details"), only showing nutrients with a value.
- Each value (or the panel) carries a **source/grade badge** — e.g. "USDA Foundation Foods" or
  "Estimated". This is the honesty layer: the user (and a B2B customer) sees whether a number is
  lab-grade or a guess. The grade is already on every row, so the badge is free.
- Reuse the modal/disclosure pattern (TaskDetailModal / ToolDetailModal) for the expanded view.

Note: this also subsumes the separately-tracked #12 (nutrition → modal) item — the expansion and
the modal are the same surface.

## 9. Phased plan

- **Phase 0 — design sign-off.** Settle §10 opens. (This doc.)
- **Phase 1 — schema.** `nutrient` lookup (seeded from USDA nutrient list, with fdc_nutrient_id);
  `ingredient_nutrient_value` rows; `ingredient_nutrition_current` resolved view; migrate the
  existing blob into e0 rows. RLS/grants per the standing checklist.
- **Phase 2 — USDA ingest + matching.** Bulk-download SR Legacy + Foundation; nutrient-id map;
  AI-suggested FDC match + curation admin surface; import confirmed matches as e1/e2.
- **Phase 3 — display.** Tiered expandable nutrition panel with source/grade badges
  (absorbs #14 and #12).
- **Phase 4 (future, named-only) — lab tier.** e3/e4 ingest for ingredient- and recipe-level
  measured values. Not scoped here.

Phases 1–3 are each a focused session. Phase 1 is spine-level (touches every nutrition read
path) and should land before code that reads richer nutrients.

## 10. [OPEN] decisions — settle before building

1. **[OPEN] Keep the flat `nutrition_per_100g` blob as a read cache of the current view, or drop
   it entirely and have all reads go through the resolved view?** (Perf vs. single-source-of-truth.)
2. **[OPEN] Resolved-view tie-break** beyond `evidence_rank()` — most recent `measured_at`? prefer
   Foundation over SR Legacy at equal grade? per-nutrient overrides?
3. **[OPEN] Unmatched ingredients:** stay silently e0 (AI), or auto-queue for FDC-match curation?
4. **[OPEN] Nutrient lookup scope:** seed all ~150 USDA nutrients now, or a curated core (~30–40)
   first and grow? (Display order + categorisation effort scales with this.)
5. **[OPEN] Units & conversions:** USDA uses mixed units (g/mg/µg/IU); store native unit per row
   and convert at display, or normalise on import? (IU↔µg for vitamins A/D/E is lossy without the
   form — record the open.)
6. **[OPEN] Bulk-download vs API ingest** for the initial population, and refresh cadence (USDA
   updates Foundation/Branded periodically — do we re-pull, and how do we avoid clobbering e3 lab
   rows? Answer: lab rows outrank, so a re-pull only updates e1/e2 — but confirm.)
7. **[OPEN] Recipe-level nutrition provenance:** when nutrition is *calculated* from ingredients +
   retention factors, what grade does the *recipe* total carry? Probably "derived, min of inputs"
   — needs a rule. This ties into the existing coveredPct/confidence display.
8. **[OPEN] Attribution surfacing:** USDA requests source attribution — where does it live
   (per-value badge, a nutrition-sources footnote, an About page)?
9. **[OPEN] Branded/local-market gap:** formalise that branded products in CN/SE-Asia stay
   e0/e1 via OFF/manual — or is there a regional authoritative source worth ingesting later?

## 11. Why this matters for the food-industry ambition

This upgrade moves nutrition from "AI guess in a blob" to "evidence-graded, provenance-tracked,
supersession-ordered, lab-ready." A food-company customer can ask of any number: *what grade, what
source, how many samples, measured when* — and get a real answer. The same structure that holds a
cheap AI estimate today holds a USDA lab analysis tomorrow and a Soupdog assay the day after, with
no rework. That is the data-quality credibility a B2B nutrition play requires, built on the
evidence ladder Soupdog already has.
