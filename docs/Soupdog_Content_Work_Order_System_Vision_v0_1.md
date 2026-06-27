# Soupdog — Content Work-Order System (Production Console) Vision v0.1

**Status:** VISION captured, NOT scheduled. An internal staff tool for mass content
production. Flagged by Rasmus during the create-flow build so current work stays
compatible with it (see §6 — "account for the neighbour"). This doc is a faithful
record of the vision + an honest read on timing and dependencies. It is NOT a build
spec yet.

---

## 1. The core idea

An internal Soupdog tool/view for STAFF to create, review, approve, and mass-produce
content. Its defining principle:

> **Don't manually create (or even review) content. Create and improve the AI GUIDES
> that produce content at scale — then review, approve, and run large batches.**

It LEADS content creation (advises what to focus on next), makes large-batch
generation easy, and shows COST before and after big AI tasks. Target batch sizes:
~100 recipes at a time, possibly more — as large as is reasonable while holding quality.

**Ambition:** the largest recipe site in the world — all cuisines, historic food,
anything people and companies want, translated into a large number of languages
(eventually ~all but obscure ones) — done at QUALITY. This is coherent with the
architecture already built (graph-native model, guide/curation layer, demand signals,
execution_variants, ai_usage_log): the console is the PRODUCTION LAYER the platform
was designed to enable, not a bolt-on.

---

## 2. What it does (faithful capture of Rasmus's notes)

**Suggest what to make (recipes):**
- Pre-users: most-popular recipes per market, or global (setting to limit markets).
- With users: consider the user demographic + what that group wants — but KEEP building
  for a global, timeless audience too (not only chase current users).

**Suggest variations:**
- First from REQUESTS (users sought a recipe / a variation — more servings, different
  ingredients).
- Second from ASSUMED needs (e.g. a recipe lacking serving-size versions likely to be
  commonly needed).

**Suggest tools / ingredients / tasks (+ variations):** same pattern —
"what we think is needed" first; once users grow, what new recipes call for (requested)
or are reasonably expected. Work from a large master list sorted by likely-common-need,
working DOWN it over time, eventually adding ALL known tools (incl. historic). A
parallel track adds LABELLED tools (appliance models), similarly ordered most-common-first.

**Suggest translations.**

**Review recipes for quality:** logical organisation, proper writing, good content, etc.

**Suggest images / videos:** hero shots + instruction shots for existing
ingredients/dishes/meals/tools/tasks, ordered by how requested/expected.

**Integrate image + video CREATION at scale:** start large content jobs that run WITHOUT
an admin watching the screen. Batch generation, then a REVIEW process on top (how good
did they come out) with recommendations for replacements via tweaked prompts.

**Cost visibility:** show cost BEFORE initiating large AI requests, and money spent
after. (This is the gate on running big jobs.)

**Scaling intelligence for guides:** scaling a recipe is NOT just "more of everything" —
large batches change proportions (e.g. spices; there may be domain knowledge to tap),
and need different tools/recipes (a school kitchen cooking for 500 ≠ home ×125). The
AI guides must encode this.

**Guide on meals:** same method as other content.

**Usage reports:** actual-usage reporting presented alongside the production console
(possibly a different system, shown together) — usage data serves both admin and
content creation. This is the "admin version of Soupdog."

**Similar guides for nutrition, cultural, and plating content.**

---

## 3. Structure — it is ONE system with four functions

Across every content type (recipes, tools, ingredients, tasks, variations,
translations, images, videos, nutrition, cultural, plating):
1. **SUGGEST** — what to make next (demand-driven once users exist; seeded-priority
   before).
2. **GENERATE** — batch, cost-gated, runs unattended.
3. **REVIEW** — quality scoring + approve/replace (incl. re-prompt suggestions).
4. **REPORT** — usage + cost ("money spent"), the admin dashboard.

The leverage is that GENERATE operates on GUIDES, not items: improving one guide
improves all content it produces. Review feeds back into guides.

---

## 4. HONEST timing read — pre-user vs post-user halves

A large part of the vision's INTELLIGENCE depends on signals that need USERS (there are
none yet). Split it:

**Pre-user half (buildable without users):**
- Seeded priority lists ("what we think is needed"): popular/global recipes, a master
  tool list in rough priority order, common ingredients.
- Batch GENERATE + COST gating + money-spent.
- Quality REVIEW (logical organisation, writing, content) — doesn't need users.
- Image/video batch generation + review.
- Scaling intelligence in guides.

