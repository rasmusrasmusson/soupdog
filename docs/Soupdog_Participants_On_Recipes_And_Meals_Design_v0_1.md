# Soupdog — Participants on Recipes & Meals · Design v0.1

**Status:** design-first · pre-build
**Date:** 2026-06-24
**Author:** Rasmus (decisions) · Claude (drafting)
**House style:** olive `#2E4638`, IBM Plex Serif, numbered sections, `[OPEN]` flags

---

## 1. The one-line spine

A **recipe** is a *method* (a type — the same Carbonara for everyone, forever).
A **scheduled meal** is an *instance* — *this* end-product, on *this* date, for
*these* participants. **The output is always ONE ingredient**, whether the
recipe is a single dish or a four-course dinner with wines.

Participants, plating, and nutrition attach to the **instance**, not the method.
That single sentence settles every design question below:

- Recipe-view participants are a **transient what-if filter** (not persisted).
- Meal participants are **real `meal_participant` rows** (persisted).
- The moment "who eats this" must persist (a real cook, a real plating), you
  have an instance — so cooking a recipe directly **mints a lightweight meal**
  and rides the existing meal path.

Same `<Participants>` component and same nutrition recompute on both surfaces;
the *only* difference is whether the participant list is written to the DB.

---

## 2. What already exists (ground truth — do NOT rebuild)

Confirmed by reading the live `src` this session:

| Capability | Where it lives | State |
|---|---|---|
| Person spine | `person`, `account`, `person_access`; `owned_person_ids(acc)` RPC | live |
| Meal participants | `meal_participant(meal_id, person_id, status, placed_by)` | live |
| Add/remove participant (owned only → `accepted`) | `POST/DELETE /api/my/meal-plan/participant` | live |
| Avatar add/remove UI (stack + dashed "+" + popover) | `PlanView.tsx` (`AvatarStack`, `MealRow`) fed by `/api/my/meal-plan/group` | live |
| Requirement cascade (known→persona, honest confidence) | `lib/demand/resolve-requirement.ts` → `resolveRequirement(db, personId)` | live |
| Table aggregation + score + plating split | `lib/demand/aggregate-and-match.ts` (`aggregateTable`, `scoreMeal`, `platingSplit`) | live |
| Full pipeline for one meal | `GET /api/my/meals/[id]/match?slot=` → `{ table, score, plating, hasNutrition }` | live |
| "For your table" panel (confidence dot · plating · satiety) | `components/meal/MealFitPanel.tsx` | live |
| Start cooking (meal-anchored) | `StartCookingButton({mealId})` → `/my/meals/[id]/cook-setup` | live |
| Who's eating (for cook setup) | `GET /api/my/meals/[id]/eaters` | live |

**Implication:** v1 is mostly *wiring + extraction + two small new bits of math*,
not a from-scratch feature. The biggest genuinely-new piece is **per-person
nutrition + "% of target"**, which the panel does not yet show.

---

## 3. The three-layer nutrition panel (the heart of v1)

When participants are present, the panel reads in three honest layers — all
derivable from data we already compute:

### 3.1 Meal total (headline)
Everything consumed — the ONE ingredient's full nutrition. For a composed meal,
this is the **sum across all components** (one item ⇒ one nutrition figure).
For a single dish, it's just that dish. This is the headline number.

### 3.2 Plating recommendation (per person — *prescriptive*)
What each person *should* eat. This is the existing `platingSplit`: the dish is
scaled to the table's summed energy need, then divided by each person's share of
the dominant need. Cook-friendly phrasing already exists ("the larger, more
generous helping" / "a neater, smaller portion"). **Encourage, never shame.**

### 3.3 Per-person portion nutrition + "% of target" (per person — *new math*)
Once we recommend a share, that person's portion nutrition =
`share × recommendedServings × perServing[field]`. Their **"% of target"** =
that portion value ÷ their resolved daily field for that nutrient, carried with
the **same honest confidence dot** (green/amber/grey) the panel already uses.

> **Settled decision — per-person nutrition follows the PLATING recommendation,
> not an equal split.** If we recommend Natasha eats less, her "% of target"
> reflects *her recommended portion*, not dish ÷ heads. Equal-split would make
> the demand model decorative. This is the whole point of having profiles.

**Honesty rule (carried from `MealFitPanel`):** a persona-floor guess reads as
"best guess", never a verdict. Grey = "we don't know enough yet" = an
invitation, not an error. "% of target" inherits the participant's confidence.

---

## 4. The shared `<Participants>` component

One component, two persistence modes:

```
<Participants
  people={...}            // resolved participant list (id, name, avatar)
  addable={ownedPeople}   // people you can add (owned persons in v1)
  onAdd / onRemove        // mode-specific handlers
  mode="meal" | "recipe"
/>
```

- **Avatar stack + dashed "+" + click-popover** — extract the existing pattern
  from `PlanView` (`AvatarStack`, the dashed-"+" span, the `openPerson` popover)
  into `components/people/Participants.tsx` so both surfaces share one look.
- **mode="meal"** → `onAdd/onRemove` call `POST/DELETE /api/my/meal-plan/participant`
  (persisted `meal_participant`). Exactly today's behaviour.
- **mode="recipe"** → `onAdd/onRemove` mutate **local component state only**
  (transient). Nothing written to the DB.

### 4.1 Who can be added (v1)
**Owned persons only** (self + managed household members) — exactly what the
meal picker does today via `/api/my/meal-plan/group` and `owned_person_ids`.
Connections / guests are a later rider.

---

## 5. Recipe surface — the transient path

On `/recipes/[slug]`, the participants section is a **what-if filter**:

1. Default participants = the caller's self-person (so a logged-in reader sees
   "for me" immediately; logged-out = `adult_unspecified` persona, all-grey).
