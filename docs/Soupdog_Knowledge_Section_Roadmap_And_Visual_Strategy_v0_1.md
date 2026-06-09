# Soupdog — Knowledge Section: Build Roadmap, Content Model & Visual Strategy — Design v0.1

**Status:** DESIGN (not built). 2026-06-07. Captures an extended design exploration of the
public-facing KNOWLEDGE SECTION — the Techniques, Tools, and Ingredients pages — covering
build sequence, content model per type, the reader/AI "two registers" idea, the visual
strategy (illustration vs photo vs data-graph), AI-production guidance, and principles.
Sits alongside (does NOT supersede) the Culinary Knowledge Layer doc (v0.5), which covers
the AI-guide side and the underlying schema. This doc is the READER-FACING + production
side. Nothing here is built; Techniques list/detail + curation admin view already shipped
(see handover) — this extends them.

---

## 1. The frame: one knowledge spine, multiple faces

Tasks (`tasks`), tools (`equipment`), and ingredients (`ingredients`) are one curated body
of culinary knowledge. It already has faces; this doc adds/sharpens them:
- **AI guide** — feeds decomposition (shipped for tasks).
- **Reader pages** — browse/learn (Techniques shipped; Tools + Ingredients pending).
- **Data-driven visuals** — graphs generated FROM the structured fields (new insight; see §5).
Curating one entry improves all faces. The schema already holds the right fields
(populate-and-expose, not new structure).

---

## 2. Build sequence (revised — Tools is now a PREREQUISITE)

Key realisation: **tasks reference tools** (`suggested_tool_slugs`, ingredient×tool→task
interactions). You can't properly curate tasks if you can't add/edit the tools they cite.
So Tools admin comes BEFORE the big task-content pass, not after.

1. **Tools section (add/edit/browse)** — nearly free: mirror the Techniques pages onto
   `equipment` (list + detail + admin edit form, same pattern just shipped for tasks).
   Unblocks task curation. `equipment` already has summary/description_long/uses/image_url/
   parent_id/brand/model_number/wattage/etc.
2. **"Add new" entry point** for tasks AND tools (currently edit-only; can't create from UI).
3. **Reader view-mode toggle** (see §4) — hide machine fields for casual readers.
4. **Content/curation pass** — now unblocked: bless tasks, fill tools, write the reader
   content (descriptions, history, tips), add visuals.
5. **Ingredients reader page** parity (browse exists; bring to the same content standard).
6. Later: ingredient affordances surfaced from roles; entity_relations interactions; the
   ingredient×tool→task and apparatus-prep work (Knowledge Layer doc §2e, §Q3).

---

## 3. Content model per type (what makes each a good READ)

Through-line (from best-practice research — Serious Eats, America's Test Kitchen, and the
printed classics): **lead with the human "why/how", narrative first; structured data and
specs subordinate, lower down.** Avoid BOTH failure modes: the cold spec-sheet AND the
dreadful-SEO-blog filler. Editorial voice with a point of view (the thing that makes
Serious Eats/ATK readable). No collapsing of sections on reference pages (people read them
like Wikipedia — see §6). Cross-linking is the navigation (tool↔technique↔ingredient) —
which also earns HONEST SEO (genuine interlinked depth, not keyword farming). Quality earns
search traffic as a BYPRODUCT; never build for the crawler.

### Tools (role model: Haynes workshop manual + buyer's-companion books)
Order: what it is + vivid why → what it's for / not for → techniques it performs
(cross-links) → getting the most from it (tips, maintenance) → how it works (the science) →
specs (subordinate table) → specific models (cards) → "registered tools you own → My
kitchen". Uses real `equipment` fields. (Mockup rendered this session — narrative-first,
spec-last, with a pull-quote as the editorial-voice moment.)

