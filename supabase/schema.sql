-- ═══════════════════════════════════════════════════════════════
--  Soupdog — PostgreSQL Schema v2
--  Changes from v1:
--  - recipe_canonicals table (identity anchor)
--  - recipes table becomes recipe_versions
--  - ingredients: nutrition columns, taxonomy fields
--  - products table (packaged/prepared foods)
--  - product_cooking_profiles (appliance-specific instructions)
--  - appliance_profiles (per-user calibrated appliance data)
--  - nutrition_profiles (user + household members)
--  - flavor_preferences
--  - inventory
--  - recipe_translations
--  - preference_axes + variant_preference_mappings
--  - All existing tables preserved and FK-updated
-- ═══════════════════════════════════════════════════════════════

-- ── Extensions ───────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";

-- ── Enums ─────────────────────────────────────────────────────
create type difficulty_level    as enum ('trivial','easy','medium','hard','expert');
create type food_state          as enum ('frozen','refrigerated','room_temp','hot','thawed_partial','dried','fermented','cured');
create type step_type           as enum ('human','machine','passive');
create type unit_system         as enum ('si','imperial','us');
create type equipment_category  as enum ('oven','knife','pan','scale','mixer','appliance','thermometer','other');
create type ingredient_category as enum ('vegetable','fruit','meat','fish','dairy','grain','spice','herb','oil','liquid','condiment','prepared','other');
create type recipe_source       as enum ('human_authored','ai_known_dish','ai_generated','imported');
create type inventory_state     as enum ('in_stock','low','out_of_stock','expired');

-- ═══════════════════════════════════════════════════════════════
--  INGREDIENTS
-- ═══════════════════════════════════════════════════════════════

