# Soupdog — Meal Ingredient Quantity Aggregation & Qualitative Units v0.1

**Status:** design, pre-build. Touches how quantities are STORED and summed (spine-adjacent).
Grew out of "item 3 — dedupe the meal ingredient list" (the meal list shows the same ingredient
once per dish, e.g. salt twice). The simple dedupe turned out to need a real quantity model.
No code in this doc beyond the minimal-build sketch in §7.

## 1. The problem
A multi-dish meal's ingredient LIST shows the same ingredient once PER DISH, not once total.
Live example (roast-chicken meal): "Salt · to taste" (mash) AND "Salt · 1 pinch" (beans) appear
as two lines. Want: ONE line per ingredient. But the two salts have INCOMPATIBLE quantity
expressions ("to taste" vs "1 pinch") — you cannot naively sum them. So dedupe needs a model of
what a quantity IS, not just string-matching.

## 2. How quantities are stored TODAY (the constraint)
`version_ingredients` holds a flat `{ quantity_value (numeric|null), quantity_unit (text) }`.
"to taste" and "pinch" currently live in `quantity_unit` as FREE TEXT. That is exactly why they
can't sum: a pinch has no magnitude in the data, and "to taste" is indistinguishable from a real
unit. The model below is the fix.

## 3. The model (Rasmus, 2026-06-30)
Three ideas, in order:

### 3a. One line per ingredient — always
The meal ingredient list dedupes by INGREDIENT IDENTITY (the resolved `ingredients.id`, per the
identity-resolution work). Every contributing dish's amount of that ingredient collapses to one
line. This is the agreed, unconditional part.

### 3b. "Pinch" is a REAL quantity with a magnitude
A pinch is approximately a measurable mass (conventionally ~0.3–0.4 g). So it is NOT a vague
word — it is a unit with a small magnitude. Consequence: many small amounts across a large meal
SUM to something measurable. 10 pinches ≈ 3 g. A catering-scale recipe with 40 "pinch" salts is
~12 g — real, showable. So pinch participates in summing like any mass unit.

### 3c. "To taste" is the genuinely UNQUANTIFIED one
"To taste" is not a magnitude — it is "the cook decides." It cannot sum to a number. It stays
qualitative no matter how many dishes contribute it.

### 3d. Display rule: precise when big enough, generic when small
Sum the real magnitudes (3b) in a common base unit. Then at DISPLAY time:
- total ≥ a threshold → show the precise summed amount ("3 g", or converted "about ½ tsp").
- total < threshold → show a GENERIC description ("a pinch", "a small amount") rather than a
  falsely-precise "0.6 g". Small-but-real amounts read as words, not spurious decimals.
So a quantity is stored precisely and only BECOMES vague at display when the total is genuinely
small. This is the inverse of today (vague in storage, can't sum).

## 4. What this requires (the real work)
1. **A quantity TYPE distinction** in the data: a quantity is either
   - MAGNITUDE (value + a real unit, incl. `pinch` as a small-mass unit) — sums; or
   - QUALITATIVE (`to taste`, `as needed`) — no magnitude, never sums, stays as its phrase.
   Decision: how to represent this. Lean: keep `quantity_value`/`quantity_unit`, but treat a
   small set of unit strings (`to taste`, `as needed`) as the QUALITATIVE sentinel set
   (value null), and promote `pinch` to a known MAGNITUDE unit with a conversion (3b). Avoids a
   schema change if the sentinel set + the unit table carry the meaning. [OPEN §6.1]
2. **A unit → base-unit conversion table** so compatible magnitudes sum in one base (mass→g,
   volume→ml). `pinch → ~0.35 g`, `tsp → 5 ml` / `~5 g` for salt-like, etc. This is the SAME
   conversion infrastructure the metric/imperial display layer needs — they should share it,
   not each invent one. [OPEN §6.2: where the table lives; per-ingredient density for
   mass↔volume is a deeper rabbit hole — see §6.4.]
3. **An aggregation function** over a meal's `version_ingredients`: group by ingredient id;
   partition each group into magnitude vs qualitative; sum magnitudes in base unit; produce one
   display line: summed magnitude (precise or generic by threshold) AND, if any qualitative
   contributions exist, append/merge the qualitative note ("plus to taste"). [OPEN §6.3]
4. **The small-amount threshold + generic vocabulary** ("a pinch" / "a small amount" / "a
   dash"). [OPEN §6.5]

## 5. Relationship to other work (name the seams)
- **Identity resolution** (Ingredient_Resolution_Upstream doc): aggregation groups by the SAME
  resolved ingredient id the merge uses. The list dedupe is the DISPLAY-side companion to the
  graph-side merge — different layers, same identity key. (Graph merges shared PREP; list sums
  shared QUANTITIES; both keyed on ingredient id.)
- **Metric/imperial display layer** (scoped separately, not yet built): owns the conversion
  table this needs (§4.2). Build the table ONCE, shared. If that layer is built first, this
  consumes it; if this is built first, it seeds the table.
- **Mixed units within one ingredient** (e.g. "1 tsp" + "1 pinch" salt): both mass-ish, sum in
  grams via the table. "100 ml milk" + "1 cup milk": both volume, sum in ml. Cross-kind
  (mass + volume of the same ingredient) needs density — defer (§6.4).

## 6. [OPEN] decisions to settle before building the FULL model
1. Quantity-type representation: sentinel-set + unit-table (no schema change) vs a new
   `quantity_kind` column (magnitude/qualitative). Lean: sentinel-set first, column only if it
   gets messy.
2. Where the unit→base conversion table lives (shared with metric/imperial layer).
3. Display when a group has BOTH magnitude and qualitative contributions (e.g. "1 pinch" + "to
   taste"): show summed magnitude + "(plus to taste)"? Or qualitative wins? Lean: show the
   magnitude, append "plus to taste" only if a qualitative contribution exists.
4. Mass↔volume conversion needs per-ingredient density — big rabbit hole. DEFER: only sum
   WITHIN a measurement kind (mass with mass, volume with volume); if a group mixes kinds, list
   the two subtotals rather than forcing a conversion.
5. Small-amount threshold value + the generic vocabulary set.
6. Does aggregation also apply to the per-DISH lists, or only the meal-level combined list?
   (Lean: only the meal-level combined list; per-dish stays as authored.)

## 7. Minimal first build (ship the 80% now, full model later)
Do NOT block the visible fix on the full model. A minimal aggregation that ships now:
- Group the meal ingredient list by resolved ingredient id → ONE line per ingredient (3a — the
  whole visible win).
- If all contributions share the SAME unit and all have numeric values → SUM them ("salt 1 tsp"
  + "salt 1 tsp" → "salt 2 tsp").
- If units differ OR any contribution is qualitative ("to taste"/"as needed"/null) → show the
  ingredient ONCE with a safe combined display: the qualitative phrase if all qualitative, else
  "as needed", else list the distinct amounts. NO cross-unit conversion yet (that's §4.2).
This kills the duplicate-line bug immediately and is forward-compatible: when the conversion
table + pinch-magnitude land, the same aggregation function gains real summing without changing
its call sites.

## 8. Sequencing
1. (now, optional) Minimal §7 build — dedupe + same-unit sum. Removes the visible bug.
2. Settle §6 opens (esp. 6.1 representation, 6.2 conversion-table home).
3. Build the conversion table (shared with metric/imperial).
4. Promote pinch to a magnitude unit; wire qualitative sentinels; full aggregation per §4.
5. Threshold + generic vocabulary (§6.5).
