-- supabase/migrations/mealcomp_00_schema.sql
-- Soupdog — Meals, Meal Editor & Unified Recipe, Phase 0 (schema only). v0.2 model.
--
-- CORE MODEL: a meal IS a recipe, one level up. Single canonical entity, with a
-- composition_level flag (dish | meal). A meal canonical's sub-recipes are linked
-- via meal_component (canonical → canonical). NO free text — every component is a
-- real recipe_canonicals row, so nutrition / cost / safety always compute.
--
-- Additive & invisible until Phase 1 reads it. Existing recipes backfill as 'dish'.
--
-- RLS follows the hard-won meal-plan/household lessons:
--   • policies scoped to PUBLIC (never `to authenticated`)
--   • auth.uid() enforcement via the meal canonical's author_id
--   • explicit DELETE policy; gen_random_uuid() default; grant all to authenticated
--   • SELECT bootstrap clause so INSERT ... RETURNING works on fresh rows
--
-- Idempotent: safe to re-run. Apply in the Supabase SQL editor.

begin;

-- ── enums ─────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'composition_level') then
    create type composition_level as enum ('dish', 'meal');
  end if;
  if not exists (select 1 from pg_type where typname = 'meal_component_type') then
    create type meal_component_type as enum ('dish', 'side', 'drink');
  end if;
end $$;

-- ── recipe_canonicals.composition_level ────────────────────────────────────
-- The single flag distinguishing the two browse sections / editor presentations.
alter table recipe_canonicals
  add column if not exists composition_level composition_level not null default 'dish';

create index if not exists idx_recipe_canonicals_level
  on recipe_canonicals(composition_level);

-- ── meal_component: links a MEAL canonical to its sub-recipe canonicals ─────
-- Every component references a real canonical (no free text). component_canonical
-- is typically a 'dish'-level recipe (a main, a side, a drink-recipe), but the
-- model does not forbid nesting a meal inside a meal later.
create table if not exists meal_component (
  id                     uuid primary key default gen_random_uuid(),
  meal_canonical_id      uuid not null references recipe_canonicals(id) on delete cascade,
  component_canonical_id uuid not null references recipe_canonicals(id) on delete restrict,
  component_type         meal_component_type not null default 'dish',
  position               integer not null default 0,
  servings_target        integer,            -- resolved target (Soupdog-sized); null = inherit meal
  note                   text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  -- a meal cannot contain itself directly
  constraint meal_component_no_self check (meal_canonical_id <> component_canonical_id),
  -- a given sub-recipe appears once per meal (re-adding updates position/type)
  constraint meal_component_unique unique (meal_canonical_id, component_canonical_id)
);

create index if not exists idx_meal_component_meal
  on meal_component(meal_canonical_id, position);
create index if not exists idx_meal_component_sub
  on meal_component(component_canonical_id);

-- ── RLS on meal_component ───────────────────────────────────────────────────
-- A meal_component is visible/editable exactly when the caller owns the MEAL
-- canonical (author_id = auth.uid()). Mirrors recipe authorship.
alter table meal_component enable row level security;

-- SELECT: caller authors the meal canonical. Bootstrap clause lets INSERT
-- ... RETURNING read the new row back.
drop policy if exists mc_select on meal_component;
create policy mc_select on meal_component
  for select to public
  using (
    exists (
      select 1 from recipe_canonicals rc
      where rc.id = meal_component.meal_canonical_id
        and rc.author_id = auth.uid()
    )
    or not exists (
      select 1 from recipe_canonicals rc
      where rc.id = meal_component.meal_canonical_id
    )
  );

-- INSERT: caller must author the meal canonical it's attaching to.
drop policy if exists mc_insert on meal_component;
create policy mc_insert on meal_component
  for insert to public
  with check (
    exists (
      select 1 from recipe_canonicals rc
      where rc.id = meal_component.meal_canonical_id
        and rc.author_id = auth.uid()
    )
  );

-- UPDATE: caller authors the meal canonical.
drop policy if exists mc_update on meal_component;
create policy mc_update on meal_component
  for update to public
  using (
    exists (
      select 1 from recipe_canonicals rc
      where rc.id = meal_component.meal_canonical_id
        and rc.author_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from recipe_canonicals rc
      where rc.id = meal_component.meal_canonical_id
        and rc.author_id = auth.uid()
    )
  );

-- DELETE: explicit policy (the lesson — delete silently fails without one).
drop policy if exists mc_delete on meal_component;
create policy mc_delete on meal_component
  for delete to public
  using (
    exists (
      select 1 from recipe_canonicals rc
      where rc.id = meal_component.meal_canonical_id
        and rc.author_id = auth.uid()
    )
  );

-- ── grants (re-run after ANY column addition) ──────────────────────────────
grant all on meal_component to authenticated;
grant select on meal_component to anon;

-- ── backfill: every existing recipe is a 'dish' ────────────────────────────
-- (Default already does this for new rows; explicit + no-op on re-run.)
update recipe_canonicals set composition_level = 'dish'
  where composition_level is null;

commit;

-- ── verify (run separately; SQL editor role is postgres → auth.uid() is null,
--     so these bypass RLS as postgres) ───────────────────────────────────────
-- select composition_level, count(*) from recipe_canonicals group by 1;
-- select count(*) as meal_components from meal_component;
--
-- NOTE on the existing meal-plan `meal` table:
--   The plan's `meal` row still has recipe_id (one dish per slot). Phase 1 will
--   point a planned meal at a MEAL-level canonical instead, at which point the
--   unified recipe (a derived recipe_version of that meal canonical) is what the
--   plan renders. No change to `meal` is needed in Phase 0 — this migration only
--   establishes that meals can be authored as composed recipes.