create table ingredients (
  id                        uuid primary key default uuid_generate_v4(),
  slug                      text not null unique,
  name                      text not null,
  description               text,
  category                  ingredient_category not null default 'other',

  -- Taxonomy / transformation graph
  transformed_from_id       uuid references ingredients(id),
  transformation_recipe_id  uuid,  -- FK added after recipes table

  -- Nutrition (USDA FoodData Central values, per 100g)
  nutrition_per_100g        jsonb,  -- NutritionData shape
  nutrition_source          text,   -- 'usda', 'calculated', 'lab_tested', 'manufacturer'
  nutrition_updated_at      timestamptz,

  allergens                 text[],
  season                    text[],   -- months when in season, e.g. ['jun','jul','aug']
  storage_notes             text,
  typical_unit              text,     -- most common unit for this ingredient, e.g. 'g', 'ml', 'clove'

  is_verified               boolean not null default false,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index ingredients_slug_idx     on ingredients(slug);
create index ingredients_name_trgm    on ingredients using gin(name gin_trgm_ops);
create index ingredients_category_idx on ingredients(category);
create index ingredients_parent_idx   on ingredients(transformed_from_id);

-- ═══════════════════════════════════════════════════════════════
--  EQUIPMENT
-- ═══════════════════════════════════════════════════════════════

create table equipment (
  id           uuid primary key default uuid_generate_v4(),
  slug         text not null unique,
  name         text not null,
  category     equipment_category not null default 'other',
  description  text,
  brand        text,
  model_number text,
  connected    boolean not null default false,
  capabilities jsonb,   -- ApplianceCapability[]
  created_at   timestamptz not null default now()
);
create index equipment_slug_idx     on equipment(slug);
create index equipment_category_idx on equipment(category);

-- ── Per-user calibrated appliance profiles ────────────────────
create table appliance_profiles (
  id                          uuid primary key default uuid_generate_v4(),
  user_id                     uuid not null references auth.users(id) on delete cascade,
  equipment_id                uuid not null references equipment(id),
  nickname                    text,
  -- Measured thermal characteristics
  heatup_speed_celsius_per_min numeric(6,2),
  thermal_precision_celsius    numeric(4,2),
  humidity_precision_pct       numeric(4,2),
  cavity_volume_litres         numeric(5,2),
  thermal_overshoot_celsius    numeric(4,2),
  notes                        text,
  calibrated_at                timestamptz,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  unique (user_id, equipment_id)
);
create index appliance_profiles_user_idx on appliance_profiles(user_id);

-- ═══════════════════════════════════════════════════════════════
--  PRODUCTS (packaged / prepared foods)
-- ═══════════════════════════════════════════════════════════════

create table products (
  id                  uuid primary key default uuid_generate_v4(),
  slug                text not null unique,
  name                text not null,
  brand               text,
  barcode             text unique,
  description         text,

  -- Ingredient composition
  ingredient_list     text,    -- raw text from packaging
  allergens           text[],
  additives           text[],

  -- Nutrition (as printed on pack, per 100g)
  nutrition_per_100g  jsonb,
  serving_size_g      numeric(8,2),

  -- Source / data quality
  openfoodfacts_id    text,    -- OFF product ID for sync
  data_source         text,    -- 'openfoodfacts','manufacturer','user','lab_tested'
  is_verified         boolean not null default false,

  created_by          uuid references auth.users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index products_slug_idx    on products(slug);
create index products_barcode_idx on products(barcode);
create index products_name_trgm   on products using gin(name gin_trgm_ops);

-- ── Appliance-specific cooking profiles for products ─────────
-- This is where Soupdog generates genuinely unique data.
-- Each row = one user's result cooking this product on this appliance.
create table product_cooking_profiles (
  id                    uuid primary key default uuid_generate_v4(),
  product_id            uuid not null references products(id) on delete cascade,
  appliance_profile_id  uuid references appliance_profiles(id),
  equipment_id          uuid references equipment(id),  -- generic fallback if no calibrated profile

  -- Starting state
  food_state            food_state not null default 'frozen',
  initial_temp_celsius  numeric(5,2),  -- null = unknown / as-packaged

  -- Execution
  method                text not null,  -- 'convection','microwave','steam','air_fry', etc.
  temperature_celsius   numeric(6,2),
  duration_seconds      integer,
  power_watts           integer,        -- for microwave
  notes                 text,

  -- Result quality (user-reported)
  outcome_rating        smallint check (outcome_rating between 1 and 5),
  outcome_notes         text,

  -- Source
  source                text not null default 'user',  -- 'manufacturer','user','ai_inferred'
  is_verified           boolean not null default false,

  created_by            uuid references auth.users(id),
  created_at            timestamptz not null default now()
);
create index product_cooking_profiles_product_idx on product_cooking_profiles(product_id);

-- ═══════════════════════════════════════════════════════════════
--  RECIPE IDENTITY LAYER
-- ═══════════════════════════════════════════════════════════════

-- Canonical anchor — stable identity regardless of version
create table recipe_canonicals (
  id                   uuid primary key default uuid_generate_v4(),
  slug                 text not null unique,
  current_version_id   uuid,  -- FK set after recipe_versions created
  author_id            uuid references auth.users(id),
  is_published         boolean not null default true,
  source               recipe_source not null default 'human_authored',
  confidence_score     numeric(3,2),  -- 0.0-1.0, null = unscored
  created_at           timestamptz not null default now()
);
create index recipe_canonicals_slug_idx    on recipe_canonicals(slug);
create index recipe_canonicals_author_idx  on recipe_canonicals(author_id);

-- Versioned recipe content — immutable once published
create table recipe_versions (
  id                    uuid primary key default uuid_generate_v4(),
  canonical_id          uuid not null references recipe_canonicals(id) on delete cascade,
  parent_version_id     uuid references recipe_versions(id),
  version_number        integer not null default 1,
  change_summary        text,

  title                 text not null,
  description           text,
  cuisine               text,
  tags                  text[],
  base_servings         integer not null default 4,
  difficulty            difficulty_level not null default 'medium',
  total_time_seconds    integer not null,
  active_time_seconds   integer,
  passive_time_seconds  integer,
  yield_description     text,
  required_food_state   food_state,

  -- Nutrition stored at version level; variant overrides via execution_variants
  nutrition_per_serving jsonb,

  is_canonical_version  boolean not null default true,
  created_at            timestamptz not null default now(),

  unique (canonical_id, version_number)
);
create index recipe_versions_canonical_idx on recipe_versions(canonical_id);
create index recipe_versions_parent_idx    on recipe_versions(parent_version_id);
create index recipe_versions_title_trgm    on recipe_versions using gin(title gin_trgm_ops);
create index recipe_versions_cuisine_idx   on recipe_versions(cuisine);
create index recipe_versions_tags_idx      on recipe_versions using gin(tags);

-- Back-fill current_version_id FK
alter table recipe_canonicals
  add constraint fk_current_version
  foreign key (current_version_id) references recipe_versions(id);

-- ── Version steps ─────────────────────────────────────────────
create table version_steps (
  id                   uuid primary key default uuid_generate_v4(),
  version_id           uuid not null references recipe_versions(id) on delete cascade,
  order_index          integer not null,
  step_type            step_type not null default 'human',
  instruction          text not null,
  duration_seconds     integer,
  temperature_celsius  numeric(6,2),
  notes                text,
  group_label          text,         -- e.g. 'Marinade', 'Char chicken'
  is_parallel_prev     boolean not null default false,
  parallel_group_id    uuid,
  unique (version_id, order_index)
);
create index version_steps_version_idx on version_steps(version_id);

-- ── Step → ingredient refs ────────────────────────────────────
create table version_step_ingredients (
  id            uuid primary key default uuid_generate_v4(),
  step_id       uuid not null references version_steps(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id),
  order_index   int not null default 0
);
create index version_step_ingredients_step_idx on version_step_ingredients(step_id);

-- ── Version ingredients ───────────────────────────────────────
create table version_ingredients (
  id              uuid primary key default uuid_generate_v4(),
  version_id      uuid not null references recipe_versions(id) on delete cascade,
  ingredient_id   uuid not null references ingredients(id),
  quantity_value  numeric(10,4) not null,
  quantity_unit   text not null,
  food_state      food_state,
  prep_note       text,
  optional        boolean not null default false,
  order_index     integer not null,
  unique (version_id, order_index)
);
create index version_ingredients_version_idx     on version_ingredients(version_id);
create index version_ingredients_ingredient_idx  on version_ingredients(ingredient_id);

-- ── Version equipment ─────────────────────────────────────────
create table version_equipment (
  id           uuid primary key default uuid_generate_v4(),
  version_id   uuid not null references recipe_versions(id) on delete cascade,
  equipment_id uuid not null references equipment(id),
  required     boolean not null default true,
  alternatives text[],
  unique (version_id, equipment_id)
);

-- ── Sub-recipe links ──────────────────────────────────────────
create table version_sub_recipes (
  id                       uuid primary key default uuid_generate_v4(),
  parent_version_id        uuid not null references recipe_versions(id) on delete cascade,
  child_canonical_id       uuid not null references recipe_canonicals(id),
  child_version_id         uuid references recipe_versions(id),
  used_as_ingredient_label text,
  expand_by_default        boolean not null default false,
  optional                 boolean not null default false,
  unique (parent_version_id, child_canonical_id)
);

-- ── Ingredient transformation FK (now recipe_versions exists) ─
alter table ingredients
  add constraint fk_transformation_recipe
  foreign key (transformation_recipe_id) references recipe_versions(id);

-- ═══════════════════════════════════════════════════════════════
--  TRANSLATIONS
-- ═══════════════════════════════════════════════════════════════

create table recipe_translations (
  id                 uuid primary key default uuid_generate_v4(),
  version_id         uuid not null references recipe_versions(id) on delete cascade,
  locale             text not null,  -- 'en', 'sv', 'zh', 'ar', etc.
  title              text not null,
  description        text,
  step_instructions  jsonb,          -- {order_index: translated_instruction}
  notes              text,
  translated_by      text not null default 'ai',  -- 'ai', 'human', 'human_reviewed'
  created_at         timestamptz not null default now(),
  unique (version_id, locale)
);
create index recipe_translations_version_idx on recipe_translations(version_id);
create index recipe_translations_locale_idx  on recipe_translations(locale);

-- ═══════════════════════════════════════════════════════════════
--  EXECUTION VARIANTS
-- ═══════════════════════════════════════════════════════════════

create table execution_variants (
  id                      uuid primary key default uuid_generate_v4(),
  version_id              uuid not null references recipe_versions(id) on delete cascade,
  derived_from_variant_id uuid references execution_variants(id),

  -- Parameters that define this variant
  servings                integer not null,
  unit_system             unit_system not null default 'si',
  appliance_profile_id    uuid references appliance_profiles(id),
  food_state_notes        text,   -- e.g. 'pizza thawed 20min'
  environment_notes       text,   -- e.g. 'high altitude kitchen'

  -- Identity
  is_canonical_variant    boolean not null default false,
  is_user_fork            boolean not null default false,
  author_id               uuid references auth.users(id),

  -- Nutrition recalculated for this serving size
  nutrition_per_serving   jsonb,

  created_at              timestamptz not null default now()
);
create index execution_variants_version_idx on execution_variants(version_id);
create index execution_variants_author_idx  on execution_variants(author_id);

-- ── Per-variant ingredient scaling overrides ──────────────────
create table variant_ingredient_scaling (
  id                      uuid primary key default uuid_generate_v4(),
  variant_id              uuid not null references execution_variants(id) on delete cascade,
  version_ingredient_id   uuid not null references version_ingredients(id),
  quantity_value_scaled   numeric(10,4) not null,
  quantity_unit_scaled    text not null,
  actual_food_state       food_state,
  prep_note_override      text,
  ai_scaling_note         text,  -- why AI changed this value, e.g. 'garlic does not scale linearly'
  unique (variant_id, version_ingredient_id)
);

-- ── Per-variant step overrides ────────────────────────────────
create table variant_step_overrides (
  id                          uuid primary key default uuid_generate_v4(),
  variant_id                  uuid not null references execution_variants(id) on delete cascade,
  version_step_id             uuid not null references version_steps(id),
  duration_seconds_override   integer,
  temperature_celsius_override numeric(6,2),
  instruction_override        text,
  appliance_settings          jsonb,
  override_reason             text,
  unique (variant_id, version_step_id)
);

-- ── Preference axes ───────────────────────────────────────────
-- Dimensions along which a recipe can vary (e.g. steak doneness)
create table preference_axes (
  id                   uuid primary key default uuid_generate_v4(),
  canonical_id         uuid not null references recipe_canonicals(id) on delete cascade,
  name                 text not null,        -- 'doneness', 'crust', 'spice_level'
  display_label        text not null,        -- 'How do you like your steak?'
  values               text[] not null,      -- ['rare','medium-rare','medium','well-done']
  default_value        text not null,
  unique (canonical_id, name)
);

create table variant_preference_mappings (
  id                 uuid primary key default uuid_generate_v4(),
  variant_id         uuid not null references execution_variants(id) on delete cascade,
  preference_axis_id uuid not null references preference_axes(id) on delete cascade,
  preference_value   text not null,
  unique (variant_id, preference_axis_id)
);

-- ═══════════════════════════════════════════════════════════════
--  USER DATA
-- ═══════════════════════════════════════════════════════════════

create table user_profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  display_name         text,
  unit_system          unit_system not null default 'si',
  language             text not null default 'en',
  skill_level          difficulty_level,
  allergies            text[],
  dietary_restrictions text[],
  preferred_cuisines   text[],
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.user_profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Nutrition profiles ────────────────────────────────────────
create table nutrition_profiles (
  id                    uuid primary key default uuid_generate_v4(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  household_member_id   uuid,   -- null = the account user themselves
  label                 text,   -- 'Me', 'Partner', 'Child 1'

  -- Goals
  daily_calories_kcal   integer,
  daily_protein_g       numeric(6,1),
  daily_carbs_g         numeric(6,1),
  daily_fat_g           numeric(6,1),
  daily_fiber_g         numeric(6,1),
  daily_sodium_mg       numeric(8,1),

  -- Restrictions
  allergies             text[],
  dietary_restrictions  text[],   -- 'vegan','halal','kosher','low_sugar', etc.
  medical_conditions    text[],   -- 'celiac','diabetes_type2', etc.

  -- Demographics (affects RDA calculations)
  age_years             integer,
  biological_sex        text,
  weight_kg             numeric(5,1),
  height_cm             numeric(5,1),
  activity_level        text,   -- 'sedentary','moderate','active','very_active'

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index nutrition_profiles_user_idx on nutrition_profiles(user_id);

-- ── Flavor preferences ────────────────────────────────────────
create table flavor_preferences (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references auth.users(id) on delete cascade,

  -- Direct preferences (sparse — most users fill in a few)
  liked_cuisines      text[],
  disliked_cuisines   text[],
  liked_ingredients   uuid[],    -- ingredient IDs
  disliked_ingredients uuid[],

  -- Flavor profile (0.0 = dislikes, 1.0 = strongly likes)
  spice_tolerance     numeric(3,2),
  sweet_preference    numeric(3,2),
  sour_preference     numeric(3,2),
  umami_preference    numeric(3,2),
  bitter_tolerance    numeric(3,2),

  -- Texture preferences
  liked_textures      text[],    -- 'crispy','creamy','chewy', etc.
  disliked_textures   text[],

  notes               text,
  updated_at          timestamptz not null default now(),
  unique (user_id)
);

-- ── Household members ─────────────────────────────────────────
create table household_members (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  age          integer,
  allergies    text[],
  restrictions text[],
  created_at   timestamptz not null default now()
);
create index household_members_user_idx on household_members(user_id);

-- ── Inventory ─────────────────────────────────────────────────
create table inventory_items (
  id               uuid primary key default uuid_generate_v4(),
  user_id          uuid not null references auth.users(id) on delete cascade,

  -- What is it?
  ingredient_id    uuid references ingredients(id),
  product_id       uuid references products(id),
  custom_name      text,    -- fallback if not in either table

  -- Current state
  quantity_value   numeric(10,4),
  quantity_unit    text,
  food_state       food_state,
  expiry_date      date,
  opened_at        date,
  location         text,   -- 'fridge','freezer','pantry'

  -- Tracking
  inv_state        inventory_state not null default 'in_stock',
  notes            text,
  added_at         timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index inventory_items_user_idx       on inventory_items(user_id);
create index inventory_items_ingredient_idx on inventory_items(ingredient_id);
create index inventory_items_product_idx    on inventory_items(product_id);

-- ── Saved recipes ─────────────────────────────────────────────
create table saved_recipes (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  canonical_id  uuid not null references recipe_canonicals(id) on delete cascade,
  collection    text,
  notes         text,
  created_at    timestamptz not null default now(),
  unique (user_id, canonical_id)
);
create index saved_recipes_user_idx      on saved_recipes(user_id);
create index saved_recipes_canonical_idx on saved_recipes(canonical_id);

-- ── Ratings ───────────────────────────────────────────────────
create table ratings (
  id                   uuid primary key default uuid_generate_v4(),
  canonical_id         uuid not null references recipe_canonicals(id) on delete cascade,
  version_id           uuid references recipe_versions(id),
  variant_id           uuid references execution_variants(id),
  user_id              uuid not null references auth.users(id) on delete cascade,
  score                smallint not null check (score between 1 and 5),
  skill_level          difficulty_level,
  appliance_profile_id uuid references appliance_profiles(id),
  country              text,
  notes                text,
  created_at           timestamptz not null default now(),
  unique (canonical_id, user_id)
);
create index ratings_canonical_idx on ratings(canonical_id);

-- ── User equipment ────────────────────────────────────────────
create table user_equipment (
  id                   uuid primary key default uuid_generate_v4(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  equipment_id         uuid not null references equipment(id),
  appliance_profile_id uuid references appliance_profiles(id),
  nickname             text,
  registered_at        timestamptz not null default now(),
  unique (user_id, equipment_id)
);
create index user_equipment_user_idx on user_equipment(user_id);

-- ═══════════════════════════════════════════════════════════════
--  LEGACY COMPATIBILITY TABLES
--  Keep old recipe/recipe_ingredients/recipe_steps tables so
--  existing queries don't break while we migrate.
--  These will be removed in a future migration once all
--  queries are updated to use recipe_versions.
-- ═══════════════════════════════════════════════════════════════

create table recipes (
  id                    uuid primary key default uuid_generate_v4(),
  slug                  text not null unique,
  version               integer not null default 1,
  parent_version_id     uuid references recipes(id),
  canonical_id          uuid references recipes(id),
  title                 text not null,
  description           text,
  cuisine               text,
  tags                  text[],
  servings              integer not null default 4,
  difficulty            difficulty_level not null default 'medium',
  total_time_seconds    integer not null,
  active_time_seconds   integer,
  passive_time_seconds  integer,
  yield_description     text,
  nutrition             jsonb,
  required_food_state   food_state,
  author_id             uuid references auth.users(id),
  is_published          boolean not null default true,
  -- Link to new schema
  recipe_version_id     uuid references recipe_versions(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index recipes_slug_idx    on recipes(slug);
create index recipes_cuisine_idx on recipes(cuisine);
create index recipes_tags_idx    on recipes using gin(tags);
create index recipes_title_trgm  on recipes using gin(title gin_trgm_ops);

create table recipe_steps (
  id                   uuid primary key default uuid_generate_v4(),
  recipe_id            uuid not null references recipes(id) on delete cascade,
  order_index          integer not null,
  step_type            step_type not null default 'human',
  instruction          text not null,
  duration_seconds     integer,
  temperature_celsius  numeric(6,2),
  equipment_ids        uuid[],
  notes                text,
  unique (recipe_id, order_index)
);
create index recipe_steps_recipe_idx on recipe_steps(recipe_id);

create table recipe_ingredients (
  id              uuid primary key default uuid_generate_v4(),
  recipe_id       uuid not null references recipes(id) on delete cascade,
  ingredient_id   uuid not null references ingredients(id),
  quantity_value  numeric(10,4) not null,
  quantity_unit   text not null,
  food_state      food_state,
  prep_note       text,
  optional        boolean not null default false,
  order_index     integer not null,
  unique (recipe_id, order_index)
);
create index recipe_ingredients_recipe_idx     on recipe_ingredients(recipe_id);
create index recipe_ingredients_ingredient_idx on recipe_ingredients(ingredient_id);

create table recipe_sub_recipes (
  id                   uuid primary key default uuid_generate_v4(),
  parent_recipe_id     uuid not null references recipes(id) on delete cascade,
  child_recipe_id      uuid not null references recipes(id),
  used_as_ingredient   text,
  optional             boolean not null default false,
  unique (parent_recipe_id, child_recipe_id)
);

create table recipe_equipment (
  id           uuid primary key default uuid_generate_v4(),
  recipe_id    uuid not null references recipes(id) on delete cascade,
  equipment_id uuid not null references equipment(id),
  required     boolean not null default true,
  alternatives text[],
  unique (recipe_id, equipment_id)
);

create table step_ingredient_refs (
  id            uuid primary key default gen_random_uuid(),
  step_id       uuid not null references recipe_steps(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id),
  order_index   int not null default 0
);
create index step_ingredient_refs_step_idx on step_ingredient_refs(step_id);

-- ═══════════════════════════════════════════════════════════════
--  VIEWS
-- ═══════════════════════════════════════════════════════════════

create view recipe_rating_summary as
  select
    canonical_id,
    round(avg(score)::numeric, 2) as average_score,
    count(*) as total_ratings
  from ratings
  group by canonical_id;

create view search_index as
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
  select
    id, slug, 'ingredient' as type, name as title,
    to_tsvector('english', name || ' ' || coalesce(description,'')) as tsv
  from ingredients
  union all
  select
    id, slug, 'product' as type, name as title,
    to_tsvector('english', name || ' ' || coalesce(brand,'') || ' ' || coalesce(description,'')) as tsv
  from products;

-- ═══════════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════

alter table user_profiles          enable row level security;
alter table nutrition_profiles     enable row level security;
alter table flavor_preferences     enable row level security;
alter table household_members      enable row level security;
alter table saved_recipes          enable row level security;
alter table ratings                enable row level security;
alter table user_equipment         enable row level security;
alter table appliance_profiles     enable row level security;
alter table inventory_items        enable row level security;
alter table recipe_canonicals      enable row level security;
alter table recipe_versions        enable row level security;
alter table version_steps          enable row level security;
alter table version_ingredients    enable row level security;
alter table version_equipment      enable row level security;
alter table version_step_ingredients enable row level security;
alter table version_sub_recipes    enable row level security;
alter table execution_variants     enable row level security;
alter table variant_ingredient_scaling enable row level security;
alter table variant_step_overrides enable row level security;
alter table recipe_translations    enable row level security;
alter table preference_axes        enable row level security;
alter table variant_preference_mappings enable row level security;
alter table products               enable row level security;
alter table product_cooking_profiles enable row level security;
alter table ingredients            enable row level security;
alter table equipment              enable row level security;
-- Legacy tables
alter table recipes                enable row level security;
alter table recipe_steps           enable row level security;
alter table recipe_ingredients     enable row level security;
alter table recipe_equipment       enable row level security;
alter table step_ingredient_refs   enable row level security;

-- Public read
create policy "Public read recipe_canonicals"   on recipe_canonicals   for select using (is_published = true);
create policy "Public read recipe_versions"     on recipe_versions     for select using (true);
create policy "Public read version_steps"       on version_steps       for select using (true);
create policy "Public read version_ingredients" on version_ingredients for select using (true);
create policy "Public read version_equipment"   on version_equipment   for select using (true);
create policy "Public read version_step_ingredients" on version_step_ingredients for select using (true);
create policy "Public read version_sub_recipes" on version_sub_recipes for select using (true);
create policy "Public read execution_variants"  on execution_variants  for select using (true);
create policy "Public read recipe_translations" on recipe_translations for select using (true);
create policy "Public read preference_axes"     on preference_axes     for select using (true);
create policy "Public read variant_preference_mappings" on variant_preference_mappings for select using (true);
create policy "Public read ingredients"         on ingredients         for select using (true);
create policy "Public read equipment"           on equipment           for select using (true);
create policy "Public read products"            on products            for select using (true);
create policy "Public read product_cooking_profiles" on product_cooking_profiles for select using (true);
-- Legacy
create policy "Public read recipes"            on recipes             for select using (is_published = true);
create policy "Public read recipe_ingredients" on recipe_ingredients  for select using (true);
create policy "Public read recipe_steps"       on recipe_steps        for select using (true);
create policy "Public read recipe_equipment"   on recipe_equipment    for select using (true);
create policy "Public read step_ingredient_refs" on step_ingredient_refs for select using (true);

-- Users own their data
create policy "Users manage own profile"         on user_profiles        for all using (auth.uid() = id);
create policy "Users manage own nutrition"       on nutrition_profiles   for all using (auth.uid() = user_id);
create policy "Users manage own flavors"         on flavor_preferences   for all using (auth.uid() = user_id);
create policy "Users manage own household"       on household_members    for all using (auth.uid() = user_id);
create policy "Users manage own saves"           on saved_recipes        for all using (auth.uid() = user_id);
create policy "Users manage own ratings"         on ratings              for all using (auth.uid() = user_id);
create policy "Users manage own equipment"       on user_equipment       for all using (auth.uid() = user_id);
create policy "Users manage own appliances"      on appliance_profiles   for all using (auth.uid() = user_id);
create policy "Users manage own inventory"       on inventory_items      for all using (auth.uid() = user_id);

-- Authors manage their recipes
create policy "Authors manage own canonicals"   on recipe_canonicals
  for all using (auth.uid() = author_id);
create policy "Authors manage own versions"     on recipe_versions
  for all using (
    auth.uid() = (select author_id from recipe_canonicals where id = canonical_id)
  );
create policy "Authors manage own products"     on products
  for all using (auth.uid() = created_by);
create policy "Users add cooking profiles"      on product_cooking_profiles
  for all using (auth.uid() = created_by);

-- Legacy
create policy "Authors manage own recipes"      on recipes
  for all using (auth.uid() = author_id);

-- ═══════════════════════════════════════════════════════════════
--  TRIGGERS
-- ═══════════════════════════════════════════════════════════════

create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger recipes_updated_at         before update on recipes           for each row execute procedure update_updated_at();
create trigger ingredients_updated_at     before update on ingredients       for each row execute procedure update_updated_at();
create trigger profiles_updated_at        before update on user_profiles     for each row execute procedure update_updated_at();
create trigger nutrition_updated_at       before update on nutrition_profiles for each row execute procedure update_updated_at();
create trigger appliance_updated_at       before update on appliance_profiles for each row execute procedure update_updated_at();
create trigger products_updated_at        before update on products           for each row execute procedure update_updated_at();
create trigger inventory_updated_at       before update on inventory_items    for each row execute procedure update_updated_at();
create trigger flavor_updated_at          before update on flavor_preferences for each row execute procedure update_updated_at();
