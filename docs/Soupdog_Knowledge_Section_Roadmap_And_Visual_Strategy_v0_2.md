# Soupdog — Knowledge Section: Build Roadmap, Content Model & Visual Strategy — Design v0.2

**Status:** DESIGN (not built). 2026-06-07. v0.2 = v0.1 + a VALIDATED visual system (§5
rewritten): the per-section image styles were tested with real AI renders across multiple
object types and the conclusions are now evidence-backed, with the working prompt recipes
embedded. Captures the public-facing KNOWLEDGE SECTION — Techniques, Tools, Ingredients
pages — build sequence, content model per type, the reader/AI "two registers" idea, the
visual strategy, AI-production guidance, and principles. Sits alongside (does NOT supersede)
the Culinary Knowledge Layer doc (v0.5), which covers the AI-guide side and the schema.
This doc is the READER-FACING + production side. Techniques list/detail + curation admin
view already shipped (see handover); this extends them. Discard any v0.1 copy.

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

## 5. Visual strategy — VALIDATED with real AI renders (the headline of v0.2)

Each section's hero style was TESTED with real renders (ChatGPT + Dale) across multiple
object types. The conclusions below are evidence-backed, not theory. Headline finding:
**the right hero style differs by section, driven by whether COLOR carries the identity.**

### TOOLS — engraved B&W illustration (VALIDATED, LOCKED)
- Style: **vintage Haynes / patent-drawing — black & white, engraved cross-hatching,
  three-quarter isometric, isolated on white.** Tested on circulator, stockpot, frying pan —
  holds beautifully across shapes. Timeless, consistent catalog identity, licensing-clean,
  editorial, matches Soupdog's B&W aesthetic. The 3/4 technical view beat the flat front view
  (crisper, parts legible for later labelling).
- Color is NOT identity-carrying for tools (a pot is a pot in B&W) → illustration wins.
- Also worth trying in RECIPE step-instructions (calm engraved step images) — flagged, untested.
- **Prompt recipe (lock the style suffix; swap the object line):**
  > [OBJECT LINE] — rendered as a vintage Haynes workshop-manual / patent-drawing style
  > technical illustration. Black and white only, no color. Clean precise ink linework with
  > fine engraved cross-hatching for shading and form. Three-quarter isometric view, slightly
  > above. Isolated on a plain white background, centered, generous negative space. Crisp,
  > mechanical, reference-book quality — elegant, timeless, editorial, not commercial or
  > photographic. Restrained and calm, not busy. Flat even lighting, no ground shadow, no
  > background. No text, no labels, no callouts, no numbers, no logos, no brand markings,
  > no watermark.

### INGREDIENTS (and DRINKS) — color editorial photo (VALIDATED, LOCKED)
- KEY FINDING: **color carries the identity for ingredients.** The engraved B&W butter was
  illegible (could be soap/clay/stone); the color photo of butter/Parmesan/lemon/guanciale
  was instantly readable. So ingredients need COLOR + PHOTO, not the engraved style.
