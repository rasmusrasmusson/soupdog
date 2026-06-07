# Soupdog — The Intermediate Catalogue as a Commercial Asset (forward-pointer, v0.1)

**Status:** STRATEGIC forward-pointer, NOT a build. Records what the recipe-graph
architecture UNLOCKS commercially, so the value is captured without pulling it into
current scope. Depends on: atomic decomposition (v0.3) producing catalogued,
referenced, usage-countable intermediates (group outputs / sub-recipes).

## The mechanic that makes this possible
Once decomposition runs (v0.3), GROUPS produce **intermediates** that are first-class,
catalogued, REFERENCED, and therefore USAGE-COUNTABLE:
- intermediate = a result-ingredient produced by a sub-recipe
  (`ingredients.transformation_recipe_id` → `version_sub_recipes`).
- "chopped red onion 200g", "ginger-garlic paste", "basic tomato sauce" are entities
  referenced by N recipes / used by M users — and we can COUNT that.

That usage count is the asset. Three things fall out of it for free (no separate
system — read off the reference graph):

## 1. Consumer upsell — replace-the-prep
A user whose recipes/plans frequently reference an intermediate is demonstrably doing
that prep often. Surface a prepared product that REPLACES the from-scratch step:
- "You chop a lot of red onion — buy pre-chopped / frozen." (Then, via the MCP/connector
  layer, optionally offer to order it.)
- Mechanic: a prepared product is an `ingredient`/`product` (existing `products` table,
  barcode / Open Food Facts work) that SUBSTITUTES for an intermediate sub-recipe.
  "You make X from scratch; product Y replaces that step." The intermediate-usage data
  IS the targeting signal — no profiling needed beyond what the graph already records.
- Ad-policy note: any promotion must respect that Anthropic/Soupdog don't inject paid
  placements into Claude's responses; this is Soupdog's own product surfacing to its own
  users, framed as a genuine convenience, not an injected ad.

## 2. B2B product-development signal (the valuable one)
Aggregate across ALL users: which intermediates are most-produced-FROM-SCRATCH?
That is a demand-ranked list of "preparations people repeatedly do by hand" =
**prepared-food product opportunities**, backed by real usage data.
- A food company asking "what prepared product should we develop?" → Soupdog answers
  empirically: e.g. "ginger-garlic paste appears in 40% of Indian recipes and is made
  from scratch 90% of the time → unmet demand for a good shelf-stable version."
- This is the SAME demand-model machinery designed for fork-requests (Content
  Provisioning & Demand docs), just measuring INTERMEDIATE-PRODUCTION instead of
  recipe-requests. A sellable insight product for food-company customers.

## 3. Catalogue compounding (already in decomposition v0.3)
Shared intermediates curated once, referenced everywhere; the more recipes uploaded,
the richer and more re-used the intermediate catalogue — which also makes #1 and #2
sharper (more usage data, better signal).

## Why capture, not build
The architecture PRODUCES this as a byproduct of atomic decomposition + the reference
graph + usage counting. Building the upsell UI or the B2B insights product now would be
building ahead of the foundation (decomposition isn't built yet, no users yet). Record
the vision; build when decomposition is live and there's usage to read. Discipline:
note the destination, don't drive there early.

## Dependencies before any of this is real
- Atomic decomposition LIVE (v0.3) → intermediates actually get catalogued + referenced.
- Usage volume → counts mean something.
- Substitution links: a prepared `product` mapped to the intermediate it replaces.
- (B2B) an aggregation/insights surface; (consumer) a surfacing UI + the connector/order
  path.
