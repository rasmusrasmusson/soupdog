-- ═══════════════════════════════════════════════════════════════
--  Soupdog — PostgreSQL Schema (Supabase)
--  Run this in the Supabase SQL Editor to initialise the database
-- ═══════════════════════════════════════════════════════════════

-- ── Extensions ───────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm"; -- for fast text search

-- ── Enums ─────────────────────────────────────────────────────
create type difficulty_level  as enum ('trivial','easy','medium','hard','expert');
create type food_state        as enum ('frozen','refrigerated','room_temp','hot','thawed_partial');
create type step_type         as enum ('human','machine','passive');
create type unit_system       as enum ('si','imperial','us');
create type equipment_category as enum ('oven','knife','pan','scale','mixer','appliance','other');

-- ── Ingredients ───────────────────────────────────────────────
create table ingredients (
  id                        uuid primary key default uuid_generate_v4(),
  slug                      text not null unique,
  name                      text not null,
  description               text,
  nutrition                 jsonb,           -- NutritionData shape
  allergens                 text[],
  transformed_from_id       uuid references ingredients(id),
  transformation_recipe_id  uuid,            -- FK added after recipes table
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index ingredients_slug_idx on ingredients(slug);
create index ingredients_name_trgm on ingredients using gin(name gin_trgm_ops);

-- ── Equipment ─────────────────────────────────────────────────
create table equipment (
  id           uuid primary key default uuid_generate_v4(),
  slug         text not null unique,
  name         text not null,
  category     equipment_category not null default 'other',
  description  text,
  connected    boolean not null default false,
  capabilities jsonb,  -- ApplianceCapability[]
  created_at   timestamptz not null default now()
);
create index equipment_slug_idx on equipment(slug);

-- ── Recipes ───────────────────────────────────────────────────
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
  nutrition             jsonb,           -- NutritionData shape
  required_food_state   food_state,
  author_id             uuid references auth.users(id),
  is_published          boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index recipes_slug_idx     on recipes(slug);
create index recipes_cuisine_idx  on recipes(cuisine);
create index recipes_tags_idx     on recipes using gin(tags);
create index recipes_title_trgm   on recipes using gin(title gin_trgm_ops);

-- Back-fill FK on ingredients now that recipes exists
alter table ingredients
  add constraint fk_transformation_recipe
  foreign key (transformation_recipe_id) references recipes(id);

-- ── Recipe Steps ──────────────────────────────────────────────
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

-- ── Recipe Ingredients ────────────────────────────────────────
create table recipe_ingredients (
  id              uuid primary key default uuid_generate_v4(),
  recipe_id       uuid not null references recipes(id) on delete cascade,
  ingredient_id   uuid not null references ingredients(id),
  quantity_value  numeric(10,4) not null,
  quantity_unit   text not null,          -- SI unit string
  food_state      food_state,
  prep_note       text,
  optional        boolean not null default false,
  order_index     integer not null,
  unique (recipe_id, order_index)
);
create index recipe_ingredients_recipe_idx     on recipe_ingredients(recipe_id);
create index recipe_ingredients_ingredient_idx on recipe_ingredients(ingredient_id);

-- ── Sub-Recipe Links ──────────────────────────────────────────
create table recipe_sub_recipes (
  id                   uuid primary key default uuid_generate_v4(),
  parent_recipe_id     uuid not null references recipes(id) on delete cascade,
  child_recipe_id      uuid not null references recipes(id),
  used_as_ingredient   text,
  optional             boolean not null default false,
  unique (parent_recipe_id, child_recipe_id)
);

-- ── Recipe Equipment ──────────────────────────────────────────
create table recipe_equipment (
  id           uuid primary key default uuid_generate_v4(),
  recipe_id    uuid not null references recipes(id) on delete cascade,
  equipment_id uuid not null references equipment(id),
  required     boolean not null default true,
  alternatives text[],
  unique (recipe_id, equipment_id)
);

-- ── User Profiles ─────────────────────────────────────────────
-- Extends Supabase auth.users (1:1)
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

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.user_profiles (id)
  values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Household Members ─────────────────────────────────────────
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

-- ── Saved Recipes ─────────────────────────────────────────────
create table saved_recipes (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  recipe_id   uuid not null references recipes(id) on delete cascade,
  collection  text,    -- e.g. 'favorites', 'weeknight', custom name
  notes       text,
  created_at  timestamptz not null default now(),
  unique (user_id, recipe_id)
);
create index saved_recipes_user_idx   on saved_recipes(user_id);
create index saved_recipes_recipe_idx on saved_recipes(recipe_id);

-- ── Ratings ───────────────────────────────────────────────────
create table ratings (
  id           uuid primary key default uuid_generate_v4(),
  recipe_id    uuid not null references recipes(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  score        smallint not null check (score between 1 and 5),
  skill_level  difficulty_level,
  appliance_id uuid references equipment(id),
  country      text,
  notes        text,
  created_at   timestamptz not null default now(),
  unique (recipe_id, user_id)
);
create index ratings_recipe_idx on ratings(recipe_id);

-- ── User Equipment ─────────────────────────────────────────────
create table user_equipment (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  equipment_id  uuid not null references equipment(id),
  nickname      text,
  registered_at timestamptz not null default now(),
  unique (user_id, equipment_id)
);
create index user_equipment_user_idx on user_equipment(user_id);

-- ── Views ─────────────────────────────────────────────────────
create view recipe_rating_summary as
  select
    recipe_id,
    round(avg(score)::numeric, 2) as average_score,
    count(*) as total_ratings
  from ratings
  group by recipe_id;

-- ── Full-text search (Phase 1) ────────────────────────────────
-- Combined search across recipes + ingredients
create view search_index as
  select
    id, slug, 'recipe' as type, title,
    to_tsvector('english', title || ' ' || coalesce(description,'') || ' ' || coalesce(cuisine,'') || ' ' || coalesce(array_to_string(tags,' '),'')) as tsv
  from recipes where is_published = true
  union all
  select
    id, slug, 'ingredient' as type, name as title,
    to_tsvector('english', name || ' ' || coalesce(description,'')) as tsv
  from ingredients;

-- ── Row Level Security ────────────────────────────────────────
alter table user_profiles      enable row level security;
alter table household_members  enable row level security;
alter table saved_recipes      enable row level security;
alter table ratings            enable row level security;
alter table user_equipment     enable row level security;
alter table recipes            enable row level security;
alter table ingredients        enable row level security;
alter table equipment          enable row level security;

-- Public read for content
create policy "Public read recipes"     on recipes     for select using (is_published = true);
create policy "Public read ingredients" on ingredients for select using (true);
create policy "Public read equipment"   on equipment   for select using (true);
create policy "Public read recipe_ingredients" on recipe_ingredients for select using (true);
create policy "Public read recipe_steps"       on recipe_steps       for select using (true);
create policy "Public read recipe_equipment"   on recipe_equipment   for select using (true);

-- Users own their data
create policy "Users manage own profile"   on user_profiles     for all using (auth.uid() = id);
create policy "Users manage own household" on household_members  for all using (auth.uid() = user_id);
create policy "Users manage own saves"     on saved_recipes      for all using (auth.uid() = user_id);
create policy "Users manage own ratings"   on ratings            for all using (auth.uid() = user_id);
create policy "Users manage own equipment" on user_equipment     for all using (auth.uid() = user_id);

-- Users can insert their own recipes
create policy "Authors manage own recipes" on recipes
  for all using (auth.uid() = author_id);

-- ── Updated_at trigger ────────────────────────────────────────
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger recipes_updated_at     before update on recipes     for each row execute procedure update_updated_at();
create trigger ingredients_updated_at before update on ingredients for each row execute procedure update_updated_at();
create trigger profiles_updated_at    before update on user_profiles for each row execute procedure update_updated_at();