### Ingredients (role models: Harold McGee *On Food and Cooking* for science; Larousse
Gastronomique for encyclopedic depth + cross-ref; The Flavor Bible for affinities)
Order: what it is + sensory description (`taste_profile`) → how it's made / origin /
history (`manufacturing_notes`, `history`, `cultural_notes`) → how to use it / what it does
in cooking (culinary ROLES — it's a fat AND flavour AND emulsifier) + affinities →
varieties / choosing / storage (`storage_notes`, season) → nutrition (subordinate). Uses
fields `ingredients` already has.

### Techniques (role model: Jacques Pépin *La Technique* / *La Méthode* — photographic
step-by-step)
Already shipped (list + detail). The detail's "Done when / Heat / Transforms / Tools / Tips
/ Common mistakes" is the right spine. Enrich with step imagery and the data-graphs (§5).

---

## 4. Two reading REGISTERS (the print insight, sharpened)

The printed classics split into two philosophies Soupdog can unify over ONE entry:
- **Le Répertoire de la Cuisine** = TERSE, structured, scannable — for the experienced cook;
  literally what the AI guide consumes ("Melt: gentle heat, solid→liquid, until melted,
  conduction/fat"). The machine fields ARE the Répertoire entry.
- **Larousse / McGee** = the DEEP narrative read — history, science, how-to, photos, the why.
Soupdog renders BOTH from the same entry. The **view-mode toggle** is the dial between
Répertoire density and Larousse depth — NOT just "hide technical fields", but two legitimate
reading registers, neither the "real" one. Ties to the skill-loop (below): beginners read
the deep register to learn; as their cooking-skill rises they flip to the terse register they
can now execute from. (Modern descendant worth noting: *Le Répertoire de la Cuisine
Innovante* — a dictionary of mechanisms/processes/Maillard/etc. = the knowledge layer in
dictionary form.)

---

## 5. Visual strategy (validated with real output this session)

Haynes is DEFINED by its visuals; text-only pages miss the point. Three distinct visual
types, each a different job and a different production path:

### a) Hero illustration — concept level (VALIDATED: works)
- **Illustration > photo for CONCEPT pages**: timeless (doesn't date as models change),
  consistent across the catalog (a designed reference-work identity, vs the visual noise of
  mixed-source photos), licensing-clean, reads editorial not commercial. Matches Soupdog's
  black-and-white aesthetic.
- Style chosen: **vintage Haynes / patent-drawing — black & white, engraved cross-hatching,
  three-quarter isometric, isolated on white.** (Two AI renders compared this session;
  the 3/4 technical/patent view — crisper, parts legible — beat the flatter front view.
  Reason: it reads as "reference manual" AND shows parts clearly enough to label later.)
- **Style-recipe discipline**: lock an identical style suffix + (ideally) a reference image;
  swap only the per-object line, so 300 entries stay coherent. CONSISTENCY-AT-SCALE is the
  real risk — test the chosen recipe across DIFFERENT object types (tool, ingredient, drink)
  before committing, not just one tool.

### b) Photographs — where realism matters
- **Specific MODELS** (a particular Panasonic oven, a specific wine) → photo, not illustration
  or AI-gen (recognition; AI invents fake details/logos).
- **"What does it actually look like"** (unfamiliar ingredient, a cut) and **doneness**
  ("what does well-browned look like", Pépin's reason) → photo.
- Concept = illustration, specific model = photo (maps to the concept/model tiers cleanly).
- Photos are an ACQUISITION cost (licensing / commissioned / careful sourcing), bounded.

### c) Data-driven graphs — the strongest, most defensible visual
- Generated FROM the structured data Soupdog already holds (completion_type/target, temps,
  durations, heat mechanism): e.g. sous-vide-vs-pan temperature curves (overshoot vs flat
  hold), doneness-by-core-temp, reduction-by-volume. (Rendered this session — one curve
  explains a tool's whole value better than a paragraph.)
- **The strategic edge**: the printed classics drew every diagram by hand; Soupdog GENERATES
  explanatory graphs from its knowledge layer — correct by construction, consistent, scalable,
  and impossible for a content-farm to fake without the data model. This is the visual asset
  that's uniquely Soupdog's.

### d) Labelled diagrams / cutaways (Haynes signature)
- The "how it works" annotated diagram = the AI-generated clean illustration (a) with a
  SEPARATE SVG annotation layer (callout lines + labels) authored OVER it — NEVER ask image-gen
  to label (it garbles text, mislabels parts). Pipeline: generate clean image → overlay
  accurate SVG callouts.
- Bespoke cutaways don't scale to hundreds; reserve for FLAGSHIP/most-browsed entries.
  Templated data-graphs + hero illustrations carry the long tail.

---

## 6. AI production strategy (honest about strengths/weaknesses)

A lot of this content will be AI-produced; be deliberate about WHERE AI is reliable:
- **Prose** (descriptions, history, how-to, tips) → AI-drafted, human-curated. Highest volume,
  highest leverage. ✓
- **Data graphs** → generated from structured data (deterministic, not "AI art"). Most
  scalable + most TRUSTWORTHY. ✓✓
- **Concept hero illustrations** → AI image-gen IS viable (stylized, concept-level, no exact
  realism needed) — with a locked style recipe + human selection + review. ⚠️ (style drift at
  scale is the work)
- **Technical diagrams/cutaways** → author as SVG (AI-ASSISTED CODING, not image-gen). ✓
- **Specific-model photos & doneness photos** → REAL photos, not generated. AI is the wrong
  tool (invents inaccurate detail). ✗ for generation.
- Always MEASURE & SUGGEST (AI) / NAME & DECIDE (human) — the standing principle.

---

## 7. Principles (apply across all three sections)

1. **Narrative-first, data-subordinate.** Open with the point; specs/fields lower down.
2. **Editorial voice / point of view** — confident, science-backed, tested-feeling. The thing
   that makes it a read, not a datasheet.
3. **No collapsing of sections on reference pages.** Recipe VIEW collapses (it's an executable
   procedure); reference/encyclopedia pages do NOT — people read top-to-bottom like Wikipedia.
   (View-mode hides MACHINE FIELDS for casual readers; it does NOT collapse prose.)
4. **Cross-linking is the navigation** (tool↔technique↔ingredient) — and the honest-SEO engine.
5. **Quality earns SEO as a byproduct** — NEVER build a search-first "dreadful recipe site".
6. **Calm aesthetic, generous whitespace, B&W illustration identity** — anti-thesis of the
   ad-cluttered blog.
7. **Ads (free-tier), if/when**: only small, bounded, clearly-labelled slots that don't wreck
   the aesthetic; reference pages are a natural surface AND the SEO/acquisition funnel; but
   ads come LATER (no audience yet), per the monetization restraint principle. Design the page
   so a tasteful slot CAN live there later; don't build it now.

---

## 8. Open / backlog (decide later)

- **Generic-vs-personal division** (catalog Tools/Ingredients vs "My kitchen" inventory):
  separate parallel sections (as nav does now: BROWSE above / MY KITCHEN below) OR one catalog
  entry with a personal "I own this / my notes" layer? Not thought through. **Research how
  others solved it** (board-game / wine / parts-inventory apps — tend toward "one catalog entry
  + personal layer"). Also intersects the shared-vs-personal DATA RESIDENCY seam (China hosting).
- **Personal inventory** ("My blue pot") — a per-person, NOT-browsable instance layer; ties to
  the inventory model that doesn't exist yet (Knowledge Layer §2e). Distinct from the global
  concept+model catalog. Deferred.
- **Task variations** (melt chocolate vs melt butter): parameters vs sibling tasks vs a
  `parent_task_id` FK? Likely params cover most (per §2d "params absorb variants"), siblings/
  parent-FK for genuinely distinct transformations — mirrors execution_variants at recipe level.
  Settle before building task-variation structure.
- **Skill-building loop** (strategic): browsing/learning techniques → raises the profile's
  cooking-skill parameter → feeds meal-planning + recipe recommendations. A real product thread
  (learn→skill-up→better-recs), its own design. Lesson format (structured learning) sits here.
- **Style-recipe lock + tool choice**: pin the exact prompt/engine/reference that gives the
  chosen B&W 3/4 look; standardise on the engine that's most CONSISTENT across object types
  (test tool+ingredient+drink). Techniques (actions/hands/motion) are hardest for illustration —
  may lean on photo sequences instead.

**Guiding principle (unchanged):** the knowledge section is curated culinary knowledge as
reusable DATA — one spine, many faces (AI guide, terse reference, deep encyclopedia, generated
graphs). The graph is the moat; the pages teach humans and earn honest reach; the AI drafts,
the human decides.
