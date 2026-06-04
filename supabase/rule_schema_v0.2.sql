-- ═══════════════════════════════════════════════════════════════════════════
--  SOUPDOG FOOD MODEL — RULE LIBRARY (strawman v0.2)
--  Net-new layer. Sits UNDER the existing recipe/variant schema.
--  The existing variant_* tables become CONSUMERS of these rules.
--
--  CHANGES FROM v0.1 (the uploaded draft):
--   • Nutrient rules no longer "one number fits all" — add food_class + optional
--     time/temp dependence (fixes the same oversimplification we critiqued in the
--     current nutrition system).
--   • Transfer guard hardened: no self-transfer, no contradictory duplicate, and
--     an explicit conflict-resolution rule for grade precedence.
--   • Evidence ratchet ("higher grade wins") made ENFORCEABLE via a resolution
--     view + assert helper, not just prose.
--   • Every reference to a LIVE table/enum is tagged  -- RECONCILE:  so nothing is
--     silently assumed. These MUST be checked against supabase/schema.sql before
--     deployment. (Could not fetch live schema at authoring time.)
--
--  Nothing here exists in the live schema yet. For discussion, not deployment.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 0. The unifying primitive: an evidence grade ──────────────────────────
-- Replaces scattered ad-hoc source strings currently in the schema:
--   ingredients.nutrition_source, products.data_source,
--   product_cooking_profiles.source
-- RECONCILE: confirm these columns exist and plan a migration to fold them in.

create type evidence_grade as enum (
  'e0_inferred',        -- applier output, cross-family transfer, small model
  'e1_literature',      -- food-science texts, peer-reviewed, physics
  'e2_expert',          -- hired chef / food scientist asserted or corrected
  'e3_tested',          -- one controlled in-kitchen test
  'e4_validated',       -- repeated independent validation (the apex / moat)
  'u_user_feedback'     -- aggregated ratings / structured interviews (modifies)
);

-- Numeric rank for precedence comparisons (the "higher grade wins" ratchet).
-- U is deliberately ranked BELOW e1: user feedback flags/modifies but does not
-- override literature+ unless it has been promoted via review to e2/e3.
create function evidence_rank(g evidence_grade) returns int language sql immutable as $$
  select case g
    when 'e0_inferred'     then 0
    when 'u_user_feedback' then 1
    when 'e1_literature'   then 2
    when 'e2_expert'       then 3
    when 'e3_tested'       then 4
    when 'e4_validated'    then 5
  end
$$;

-- Reusable provenance columns. Inlined (not a composite type) so they're
-- queryable/indexable. Present on every table that asserts a value:
--   evidence_grade   evidence_grade  not null
--   evidence_source  text            -- citation/expert-id/test-id (INTERNAL ONLY, never shown to end users)
--   confidence       numeric(3,2)    -- 0..1, optional finer signal within a grade
--   asserted_by      uuid            -- internal: who/what set this
--   asserted_at      timestamptz     not null default now()
--   superseded_by    uuid            -- points to the row that overrode this one (audit trail)


-- ═══════════════════════════════════════════════════════════════════════════
--  1. ONTOLOGY OF KNOWLEDGE: families and the objects they group
-- ═══════════════════════════════════════════════════════════════════════════

