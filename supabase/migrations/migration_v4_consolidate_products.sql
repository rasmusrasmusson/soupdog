-- ═══════════════════════════════════════════════════════════════
--  Soupdog — Migration v4: Consolidate products into ingredients
--
--  Products and ingredients are the same ontological category.
--  A Nestlé water bottle is a child of "water" in the ingredient
--  taxonomy. This migration:
--
--  1. Adds product-specific columns to ingredients
--  2. Migrates any existing product rows into ingredients
--  3. Retargets product_cooking_profiles to ingredients
--  4. Drops the products table
--  5. Updates the coverage_matrix and search_index views
--
--  Safe to run: uses IF NOT EXISTS / IF EXISTS throughout.
--  No data loss: migrates before dropping.
-- ═══════════════════════════════════════════════════════════════


-- ── 1. Add product-specific columns to ingredients ────────────
-- These are only populated for is_product = true nodes.
-- Generic ingredient nodes leave them null.

alter table ingredients
  add column if not exists is_product          boolean not null default false,
  -- true = a specific packaged SKU or branded product
  -- false = a generic ingredient node in the taxonomy

  add column if not exists brand               text,
  add column if not exists barcode             text,
  add column if not exists net_weight_g        numeric(8,2),
  add column if not exists serving_size_g      numeric(8,2),
  add column if not exists packaging_type      text,
  -- 'bottle' | 'can' | 'bag' | 'box' | 'loose' | 'frozen_bag' | 'tray' etc.

  add column if not exists producer            text,
  add column if not exists country_of_origin   text,
  add column if not exists ingredient_list     text,
  -- raw ingredient list text from packaging

  add column if not exists additives           text[],

  add column if not exists off_id              text,
  -- Open Food Facts product ID for sync

  add column if not exists base_state          text,
  -- typical storage state: 'frozen' | 'refrigerated' | 'ambient'
  add column if not exists base_temp_celsius   numeric(5,2),
  -- typical storage temperature as a number (e.g. -18 for frozen)

  add column if not exists linked_canonical_id uuid references recipe_canonicals(id);
  -- if this ingredient IS a recipe output (e.g. homemade stock)

-- Unique constraint on barcode (sparse — only for is_product rows)
create unique index if not exists ingredients_barcode_unique
  on ingredients(barcode) where barcode is not null;

create unique index if not exists ingredients_off_id_unique
  on ingredients(off_id) where off_id is not null;


-- ── 2. Migrate existing product rows into ingredients ─────────
-- Only runs if the products table still has rows.
-- Maps products → ingredients preserving all data.

do $$
begin
  if exists (select 1 from products limit 1) then
    insert into ingredients (
      id, slug, name, description,
      category,
      is_product,
      brand, barcode, net_weight_g, serving_size_g,
      ingredient_list, allergens, additives,
      nutrition_per_100g,
      off_id,
      is_verified,
      source, confidence,
      base_state, base_temp_celsius,
      linked_canonical_id,
      created_at, updated_at
    )
    select
      p.id,
      p.slug,
      p.name,
      p.description,
      'other'::ingredient_category,   -- default; can be recategorised
      true,                           -- is_product = true
      p.brand,
      p.barcode,
      p.weight_g,                     -- from v3 migration
      p.serving_size_g,
      p.ingredient_list,
      p.allergens,
      p.additives,
      p.nutrition_per_100g,
      p.openfoodfacts_id,
      p.is_verified,
      coalesce(p.source, 'human_authored'),
      coalesce(p.confidence, 1.0),
      p.base_state,
      p.base_temp_celsius,
      p.linked_canonical_id,
      p.created_at,
      p.updated_at
    from products p
    on conflict (id) do nothing;

    raise notice 'Migrated % product rows into ingredients', (select count(*) from products);
  else
    raise notice 'products table is empty — nothing to migrate';
  end if;
end $$;


-- ── 3. Retarget product_cooking_profiles → ingredients ────────

-- Add new FK column pointing to ingredients
alter table product_cooking_profiles
  add column if not exists ingredient_id uuid references ingredients(id) on delete cascade;

-- Populate from existing product_id (for any migrated rows)
update product_cooking_profiles
set ingredient_id = product_id
where ingredient_id is null and product_id is not null;

-- Once backfilled, drop the old FK
-- (We keep product_id temporarily until the app code is updated,
--  then drop in a later migration)


-- ── 4. Drop the products table ────────────────────────────────
-- Only safe after migration above. The CASCADE drops dependent
-- objects (indexes, policies) but NOT product_cooking_profiles
-- since we've already moved the FK.

-- First drop any RLS policies on products
drop policy if exists "Public read products"    on products;
drop policy if exists "Authenticated write products" on products;
drop policy if exists "Users can insert products"    on products;
drop policy if exists "Users can update own products" on products;

-- Drop the table (no cascade needed — product_cooking_profiles
-- now points to ingredients, not products)
drop table if exists products;