**Post-user half (needs real demand data):**
- Demographic-targeted suggestion.
- "What users requested / looked for" → variation + tool + ingredient suggestion ordering.
- Usage reports.
- "Sort by how requested" everywhere.

Building the post-user half NOW = building on absent data (speculative). The pre-user
half is real but large.

---

## 5. HONEST ordering read — value is GATED on single-pipeline quality

The console MASS-PRODUCES whatever the single content pipeline produces. If one
AI-generated recipe is still messy (e.g. the parked salad-decomposition quality issue),
the console mass-produces messy recipes faster. So:

> **The console's value is gated on (a) single-recipe creation being solid and (b) the
> guide/curation layer being good enough that batch output is trustworthy.**

Build the thing-it-scales FIRST. Right now that means: finish the create-flow spine,
get single-recipe + meal quality trustworthy, and mature the guide/curation layer.
THEN the console multiplies a good pipeline instead of a shaky one. This is not a reason
to ignore the vision — it's the reason to sequence it after the single pipeline is sound.

---

## 6. Account for the neighbour NOW (what current work should preserve)

Per Rasmus's own build principle (don't make choices that force later rebuilds; if a
neighbour matters, account for it now), the console is a big neighbour. Current and
near-term work should stay COMPATIBLE without building the console:

- **Keep the AI pipeline QUEUEABLE and COSTABLE.** Generation endpoints should be
  shaped so a batch runner can call them and a cost can be estimated before running.
  `ai_usage_log` already records spend; preserve/extend it as the cost substrate. Avoid
  designs that assume a human is watching one generation at a time.
- **Treat GUIDES / curation as first-class editable objects** (tasks verified-core, etc.)
  — the console EDITS these. The Techniques/curation admin already moves this way; keep
  guides as data, not hardcoded prompts.
- **Keep DEMAND SIGNALS flowing to a readable place** (requested-but-not-made recipes,
  variation requests). The console's SUGGEST function reads these later. Capture them now
  even if nothing consumes them yet (a demand-capture row on algorithmic fallback was
  already noted as a genuine gap).
- **Keep content types uniformly structured** (recipe/tool/ingredient/task/translation/
  image/video) so one console can operate over all of them — the graph-native model
  already supports this; don't fork per-type special cases that a console couldn't drive.
- **Quality REVIEW wants a per-item quality state** (draft/reviewed/approved + a score) —
  flags already exist on tasks (is_verified/content_reviewed) and recipes; keep extending
  that pattern uniformly so review is a state machine the console can drive.

These are CHEAP to preserve now and EXPENSIVE to retrofit — exactly the rebuild-avoidance
Rasmus called for.

---

## 7. Recommendation

- **Now:** capture (this doc). Do NOT build. Keep §6 compatibility in mind during the
  create-flow and guide-layer work already underway.
- **Pre-condition to building:** single-recipe + meal creation solid; guide/curation
  layer mature enough that batch output is trustworthy (the quality gate, §5).
- **First console slice when scheduled (pre-user):** a batch GENERATE + COST-gate +
  REVIEW loop over recipes, driven by a seeded priority list and the existing guides —
  the smallest thing that proves "improve a guide → mass-produce quality." Demand-driven
  SUGGEST and usage REPORTS come once users exist.
- **Revisit** this doc when create-flow + guide quality are sound, or when content
  production becomes the actual bottleneck.

---

## 8. [OPEN] questions for when it's scheduled

1. Batch size vs quality ceiling — what's the largest batch that holds quality? (empirical)
2. Cost estimation BEFORE a batch — how accurate can a pre-flight estimate be per content
   type? (ties to prompt-caching/batch-API economics already noted in monetisation design)
3. Review automation — how much quality review can be AI-scored vs needs a human glance,
   and at what batch size does human review stop scaling? (the console's whole premise is
   minimising human review)
4. The "master lists" (tools/ingredients sorted by likely-common-need) — sourced how?
   (AI-estimated ranking refined by real usage later — same honest caveat as the content
   pipeline's dish-family backbone: no authoritative global ranking exists.)
5. Scaling intelligence (proportions change with batch size; 500-portion kitchen ≠ home
   ×125) — where does this knowledge live (a guide? a rule library? execution_variants
   extended)?
6. Admin-Soupdog surface — is the console + usage-reporting one app/view, and how does it
   relate to the existing admin routes?
