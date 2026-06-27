# Soupdog — Create-a-Recipe Front Door Design v0.1

**Status:** design-settled, pre-build. The user-facing entry point for creating a
recipe — single dish OR meal — that drives the already-built-and-proven backend
(decompose engine → decompose-save → multi-dish display, all green as of
2026-06-26). This doc settles the IA and the per-dish resolution flow; the backend
it feeds is done. Grounded in a live trace of `src/app/my/recipes/import/page.tsx`
(983 lines) and `src/app/api/recipes/generate/route.ts` (196 lines).

---

## 0. What this is, and what already exists

The backend is built: a meal decomposes into one unified DAG (shared prep merged,
one terminal per dish, existing dishes LINKED via `resolvedDishes` → emitted as
`linkedDishes` → persisted as `version_sub_recipes` → rendered as "Dishes in this
meal"). What's missing is the **front door**: the UI + flow that lets a user
express what they want and PRODUCES the `resolvedDishes` the engine already honours.

Already in the codebase (the foundation, not throwaway):
- `/api/recipes/import` — parse pasted text / uploaded file → rough extraction.
- `/api/recipes/decompose` — extraction (+ optional `resolvedDishes`) → DAG. PROVEN.
- `/api/recipes/decompose-save` — DAG → persisted recipe (meal-aware). PROVEN.
- `/api/recipes/generate` — takes a prompt + the user's catalogue (titles), an
  internal model call decides one of: **clarify / existing / generate**. The
  "existing" branch ALREADY searches the user's own recipes and returns links. This
  is 80% of per-dish search — but built around a SINGLE dish.

The build extends this single-recipe foundation to "one or many dishes," without
ever asking the user to categorise.

---

## 1. Language rules (non-negotiable, applies to ALL copy)

- **Never say "AI"** in user-facing copy. AI is invisible plumbing (per standing
  monetisation design — "like bragging about electric lights"). Frame by OUTCOME.
- **Never say "butler"** — that is an INTERNAL concept name only.
- Verbs, not mechanisms: "Describe what you want", "Create", "Add a dish",
  "Generate a photo" — never "ask the assistant", "the AI will…", "parse".
- This is partly CLEANUP: the current page has internal "Create-with-AI" /
  butler-flavoured copy → relabel.

---

## 2. The IA — two sections + an add-dish affordance

Collapse today's three-ish entry points (paste text / upload file / generate
prompt) into TWO clear sections, plus one button:

```
Create a recipe
├─ (1) Describe what you want      [free text box]
├─ (2) Upload                       [ONE box: image / text / file — drop, paste, or attach]
└─ [+ Add another dish]             (appears once there is ≥1 dish; turns it into a meal,
                                      naturally, without ever asking "is this a meal?")
```

- **(1) Describe** — the fast path. Free text of what they want made
  ("a quick weeknight dhal"; "a dinner with carbonara, a green salad, and iced tea").
- **(2) Upload** — ONE unified box accepting image OR text OR file (photo of a recipe
  card, pasted text, attached .docx/.xlsx/.pdf). All flow to the existing parse path
  (`/api/recipes/import`), which already handles these. (Merging the currently-separate
  paste-vs-upload controls into one box is a UI change, not a backend one.)
- **[+ Add another dish]** — the explicit/builder path: start with one dish, add more.
  Its mere existence is how multi-dish happens — no toggle, no mode.

---

## 3. KEY DECISION — the system infers dish count; the user never declares it

A "meal" is a subjective view, not a type (standing principle). So:
- The user NEVER answers "is this one dish or a meal?"
- **Single vs multi is inferred** from what is described/added:
  - "Make me a carbonara" → one dish.
  - "A dinner with carbonara, salad, and iced tea" → three dishes (the model splits).
  - Two dishes added via [+ Add another dish] → two dishes.
- Single-dish is simply the **n = 1** case of the same flow. There is ONE flow, not a
  single-recipe flow and a separate meal flow.

Two paths into multi-dish, both supported:
- **Describe-splits** (fast): one sentence naming several dishes → the model
  identifies the dish list.
- **Add-another-dish** (explicit): each dish entered separately → already split.

---

## 4. Per-dish resolution — link-or-make (reuse decided by search + user)

