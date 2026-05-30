-- ═══════════════════════════════════════════════════════════════
--  Soupdog — Migration v5: Drop product_cooking_profiles
--
--  product_cooking_profiles is replaced by regular recipes.
--  A "cooking profile" for a product is just a recipe that uses
--  that ingredient as its primary input.
--
--  The coverage_matrix view is updated to query recipes that
--  have a single packaged ingredient, grouped by appliance.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Drop product_cooking_profiles ─────────────────────────

drop policy if exists "Public read product_cooking_profiles"           on product_cooking_profiles;
drop policy if exists "Authenticated insert product_cooking_profiles"  on product_cooking_profiles;
drop policy if exists "Users can insert product_cooking_profiles"      on product_cooking_profiles;

drop table if exists product_cooking_profiles cascade;


-- ── 2. Recreate coverage_matrix ──────────────────────────────
-- Now queries recipes whose primary ingredient is a product,
-- grouped by appliance used in version_equipment.
-- Shows which product × appliance combinations have recipes.

drop view if exists coverage_matrix cascade;

create view coverage_matrix as
  select
    i.id            as ingredient_id,
    i.name          as product_name,
    i.brand         as product_brand,
    i.barcode,
    e.id            as equipment_id,
    e.name          as equipment_name,
    count(distinct rc.id) as recipe_count,
    max(rc.updated_at)    as latest_recipe_at,
    bool_or(rc.is_published) as has_published_recipe
  from ingredients i
  -- find recipe versions that use this product as an ingredient
  join version_ingredients vi
    on vi.ingredient_id = i.id
  join recipe_versions rv
    on rv.id = vi.version_id
  join recipe_canonicals rc
    on rc.id = rv.canonical_id
  -- find equipment used in those recipe versions
  join version_equipment ve
    on ve.version_id = rv.id
  join equipment e
    on e.id = ve.equipment_id
  where i.is_product = true
  group by i.id, i.name, i.brand, i.barcode, e.id, e.name;

grant select on coverage_matrix to anon, authenticated;


-- ── 3. Re-grant search_index (recreated in v4) ───────────────
grant select on search_index to anon, authenticated;


-- ═══════════════════════════════════════════════════════════════
--  DONE
--
--  product_cooking_profiles is gone.
--  Cooking instructions for products = regular recipes.
--  coverage_matrix now queries recipes + version_equipment.
--
--  App changes after this migration:
--  - Remove /api/my/products/[id]/profiles routes
--  - Simplify /my/products/new to ingredient metadata only
--  - Product page shows linked recipes instead of profiles
-- ═══════════════════════════════════════════════════════════════