-- ── 5. Update product_cooking_profiles ───────────────────────
-- Make ingredient_id not null now that it's the primary FK

-- Note: only run this after confirming all rows have ingredient_id set
-- Skipping NOT NULL constraint for now to avoid breaking empty tables
-- Add it manually after verifying: ALTER TABLE product_cooking_profiles
-- ALTER COLUMN ingredient_id SET NOT NULL;


-- ── 6. Recreate coverage_matrix view ─────────────────────────
-- Now queries ingredients where is_product = true

drop view if exists coverage_matrix cascade;

create view coverage_matrix as
  select
    i.id          as ingredient_id,
    i.name        as product_name,
    i.brand       as product_brand,
    i.barcode,
    e.id          as equipment_id,
    e.name        as equipment_name,
    count(pcp.id) as profile_count,
    max(pcp.confidence) as best_confidence,
    bool_or(pcp.source = 'human_authored') as has_human_profile,
    max(pcp.created_at) as latest_profile_at
  from ingredients i
  cross join equipment e
  left join product_cooking_profiles pcp
    on pcp.ingredient_id = i.id
    and (pcp.equipment_id = e.id or
         pcp.appliance_profile_id in (
           select id from appliance_profiles where equipment_id = e.id
         ))
  where i.is_product = true
  and (e.connected = true or e.category = 'oven' or e.category = 'appliance')
  group by i.id, i.name, i.brand, i.barcode, e.id, e.name;


-- ── 7. Recreate search_index view ────────────────────────────
-- Products now surface as ingredients with is_product = true
-- They get a separate 'product' type in search results

drop view if exists search_index cascade;

create view search_index as
  -- Published recipes
  select
    rc.id, rc.slug, 'recipe' as type, rv.title,
    to_tsvector('english',
      rv.title || ' ' ||
      coalesce(rv.description,'') || ' ' ||
      coalesce(rv.cuisine,'') || ' ' ||
      coalesce(array_to_string(rv.tags,' '),'')
    ) as tsv
  from recipe_canonicals rc
  join recipe_versions rv on rv.id = rc.current_version_id
  where rc.is_published = true

  union all

  -- Generic ingredients (not products)
  select
    id, slug, 'ingredient' as type, name as title,
    to_tsvector('english', name || ' ' || coalesce(description,'')) as tsv
  from ingredients
  where is_product = false

  union all

  -- Packaged products (is_product = true)
  select
    id, slug, 'product' as type,
    coalesce(brand || ' ', '') || name as title,
    to_tsvector('english',
      name || ' ' ||
      coalesce(brand,'') || ' ' ||
      coalesce(description,'') || ' ' ||
      coalesce(barcode,'')
    ) as tsv
  from ingredients
  where is_product = true

  union all

  -- Equipment
  select
    id, slug, 'equipment' as type, name as title,
    to_tsvector('english',
      name || ' ' ||
      coalesce(description,'') || ' ' ||
      coalesce(brand,'')
    ) as tsv
  from equipment

  union all

  -- Tasks
  select
    id, slug, 'task' as type, name as title,
    to_tsvector('english',
      name || ' ' ||
      coalesce(description,'') || ' ' ||
      coalesce(task_family,'')
    ) as tsv
  from tasks;

-- Re-grant after view recreation
grant select on search_index    to anon, authenticated;
grant select on coverage_matrix to anon, authenticated;


-- ── 8. RLS for updated product_cooking_profiles ───────────────

-- Public read
drop policy if exists "Public read product_cooking_profiles" on product_cooking_profiles;
create policy "Public read product_cooking_profiles"
  on product_cooking_profiles for select using (true);

-- Authenticated write
drop policy if exists "Authenticated insert product_cooking_profiles" on product_cooking_profiles;
create policy "Authenticated insert product_cooking_profiles"
  on product_cooking_profiles for insert
  with check (auth.uid() = created_by);


-- ── 9. Helpful index for product browsing ─────────────────────

create index if not exists ingredients_is_product_idx
  on ingredients(is_product) where is_product = true;

create index if not exists ingredients_brand_idx
  on ingredients(brand) where brand is not null;


-- ═══════════════════════════════════════════════════════════════
--  DONE
--
--  After running this migration:
--
--  - ingredients table is the single source of truth for all
--    food entities: generic ingredients AND packaged products
--  - is_product = true marks specific packaged SKUs
--  - product_cooking_profiles now references ingredient_id
--  - coverage_matrix queries ingredients where is_product = true
--  - search_index returns 'ingredient' or 'product' type
--  - products table has been dropped
--
--  App code changes needed after this migration:
--  - /api/my/products/* routes: query ingredients where is_product=true
--  - product_cooking_profiles inserts: use ingredient_id not product_id
--  - Public /products/[slug] page: query ingredients where is_product=true
-- ═══════════════════════════════════════════════════════════════