create table food_families (
  id                uuid primary key default uuid_generate_v4(),
  slug              text not null unique,         -- 'redmeat_tender'
  name              text not null,
  domain            text not null,                -- 'red_meat','poultry','fish','dough'
  description       text,
  connective_tissue text,                         -- 'low'|'medium'|'high'
  default_method    text,                         -- 'dry_heat'|'moist_heat'|'low_slow'
  evidence_grade    evidence_grade not null default 'e1_literature',
  evidence_source   text,
  confidence        numeric(3,2),
  asserted_by       uuid,
  asserted_at       timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

create table food_family_members (
  id             uuid primary key default uuid_generate_v4(),
  family_id      uuid not null references food_families(id) on delete cascade,
  ingredient_id  uuid not null,   -- RECONCILE: references ingredients(id) — confirm table+PK type
  attributes     jsonb,           -- {typical_thickness_mm:25, fat_pct:15}
  evidence_grade evidence_grade not null default 'e1_literature',
  evidence_source text,
  confidence     numeric(3,2),
  asserted_at    timestamptz not null default now(),
  unique (family_id, ingredient_id)
);
-- RECONCILE: add FK  references ingredients(id) on delete cascade  once confirmed.

-- THE TRANSFER GUARD — hardened.
create table family_transfer_rules (
  id              uuid primary key default uuid_generate_v4(),
  from_family_id  uuid not null references food_families(id) on delete cascade,
  to_family_id    uuid not null references food_families(id) on delete cascade,
  transfer        text not null check (transfer in ('free','with_adjustment','forbidden')),
  adjustment_note text,
  evidence_grade  evidence_grade not null default 'e2_expert',
  evidence_source text,
  confidence      numeric(3,2),
  asserted_at     timestamptz not null default now(),
  -- FIX (v0.2): a family can't have a transfer rule to itself (always 'free' implicitly)
  check (from_family_id <> to_family_id),
  -- FIX (v0.2): one rule per ordered pair; direction matters (tender->tough may
  -- differ from tough->tender), so the pair is ordered, not symmetric.
  unique (from_family_id, to_family_id)
);
-- NOTE on resolution: if two rows ever disagree for a pair (shouldn't happen given
-- the unique constraint, but across edits/imports), the applier takes the row with
-- the highest evidence_rank(); ties break to the more conservative transfer
-- ('forbidden' > 'with_adjustment' > 'free'). Safety beats permissiveness.


-- ═══════════════════════════════════════════════════════════════════════════
--  2. TRANSFORMATION RULES: target states and how to reach them
-- ═══════════════════════════════════════════════════════════════════════════

create table target_state_rules (
  id                 uuid primary key default uuid_generate_v4(),
  family_id          uuid references food_families(id),  -- null = whole domain
  domain             text not null,
  axis               text not null,                       -- 'doneness'
  state_name         text not null,                       -- 'medium_rare'
  target_temp_celsius numeric(5,2),
  target_temp_range_c  numeric(4,2),
  notes               text,
  evidence_grade     evidence_grade not null default 'e1_literature',
  evidence_source    text,
  confidence         numeric(3,2),
  asserted_at        timestamptz not null default now(),
  superseded_by      uuid references target_state_rules(id),
  unique (domain, axis, state_name, family_id)
);

create table method_rules (
  id                 uuid primary key default uuid_generate_v4(),
  family_id          uuid references food_families(id),
  domain             text not null,
  breakpoint_kind    text not null check (breakpoint_kind in ('total_mass_g','piece_count')),
  breakpoint_value   numeric(10,2) not null,
  below_method       text not null,
  at_or_above_method text not null,
  capacity_basis     text,
  notes              text,
  evidence_grade     evidence_grade not null default 'e2_expert',
  evidence_source    text,
  confidence         numeric(3,2),
  asserted_at        timestamptz not null default now(),
  unique (domain, family_id, breakpoint_kind)
);

create table scaling_factor_rules (
  id              uuid primary key default uuid_generate_v4(),
  applies_to      text not null,        -- RECONCILE: must match ingredients.category vocabulary.
                                        --  If categories differ, add a mapping or change this to an FK.
  factor_curve    jsonb not null,       -- {"type":"power","exponent":0.85} or {"type":"lookup","points":[[1,1],[4,0.9]]}
  notes           text,
  evidence_grade  evidence_grade not null default 'e2_expert',
  evidence_source text,
  confidence      numeric(3,2),
  asserted_at     timestamptz not null default now()
);


-- ═══════════════════════════════════════════════════════════════════════════
--  3. PASSIVE / TIME TRANSFORMATION RULES (the "20-minute pizza" layer)
-- ═══════════════════════════════════════════════════════════════════════════

-- RECONCILE: v0.1 referenced an existing `food_state` enum. If it exists, use it.
-- If not, this fallback defines the meaningful, BOUNDED states (not a continuum).
-- DROP this and switch the columns to the live enum if one is present.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'food_state') then
    create type food_state as enum (
      'frozen','partially_thawed','thawed','fresh','room_temp',
      'fermenting','fermented','marinating','marinated',
      'cooked_hot','held','cooled','reheated','staled','spoiled'
    );
  end if;
end $$;

create table passive_transform_rules (
  id              uuid primary key default uuid_generate_v4(),
  domain          text not null,                 -- 'dough','red_meat','frozen_product'
  process         text not null,                 -- 'thaw','ferment','rest','oxidize','stale'
  from_state      food_state,
  to_state        food_state,
  condition_temp_c numeric(5,2),
  condition_humidity_pct numeric(5,2),           -- v0.2: environment is a modifier here too
  typical_duration_seconds integer,
  effect_note     text,
  changes_method  boolean not null default false,
  changes_nutrition boolean not null default false,
  evidence_grade  evidence_grade not null default 'e1_literature',
  evidence_source text,
  confidence      numeric(3,2),
  asserted_at     timestamptz not null default now()
);