- Style: **editorial food-reference photograph — single subject, soft diffused side daylight,
  smooth seamless WARM OFF-WHITE background (#f5f3ee, echoing Soupdog's --bg), gentle soft
  shadow, slight 3/4 elevation, no styling clutter, documentary not glossy.** The off-white
  background is the CONSISTENCY DEVICE that unifies the catalog and keeps the calm look.
- Tested on butter, Parmesan (block + grated heap), lemon (whole + cut half), diced guanciale,
  red wine — all read instantly and form a coherent set.
- **Prompt recipe (lock the style block; swap the subject):**
  > [SUBJECT] — Editorial food-reference photograph. A single [SUBJECT] as the sole focus,
  > centered, isolated on a smooth seamless off-white / pale neutral background (#f5f3ee),
  > with soft diffused natural daylight from one side casting a gentle soft shadow. Slightly
  > elevated three-quarter angle. Realistic, true-to-life color and texture, high detail —
  > the natural color is essential to identifying it. Clean, calm, minimal styling; no props,
  > no garnish-clutter, no hands, no text, no packaging, no branding. The whole subject in
  > focus. Looks like a fine cookbook or culinary field-guide plate — refined and appetising
  > but documentary, not glossy-advertising. Muted natural palette; no heavy color grading,
  > no dark moody restaurant lighting.
- Drinks pattern that worked: the glass + a small pour/dish showing the color spread out
  (red wine) — the second vessel showing the hue is informative. NO bottle (invites fake label).

### TECHNIQUES — HYBRID (VALIDATED): color doneness-still hero + engraved action for method
- Techniques are an ACTION OVER TIME, not an object — hardest of the three. Tested three
  candidates (A engraved action, B color action photo, C color doneness-state still):
  - **C (color doneness-state still, no hands) WON as the hero.** Shows the RESULT/doneness
    (the actual informative content), dodges the AI-hand problem, consistent with the
    ingredient register. A MULTI-STAGE still (e.g. steak at 3 doneness stages left→right) is
    an especially strong format — the Pépin "stages" idea in Soupdog's look.
  - **A (engraved B&W action) is the secondary METHOD image** — shows the gesture/grip/motion
    (how to toss, how to hold tongs), matches the tools identity. Used lower on the page.
  - **B (color action photo, hands tossing) was weakest** — generic-stock feel, torso clutter,
    a frozen toss teaches little. Don't use as hero.
- So the technique page COMPOSES the two already-validated styles: color-photo register
  (from ingredients) for doneness result + engraved register (from tools) for method. Nothing
  new to invent.
- Hero prompt recipe (Candidate C): use the INGREDIENTS recipe with subject e.g. "a frying pan
  holding a steak seared to a deep golden-brown crust, no hands present" (or a 3-stage version).
  Method illustration: use the TOOLS engraved recipe with an action object line (hand + tool +
  food mid-gesture) — engraving hides AI-hand-anatomy risk.

### Data-driven graphs — the strongest, most DEFENSIBLE visual (unchanged, still to build)
- Generated FROM the structured data Soupdog already holds (completion_type/target, temps,
  durations, heat mechanism): sous-vide-vs-pan temperature curves, doneness-by-core-temp,
  reduction-by-volume. One curve explains a tool's whole value better than a paragraph.
- The strategic edge: printed classics hand-drew every diagram; Soupdog GENERATES them from
  the knowledge layer — correct by construction, consistent, scalable, impossible to fake
  without the data model. Uniquely Soupdog's.

### Labelled diagrams / cutaways (Haynes signature)
- "How it works" diagram = the AI-generated clean illustration + a SEPARATE SVG annotation
  layer (callouts) authored OVER it — NEVER ask image-gen to label (garbles text, mislabels).
  Pipeline: generate clean image → overlay accurate SVG callouts. Reserve bespoke cutaways for
  FLAGSHIP entries; templated graphs + hero images carry the long tail.

### Production discipline (validated lessons)
- **Lock ONE engine + ONE recipe per section** and stay there — ChatGPT vs Dale outputs are
  close but differ subtly (background warmth, brightness); mixing across hundreds of entries
  causes visible drift. Pick the preferred engine/recipe and standardise.
- **Concept = AI-generated; specific branded product = REAL photo** (AI invents fake labels/
  details). Holds for both tools (illustration vs photo) and ingredients/drinks (generic photo
  vs real product photo).
- Generate several, discard failures (esp. anything with hands).

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
- **Style-recipe lock + engine choice** (mostly RESOLVED in §5): the three section styles are
  validated and the prompt recipes recorded. Remaining: pick the ONE engine to standardise on
  (ChatGPT vs Dale — both good, choose for consistency), and consider anchoring with a reference
  image per section. Recipe-step illustrations (engraved style in instructions) still untested.

**Guiding principle (unchanged):** the knowledge section is curated culinary knowledge as
reusable DATA — one spine, many faces (AI guide, terse reference, deep encyclopedia, generated
graphs). The graph is the moat; the pages teach humans and earn honest reach; the AI drafts,
the human decides.