For EACH dish (however it arrived), the same resolution, reusing the standing
principle "reuse is decided by search + user disambiguation, not silently by AI":

1. **Search** the user's catalogue for that dish (extends the `generate` "existing"
   title-match logic, applied per dish).
2. **Single clear match** → auto-LINK it (becomes a `resolvedDishes` entry → the
   engine links it, does not re-decompose). 
3. **Multiple matches** → ASK the user to pick (disambiguation). [DEFERRED to Slice 2
   — see §6; Slice 1 picks best/most-recent or makes fresh.]
4. **No match** → MAKE it fresh (generate text if described-only, or use the
   uploaded/parsed text) → decompose inline as part of the unified meal DAG.

The resolved links + the fresh dishes both feed the proven pipeline:
`resolvedDishes` + extraction → `/api/recipes/decompose` → `/api/recipes/decompose-save`.

---

## 5. Architecture — extend the existing flow (not a parallel one)

Lean: **extend `/api/recipes/generate`** with a `meal` outcome rather than building a
separate multi-dish endpoint. The butler-internal endpoint already loads the
catalogue, calls the model to decide, matches titles, and returns links — the meal
case is "do that, but per dish." Reusing it keeps ONE front door.

- Add a fourth action: `{action:'meal', dishes:[{name, ...}]}` — the model identifies
  the dish list from the request.
- Per-dish catalogue matching reuses the existing normalised-title match logic
  (currently single-dish) in a loop.
- Output: for each dish, either a resolved link (catalogue hit) or a to-make marker.
- The client assembles `resolvedDishes` (links) + drives generation/parse for the
  to-make dishes, then calls decompose with both.

(Single-dish requests still resolve to the existing clarify/existing/generate
outcomes — the `meal` action only fires when >1 dish is identified. n=1 is unchanged.)

---

## 6. Build slices (incremental — prove the front door, then refine)

- **Slice 1 (this build):** the two-section IA (Describe / Upload, unified upload box)
  + [+ Add another dish]; infer dish count; per-dish auto-link of a SINGLE clear match,
  else make fresh; compose through the proven engine. NO disambiguation picker
  (multiple matches → pick best/most-recent or make fresh). NO photo generation.
  Relabel all copy per §1.
  → Proves the whole front door end to end: "a meal with aglio e olio and a salad"
    reuses the existing aglio e olio + makes the salad, into one rendered meal.
- **Slice 2:** the disambiguation picker — multiple catalogue matches → interactive
  choose-which (the fiddliest UI; isolated on purpose).
- **Slice 3 (separate capability):** "Generate a photo" — image generation for a
  dish/recipe. NEW capability (image model + cost + storage); seam named in the
  Upload section, NOT built now.

---

## 7. Deferred / seams named (don't build yet)

- **Disambiguation picker** (Slice 2) — multiple matches → user picks.
- **Generate-a-photo** (Slice 3) — image-gen; the Upload box hosts the affordance
  but the capability is its own slice (model, cost, storage).
- **Linking OTHER users' published dishes** into a meal — the `version_sub_recipes`
  write policy already permits it (gates on owning the PARENT meal), but Slice 1
  searches only the user's OWN catalogue (as `generate` does today). Public-recipe
  reuse is a later widening.
- **Promotion** of an embedded fresh dish → standalone recipe — separate gated
  pipeline (from the composition consolidation doc), unaffected here.

---

## 8. [OPEN] decisions to settle while building Slice 1

1. When Describe names several dishes AND some are uploaded/added separately, how do
   the two paths merge into one dish list? (Likely: a single in-page list of dishes,
   each tagged by how it arrived; Describe-split pre-populates it.)
2. Single-dish requests: keep the exact current clarify/existing/generate UX, or fold
   them into the same per-dish list with n=1? (Lean: fold, so there is truly one flow.)
3. "Pick best" rule for Slice-1 multiple-match (most recent? highest-version?
   published-over-draft?) — provisional; the real answer is Slice 2's picker.
4. Where the dish list lives in state on the import page (new state shape) and how it
   threads into the existing `handleImportFile` → decompose → save path.

Settle 1–4 inline during the Slice-1 build; none are spine-level.
