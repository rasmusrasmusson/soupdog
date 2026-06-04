-- ============================================================================
-- Soupdog · Demand Model (Doc A) · Phase 0
-- Move daily nutrient + energy targets onto the person spine.
--
-- Run in the Supabase SQL editor (project npvajzgciuykugqxedmm).
-- DRY-RUN DISCIPLINE: run STEP 1 and STEP 2 (the SELECTs) first, eyeball the
-- output, and only then run STEP 3 (the committing block) which is wrapped in
-- an explicit transaction. Nothing is written until STEP 3.
--
-- Legacy source: nutrition_profiles (keyed user_id + household_member_id).
--   - household_member_id IS NULL  => the account-holder's own targets
--                                     => maps to their SELF person.
--   - household_member_id NOT NULL => a legacy household member; no person
--                                     mapping exists yet, so these are NOT
--                                     migrated in Phase 0 (reported, skipped).
-- Destination: person_nutrient_targets (person-keyed, one row per person),
--   modelled on person_meal_prefs. Carries cascade source + confidence.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- STEP 0 · Create the destination table (idempotent). Safe to run repeatedly.
-- ----------------------------------------------------------------------------
create table if not exists public.person_nutrient_targets (
  person_id          uuid primary key
                       references public.person(id) on delete cascade,

  -- Daily targets (same units as nutrition_profiles / meal nutrition data).
  daily_calories_kcal integer,
  daily_protein_g      numeric,
  daily_carbs_g        numeric,
  daily_fat_g          numeric,
  daily_fiber_g        numeric,
  daily_sodium_mg      numeric,

  -- Cascade metadata (Doc A §4 / §8). Where these numbers came from and how
  -- much we trust them. 'population_average' is the default rung; a migrated
  -- legacy row is a stated/known target.
  source              text    not null default 'population_average',
  confidence          numeric not null default 0.3,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.person_nutrient_targets is
  'Doc A Phase 0: daily nutrient/energy targets on the person spine. Replaces legacy nutrition_profiles (self rows). One row per person; carries cascade source + confidence.';


-- ----------------------------------------------------------------------------
-- STEP 0b · Table-level privileges.
-- A freshly created table grants NOTHING to the Supabase API roles, so the
-- PostgREST 'authenticated' role hits "permission denied" before RLS is even
-- evaluated. RLS decides WHICH ROWS; these grants let the role touch the table
-- at all. RLS below still scopes every row to the caller's person grants.
-- ----------------------------------------------------------------------------
grant select, insert, update, delete
  on table public.person_nutrient_targets to authenticated;


-- ----------------------------------------------------------------------------
-- STEP 0c · Row Level Security (matches the person_access scoping pattern).
-- A caller may read/write a person's targets if they hold an active grant on
-- that person (own self-grant, or a delegated grant). Idempotent.
-- ----------------------------------------------------------------------------
alter table public.person_nutrient_targets enable row level security;

drop policy if exists pnt_select on public.person_nutrient_targets;
create policy pnt_select on public.person_nutrient_targets
  for select using (
    person_id in (
      select pa.person_id from public.person_access pa
      where pa.account_id = auth.uid()
        and pa.revoked_at is null
    )
  );

drop policy if exists pnt_insert on public.person_nutrient_targets;
create policy pnt_insert on public.person_nutrient_targets
  for insert with check (
    person_id in (
      select pa.person_id from public.person_access pa
      where pa.account_id = auth.uid()
        and pa.revoked_at is null
    )
  );

drop policy if exists pnt_update on public.person_nutrient_targets;
create policy pnt_update on public.person_nutrient_targets
  for update using (
    person_id in (
      select pa.person_id from public.person_access pa
      where pa.account_id = auth.uid()
        and pa.revoked_at is null
    )
  );

drop policy if exists pnt_delete on public.person_nutrient_targets;
create policy pnt_delete on public.person_nutrient_targets
  for delete using (
    person_id in (
      select pa.person_id from public.person_access pa
      where pa.account_id = auth.uid()
        and pa.revoked_at is null
    )
  );


-- ============================================================================
-- STEP 1 · DRY RUN — what WOULD migrate (self targets only). READ ONLY.
-- Each legacy self row resolved to a person via its account's self grant.
-- ============================================================================
select
  np.user_id                       as account_id,
  pa.person_id                     as resolved_person_id,
  p.display_name,
  np.label,
  np.daily_calories_kcal,
  np.daily_protein_g,
  np.daily_carbs_g,
  np.daily_fat_g,
  np.daily_fiber_g,
  np.daily_sodium_mg,
  np.updated_at                    as legacy_updated_at,
  case when pnt.person_id is null then 'INSERT'
       else 'ALREADY EXISTS (skipped)'
  end                              as action
from public.nutrition_profiles np
join public.person_access pa
  on pa.account_id = np.user_id
 and pa.role = 'self'
 and pa.revoked_at is null
join public.person p
  on p.id = pa.person_id
left join public.person_nutrient_targets pnt
  on pnt.person_id = pa.person_id
where np.household_member_id is null
order by np.updated_at desc;


-- ============================================================================
-- STEP 2 · DRY RUN — rows that will NOT migrate (and why). READ ONLY.
-- Either a household-member row (no person mapping yet) or an account with no
-- active self grant. Reported so nothing is lost silently.
-- ============================================================================
select
  np.user_id,
  np.household_member_id,
  np.label,
  np.updated_at,
  case
    when np.household_member_id is not null
      then 'household member — no person mapping in Phase 0'
    else 'no active self grant for account'
  end as skip_reason
from public.nutrition_profiles np
left join public.person_access pa
  on pa.account_id = np.user_id
 and pa.role = 'self'
 and pa.revoked_at is null
where np.household_member_id is not null
   or pa.person_id is null
order by np.updated_at desc;


-- ============================================================================
-- STEP 3 · COMMIT — run ONLY after the dry-run output looks right.
-- Wrapped in a transaction. If anything is wrong, ROLLBACK instead of COMMIT.
-- Idempotent: re-running will not duplicate (ON CONFLICT keeps the newer row).
-- ============================================================================
begin;

-- One self row per account expected; if duplicates exist, distinct-on picks
-- the most recently updated legacy row per person.
insert into public.person_nutrient_targets as pnt (
  person_id,
  daily_calories_kcal, daily_protein_g, daily_carbs_g,
  daily_fat_g, daily_fiber_g, daily_sodium_mg,
  source, confidence, created_at, updated_at
)
select distinct on (pa.person_id)
  pa.person_id,
  np.daily_calories_kcal,
  np.daily_protein_g,
  np.daily_carbs_g,
  np.daily_fat_g,
  np.daily_fiber_g,
  np.daily_sodium_mg,
  'migrated_legacy'  as source,
  0.7                as confidence,   -- a stated/known target, not a guess
  now(), now()
from public.nutrition_profiles np
join public.person_access pa
  on pa.account_id = np.user_id
 and pa.role = 'self'
 and pa.revoked_at is null
where np.household_member_id is null
order by pa.person_id, np.updated_at desc
on conflict (person_id) do update set
  daily_calories_kcal = excluded.daily_calories_kcal,
  daily_protein_g     = excluded.daily_protein_g,
  daily_carbs_g       = excluded.daily_carbs_g,
  daily_fat_g         = excluded.daily_fat_g,
  daily_fiber_g       = excluded.daily_fiber_g,
  daily_sodium_mg     = excluded.daily_sodium_mg,
  source              = 'migrated_legacy',
  confidence          = greatest(pnt.confidence, 0.7),
  updated_at          = now()
-- only overwrite if the incoming legacy data is the migration's own (don't
-- clobber a value a user set later by hand through the new route):
where pnt.source in ('population_average', 'migrated_legacy');

-- Verify inside the transaction before committing.
select count(*) as person_targets_after from public.person_nutrient_targets;

commit;
-- If the count or anything above looked wrong, run:  rollback;


-- ============================================================================
-- STEP 4 · (LATER, not now) — once the new path is confirmed in production for
-- a while, the legacy table can be retired:
--   alter table public.nutrition_profiles rename to nutrition_profiles_legacy;
-- Left commented intentionally. Do NOT drop in Phase 0.
-- ============================================================================
