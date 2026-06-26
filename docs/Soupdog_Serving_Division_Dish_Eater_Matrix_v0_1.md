# Soupdog — Serving Division: the Dish × Eater Matrix (v0.1)

**Status:** design-first. Supersedes the "plating section / plating-tag-as-mode"
thinking from the same session. Records the full model reasoned through with Rasmus,
the buildable-now v1, and the dependency on composition + variation.

---

## 1. The real question is NOT "plated vs shared" — it's "who gets each dish, and how is it split"

"Plated" conflates two different things: (a) *served elegantly* (you plate a shared
dish nicely too) and (b) *individually portioned per eater*. The actual question is
**"is this dish shared among these eaters, or does each get their own — and which
eaters get it at all?"**

This is a **matrix**:
- **rows** = dishes / components (main, side, the wine, the soda)
- **columns** = eaters
- **cells** = EMPTY (this eater doesn't get this dish) OR a **share** (gets it, this
  much)

"Shared" and "individual" become *readings* of the matrix, not a flag:
- a dish all eaters get, split evenly → reads as "shared"
- a dish split unevenly, or given to a subset → reads as "individual / targeted"

## 2. Membership is the crux — the drinks case forced it out

Two parents + two kids: parents drink wine, kids drink soda. The wine is **not shared
among all four** — it's *for the two parents*. So a component does not go to "everyone,
split by share"; it goes to a **subset of eaters**, split by share within that subset.
"Plated" is meaningless for drinks. The cell must be able to be **empty** (eater
doesn't get this dish). Single-axis "share of the whole meal per person" cannot express
this; the matrix (membership + share per cell) can.

Also handles: an allergen-avoider skips a component; a kid skips the spicy dish.

## 3. It lives UNDER the people section, shown only with ≥2 eaters

One eater → no sharing question, no division, nothing to show. The whole surface only
exists with **≥2 people**, so it belongs **with the people** (a sub-section of the
"Who's eating" area), where the cook can **see/check who gets each dish**.

## 4. Serve-style is a VARIATION AXIS, not a toggle (the key principle)

**Flipping a dish shared ↔ individual is technically a DIFFERENT RECIPE.** A pot of
curry served family-style and the same curry plated into four portions are different
**end-products** (different final task, different presentation) — and Soupdog's spine
is "one recipe = one end-product; change the end-product = a different recipe."

So shared-vs-individual is a **variation axis** (like doneness, thickness, servings),
NOT a display toggle that mutates a recipe in place. Committing "plate individually"
vs "serve shared" = **selecting / creating an `execution_variant`**. This rides the
existing variation machinery (scaling-as-variation) — no new mutate-in-place mechanism.
A "shared?" checkbox that edits the recipe in place would be the WRONG model.

## 5. Depends on composition (rows = dishes) — so the full matrix is built AFTER

The matrix's rows are dishes/components. A recipe with main + wine + soda is a
**composed** recipe — which needs **recipe-native composition** (the deferred "add
dishes to a recipe" work). Today a recipe is mostly ONE dish, so the matrix has one
row. The full matrix (membership + multi-dish + drinks) is built **after composition
+ per-eater membership data exist.**

New data the full version needs (named, not built): a per-(component, eater)
**membership + share** — beyond the single overall share we compute today. This is the
demand model's per-component fan-out (Phase 4) plus an explicit membership bit.

## 6. v1 buildable NOW — the single-dish degenerate case

Today's recipes are mostly one dish, so v1 = **the per-person share of that one dish**,
shown **under the people section** when **≥2 eaters differ**. No matrix UI (one row
isn't a matrix), no membership (everyone gets the one dish). Content = the shares we
ALREADY compute (honest text: "Rasmus — the larger, more generous helping; Natasha —
a neater, smaller portion"). This is the one-row degenerate case of §1's matrix; it
grows into the matrix when composition lands, without rework.

Framing = **soft cook guidance**, not a false-precision instruction ("roughly who needs
more"), suiting estimated data and the common shared-home-meal case.

## 7. The plating tag is technique metadata — NOT the shared/individual signal

`category = 'plating'` (shipped) marks tasks that are *teachable plating technique*
(ladle vs splash-pour; fan the slices) — for the Techniques page / a future "Learn to
plate" course. It is **explicitly NOT** the shared-vs-individual detector: "garnish the
shared platter" is a plating technique on a SHARED dish (the taco case). Conflating the
two was a v1 shortcut we REJECTED. Serve-style comes from §4 (variation), not the tag.

## 8. Build sequence
1. **(now)** v1 single-dish per-person share under the people section, ≥2 differ (§6).
2. **(after composition)** matrix rows = dishes; show who-gets-what per dish.
3. **(after demand Phase 4 + membership)** per-component shares + membership cells
   (the drinks case); shared↔individual as selectable variants (§4).

## 9. [OPEN]
- Membership representation: a per-(component, eater) table vs riding participant rows.
- How serve-style variants are minted (auto on toggle vs explicit) — ties to the
  variation-system build.
- Whether the matrix is also where a cook ASSIGNS who-gets-what (input) vs only views
  the recommendation (output).