-- ═══════════════════════════════════════════════════════════════════════════
--  4. NUTRIENT TRANSFORMATION RULES  (v0.2 — fixed the "one number" problem)
-- ═══════════════════════════════════════════════════════════════════════════

-- v0.1 keyed retention on (method, nutrient) only — a single global factor per
-- method, which is the SAME oversimplification we criticised in the current
-- nutrition system. Vitamin-C loss in boiling depends on the food, piece size,
-- and time. v0.2 adds a food_class dimension and optional kinetic dependence,
-- and lets specific rows override general ones via evidence rank.
create table nutrient_transform_rules (
  id              uuid primary key default uuid_generate_v4(),
  method          text not null,                 -- 'boil','steam','fry','dehydrate','reheat'
  nutrient        text not null,                 -- 'vitamin_c','fat','mass_water','energy'
  -- specificity dimension: null food_class = general fallback; a value = override.
  food_class      text,                          -- e.g. 'leafy_veg','root_veg','red_meat'; null=any
  -- optional kinetic dependence (else a flat factor)
  duration_seconds_ref integer,                  -- the duration the factor is calibrated for
  retention_curve jsonb,                         -- optional {"type":"exp_decay","k":...} over time
  retention_factor numeric(5,3) not null,        -- flat factor if no curve (0.50 = 50% retained)
  basis           text,                           -- 'per_100g'|'whole'
  notes           text,
  evidence_grade  evidence_grade not null default 'e1_literature',
  evidence_source text,
  confidence      numeric(3,2),
  asserted_at     timestamptz not null default now(),
  -- a general (food_class null) and a specific row may coexist; applier prefers
  -- the most specific match, then highest evidence_rank().
  unique (method, nutrient, food_class)
);


-- ═══════════════════════════════════════════════════════════════════════════
--  5. MATERIALIZATION POLICY (audience-scoped ambition)
-- ═══════════════════════════════════════════════════════════════════════════

create table materialization_policies (
  id                 uuid primary key default uuid_generate_v4(),
  scope_kind         text not null check (scope_kind in ('workspace','recipe','product','global_default')),
  scope_id           uuid,                 -- null for global_default
  preexpand_axes     text[],               -- ['doneness'] consumer; more for B2B
  servings_breakpoint_mode text not null default 'parameter_below_method_above',
  state_granularity  text not null default 'coarse' check (state_granularity in ('coarse','fine')),
  notes              text,
  created_at         timestamptz not null default now(),
  unique (scope_kind, scope_id)
);
-- Materialize a state if: (demand) it's been requested; OR (consequence) crossing
-- into it sets changes_method/changes_nutrition true past threshold; OR (audience)
-- the resolved policy's state_granularity = 'fine'. Resolution order for policy:
-- recipe/product scope overrides workspace overrides global_default.


-- ═══════════════════════════════════════════════════════════════════════════
--  6. EVIDENCE RESOLUTION  (v0.2 — makes the ratchet enforceable, not just prose)
-- ═══════════════════════════════════════════════════════════════════════════

-- Helper the applier/import path calls instead of a raw UPDATE: a new assertion
-- only wins if its grade is >= the incumbent's. Lower-grade input is recorded
-- (for the feedback signal) but does not overwrite a better-evidenced value.
-- Pseudocode contract (implement in app or as a generic trigger per table):
--   assert_value(table, key, new_value, new_grade, source):
--     if no incumbent: insert.
--     elif evidence_rank(new_grade) >  rank(incumbent): supersede (set superseded_by), insert.
--     elif evidence_rank(new_grade) == rank(incumbent): flag for human review (conflict).
--     else: record as feedback/observation only; do not overwrite.
-- This is the "model ratchets upward" behaviour from the design doc, enforced.

-- A convenience view: the current winning target-state rule per key.
create view target_state_rules_current as
  select distinct on (domain, axis, state_name, coalesce(family_id::text,'*'))
         *
    from target_state_rules
   where superseded_by is null
   order by domain, axis, state_name, coalesce(family_id::text,'*'),
            evidence_rank(evidence_grade) desc, asserted_at desc;
