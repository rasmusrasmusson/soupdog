# Soupdog — Cook Mode / Live Execution Sessions

*Design note · v0.1 · BACKLOG / future vision — NOT scheduled · June 2026*

**Status.** A backlog design note capturing a connected vision, so its structure
isn't lost. Nothing here is scheduled or being built. Flagged **[OPEN]** where
undecided. It is downstream of the Ingredient–Process and Plan & End-Product
models and depends on infrastructure not yet built (server-side session state,
Sharing & Delegation visibility tiers).

---

## 1. The core shift

A recipe today is a static document with minimal interaction (step checkboxes).
The vision: a recipe **comes alive** as a **server-synced, stateful, multi-actor
execution session**. This one move — making execution *stateful and shared*
rather than living in one browser — is the spine from which almost everything
else follows for free:

- resumability (sous-vide / long processes / closed browser → continue where
  left off)
- real-time progress (who's done what, now)
- multi-person coordination (per-actor step lists)
- connected-appliance feeds
- oversight views (head chef, franchise)
- usage analytics (how people actually use recipes)

None of these are separate features; they're consequences of server-backed
session state.

## 2. Naming — "Cook mode", but it's general execution

Working/UI term: **Cook mode** (people will understand it). But the CONCEPT is
**execution of a recipe of any kind**, not cooking-with-heat. Drinks are
supported (a meal already has dishes AND drinks); a cocktail, coffee, or an
"order a pizza" recipe all run through the same execution surface. Per the
Plan & End-Product model, the act is *producing an end-product ingredient* —
cook, mix, brew, assemble, plate, acquire, order. Do not let the word "cook"
quietly narrow the model (same trap as "recipe = cooking steps", which the
pizza example already broke). **[OPEN]** final name (cooking session / cook mode
/ live recipe / prep session).

## 3. Passive-step timers + alarms (validates the spine)

The Ingredient–Process model already names PASSIVE TIME as a task type (beside
human and machine tasks). Cook mode surfaces it: a passive task with a known
duration (raise dough, rest meat, chill, sous-vide, freeze) becomes a startable
timer that notifies on completion.
- **Alarm = visual + audio**; audio may be a signal tone and/or **voice**.
- Same notification channel the hands-free/voice mode uses.
- A dough-raise timer must survive a closed browser → this is exactly why the
  session must be SERVER-SYNCED (reinforces §1).
- Connected appliances (thermometer, sous-vide, freezer) can FEED these states
  so the user watches Soupdog instead of walking around — especially valuable
  for slow processes and in commercial kitchens.

## 4. Scales by zoom level (same primitive, three sizes)

The primitive — a live session with per-actor state — scales exactly like the
Group/Schedule-Type generalization:

- **Solo / family** — per-person step lists; hands-free voice mode; resume.
  Multiple people joining one cook; each gets their own list, accessed via
  (a) tabs, (b) filters, or (c) their own login/screen.
- **Commercial kitchen** — per-station / per-chef screens (login → your screen);
  a head-chef OVERSIGHT view that drills into what each chef/station is doing;
  appliance monitoring centralized.
- **Franchise** — a master live view across locations, drilling down
  location → station → meal.

For an actor watching many processes (head chef): a page with FILTERS plus an
**omnipresent indicator** that flags changes / asks for attention, and can be
interacted with directly (see §6). Active cooking should be **omnipresent** in
the UI — easy to see and jump to from anywhere.

## 5. Real-time progress + analytics

Each interaction (for now, checking a step) updates the server → real-time
knowledge of progress, AND data on how people actually use recipes (a product
insight, not just a UX nicety). The step-check is the seed; richer signals
(timer starts, voice events, appliance readings) layer on.

## 6. AI chat — two distinct surfaces

- **On the static recipe (Q&A / gap-filling):** e.g. a croissant recipe says
  "roll thin" but not how wide/long — ask the AI for the missing dimension.
  Helps where the recipe is underspecified.
- **On the live session (hands-free):** voice interaction so the cook needn't
  touch the screen — "step's done", "what's next", "how long left on the
  sous-vide". Voice is the primary modality here (hands are busy/dirty).
These are different enough to design as two surfaces, though they share the
underlying recipe + session context.

## 7. Ingredient page — the inverse relation

Today the ingredient page shows "what recipes USE this ingredient." Add the
dual: **"what recipe MAKES this ingredient"** (when known) — a direct expression
of the Ingredient–Process model (every ingredient = output of a process).
Commercial wrinkle: a food company using Soupdog has a packaged product as an
ingredient; its making-recipe is visible to the company's OWN staff but not the
public — a visibility-tier concern (ties to Sharing & Delegation).

## 8. Dependencies / [OPEN]
- **Server-side session state** — the prerequisite for everything in §1; not
  built. Schema for a live session (per-actor step state, timers, appliance
  feeds, resumability) is undesigned. **[OPEN]**
- **Visibility tiers** (Sharing & Delegation) — needed for per-actor screens,
  oversight, franchise drill-down, and the private making-recipe case.
- **Recipe kinds / templates** (Plan & End-Product model §3) — different recipe
  types (cook / mix / acquire / delivery) likely need different execution
  templates and timer/step semantics. Settling recipe-kind serves both notes.
- **Appliance integration** — protocol/standard for connected devices. Far out.
- **Voice** — STT/TTS, wake-word, noisy-kitchen robustness. Far out.

## 9. Relationship to other notes
- **Ingredient–Process Model** — passive-task type (§3) and ingredient-inverse
  (§7) come straight from it.
- **Plan & End-Product Model** — "execution of any recipe kind" (§2) and the
  recipe-kind dependency (§8) are direct consequences.
- **Sharing & Delegation** — visibility tiers gate the multi-actor and private-
  recipe features.