2. Adding/removing people updates **local state** only.
3. The nutrition panel recomputes "for this table" from that local list.

Because the recipe is a *type*, there is no `meal_participant` and nothing
persists. This avoids the recipe accreting every user's dinner guests.

### 5.1 The recompute on a recipe (no meal id)
`match` today is meal-anchored (`/api/my/meals/[id]/match`). For a recipe what-if
we need the same math against an **ad-hoc participant list + a recipe's
`nutrition_per_serving`**, with no persisted meal. Two implementation options:

- **(A) New read route** `POST /api/recipes/[slug]/match` taking
  `{ personIds[], slot }`, running the same `resolveRequirement → aggregateTable
  → scoreMeal → platingSplit` pipeline against the recipe's current-version
  nutrition. Clean, mirrors the meal route, no fake rows. **Lean: A.**
- (B) Mint a throwaway meal and reuse `/api/my/meals/[id]/match`. Rejected —
  pollutes `meal`/`meal_participant` with what-if noise; the recipe what-if is
  explicitly *not* an instance.

`[OPEN 5a]` Confirm route A is acceptable, or prefer a single unified
`match` that accepts *either* a mealId *or* (recipe + personIds).

---

## 6. Meal surface — the persisted path

On a meal (`/my/meals/[id]` and PlanView), participants stay exactly as today
(persisted `meal_participant`, owner-placed → `accepted`). The only change is
the **panel gains the per-person nutrition + "% of target" layer** from §3.3.
`MealFitPanel` already fetches `match`; extend `match` to also return per-person
portion nutrition (or compute it client-side from the data `match` already
returns — see §8).

---

## 7. Cook-a-recipe-directly

Today: cooking is meal-anchored (`StartCookingButton({mealId})` →
`/my/meals/[id]/cook-setup`). A common case is browsing to a recipe and wanting
to **cook that directly**, without first building a meal.

**Settled principle:** *if who's eating/cooking must persist, you have an
instance.* So cook-from-recipe **mints a lightweight meal under the hood** and
reuses the existing meal→cook-setup→session path. No parallel recipe-cook stack.

Flow:
1. On `/recipes/[slug]`, a "Cook this" action.
2. It creates a minimal `meal` (owner = self-person, today's date, slot derived
   or generic `meal`, the recipe as its single component/recipe link), and —
   if the user had a transient participant list from §5 — promotes those into
   real `meal_participant` rows at that moment (transient → persisted, exactly
   at the persist seam).
3. Route into the existing `/my/meals/[id]/cook-setup`.

`[OPEN 7a]` Does "Cook this" always mint a meal, or only when the user adds
participants / schedules it? Lean: minting is cheap and keeps ONE cook path —
always mint, but keep the meal lightweight (no schedule pressure).
`[OPEN 7b]` Minimal `meal` insert shape for a recipe-anchored meal — confirm
required columns (`owner_person_id`, `meal_date`, `slot`, `created_by`, recipe
link) against the live `meal` table before building.

---

## 8. Where the new math runs (small, but a real decision)

The per-person portion nutrition + "% of target" needs, per participant:
`share` (from plating) × `recommendedServings` (from score) × `perServing[field]`
(recipe nutrition), then ÷ the participant's resolved daily field.

The participant's **resolved daily field** is computed inside `resolveRequirement`
but `match` currently only returns the *aggregated table* and the *plating
shares*, not each person's per-field daily values. So either:

- **(A)** extend `match` to also return, per participant, their resolved daily
  fields (or directly their portion nutrition + %-of-target). Server-side, one
  place, testable. **Lean: A.**
- (B) recompute client-side in the panel — but the panel doesn't have each
  person's daily fields without another call. Rejected.

`[OPEN 8a]` Confirm extending the `match` response (both meal and recipe match)
to include `perParticipant: [{ personId, name, confidence, portion:{...nutrient
values}, percentOfTarget:{...} }]`. This is the v1 data contract for §3.3.

---

## 9. v1 scope (build now) vs v2 (named seam, design later)

### v1 — same dishes, different quantities
- Shared `<Participants>` component (extracted from PlanView pattern).
- Recipe surface: transient participants + what-if nutrition (route A, §5.1).
- Meal surface: unchanged persistence + the new per-person nutrition layer.
- `match` returns `perParticipant` portion nutrition + "% of target" (§8).
- "% of target" surfaces in the panel **and** unlocks the same figure in the
  **nutrient quick-look modal** (the open enhancement that started this) —
  "= X% of your daily target", per-person, honest confidence.
- Cook-a-recipe-directly mints a lightweight meal and reuses cook-setup (§7).

### v2 — participant-scoped components (NAMED, not built)
The wine/soda case: different *components* for different people (adults get
wine, children get soda). This is **not** a plating split — it's components
scoped to a subset of participants.

- Model: each `meal_component` gains an **applies-to-participants scope**;
  meal total still sums all components; **per-person nutrition sums only the
  components that apply to them**, at their plated share.
- This is the *same shape* as the future allergy/diet rider (a component a
  person can't have is just a component that doesn't apply to them).

> **v1 must not preclude v2.** Write the per-person nutrition function from day
> one as **"sum applicable components × share"**, even though in v1 "applicable"
> always returns *all* components. The seam is then already in place.

### Future riders (design separately — named so the seam isn't precluded)
- **Allergy / diet / religious checking** against participants. SAFETY-SENSITIVE
  — always INFORMATIONAL ("we don't see Anna's listed allergens here"), NEVER a
  guarantee ("safe for Anna"). Ingredient flag data is currently incomplete /
  unreliable (broken API-key gen). Halal/Kosher = highest curation bar; don't
  declare authoritatively. Its own careful doc. Rides on the same `<Participants>`.
- **Chef-skills → recipe difficulty + dividing the DAG across cooks.** Already
  designed (`Soupdog_Cooking_Together_And_Skill_Model_v0_1.md`); downstream of
  atomic decomposition + a task→competency-area mapping. The participants list
  (cooks) is its entry point. Large; later.
- **Per-component plating** (Natasha gets more salad, less dessert) — Demand
  Model Phase 4. v1 does meal-level share (one number per person).
- **Connections / guests** as addable participants (beyond owned persons).

---

## 10. Open decisions to settle before building

- `[OPEN 5a]` Recipe what-if: dedicated `POST /api/recipes/[slug]/match`, or a
  unified `match` accepting mealId XOR (recipe + personIds)?
- `[OPEN 7a]` "Cook this" — always mint a meal, or only on participants/schedule?
- `[OPEN 7b]` Confirm minimal `meal` insert shape (live columns).
- `[OPEN 8a]` Confirm the `perParticipant` `match`-response contract (§8).
- `[OPEN 10a]` "% of target" against a **daily** target while a meal is one
  occasion — show "% of day" (honest: this meal is ~X% of your day) and avoid
  implying the meal should hit 100%. Lean: label it "% of daily target" and let
  it read low; the occasion fraction is the demand model's job, not the label's.
- `[OPEN 10b]` Logged-out recipe view: show the all-grey `adult_unspecified`
  what-if, or hide the per-person layer entirely until sign-in? Lean: show it,
  grey, as a gentle invitation (consistent with the panel's existing ethos).

---

## 11. Build sequence (once §10 settled)

1. Extract `<Participants>` from the PlanView avatar pattern (no behaviour
   change on meals — pure refactor, verify PlanView still works).
2. Extend `match` (meal) to return `perParticipant` portion nutrition +
   "% of target" (§8); surface the new layer in `MealFitPanel`.
3. Wire "% of target" into the nutrient quick-look modal (the open enhancement).
4. Recipe what-if: `match` for recipes (route A) + the transient `<Participants>`
   on `/recipes/[slug]` + the panel reading the transient list.
5. Cook-a-recipe-directly: "Cook this" mints a lightweight meal, promotes any
   transient participants, routes to existing cook-setup.
6. Write the per-person nutrition function as "sum applicable components × share"
   (v2 seam in place from the start).

---

## 12. Principle check

- *Everything is one ingredient* — honoured: meal total is one figure; the panel
  never pretends a meal is its parts.
- *Name the seam, don't build the abstraction* — honoured: participant-scoped
  components, allergy checking, chef-skills, per-component plating, connections
  all named, none built in v1; the per-person function carries the v2 seam.
- *System measures & suggests; human names & decides* — honoured: plating and
  "% of target" are suggestions with honest confidence, never verdicts.
