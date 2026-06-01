-- ═══════════════════════════════════════════════════════════════════════════
--  SOUPDOG FOOD MODEL — RULE LIBRARY (strawman v0.3 — RECONCILED)
--  Reconciled against live supabase/schema.sql (794 lines).
--  Net-new layer; sits UNDER existing recipe/variant tables, which become consumers.
--
--  RECONCILIATION RESULTS (what changed from v0.2):
--   ✓ All assumed live tables EXIST with exact names: execution_variants,
--     variant_ingredient_scaling, variant_step_overrides, preference_axes,
--     variant_preference_mappings, appliance_profiles, products,
--     product_cooking_profiles. No collision.
--   ✓ ingredients.id is uuid → FKs restored as real references.
--   ✓ The three source columns to unify exist: ingredients.nutrition_source,
--     products.data_source, product_cooking_profiles.source.
--   ⚠ FIXED: food_state ENUM ALREADY EXISTS. Removed the create block.
--     Live values are COARSE: frozen, refrigerated, room_temp, hot,
--     thawed_partial, dried, fermented, cured. (See DESIGN NOTE 1.)
--   ⚠ FIXED: ingredient_category is a FIXED enum (vegetable..other). It has no
--     'salt'/'leavening'/'aromatic'/'leafy_veg'/'root_veg'. Scaling & nutrition
--     classification CANNOT key off it. Introduced a new `culinary_role` column
--     + `nutrition_food_class` instead. (See DESIGN NOTE 2.)
--
--  Still a strawman for discussion. Review DESIGN NOTES before deploying.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 0. Evidence grade (unchanged — the unifying primitive) ─────────────────
create type evidence_grade as enum (
  'e0_inferred','e1_literature','e2_expert','e3_tested','e4_validated','u_user_feedback'
);

create function evidence_rank(g evidence_grade) returns int language sql immutable as $$
  select case g
    when 'e0_inferred' then 0 when 'u_user_feedback' then 1 when 'e1_literature' then 2
    when 'e2_expert' then 3 when 'e3_tested' then 4 when 'e4_validated' then 5 end
$$;
-- Provenance columns inlined on every asserting table:
--   evidence_grade evidence_grade not null, evidence_source text (INTERNAL ONLY),
--   confidence numeric(3,2), asserted_by uuid, asserted_at timestamptz, superseded_by uuid.

-- ── DESIGN NOTE 2 (resolved here): culinary_role ───────────────────────────
-- The live ingredient_category enum (vegetable, fruit, meat, fish, dairy, grain,
-- spice, herb, oil, liquid, condiment, prepared, other) classifies WHAT an
-- ingredient is, not how it BEHAVES under scaling/cooking. Sub-linear scaling
-- applies to FUNCTIONAL roles (salt, leavening, aromatic) that cut across
-- categories. So we add an orthogonal role vocabulary the rules can key on.
-- RECONCILE-ACTION: add a nullable column to the live ingredients table:
--   alter table ingredients add column culinary_role text;   -- see enum below
-- (Left as text + check, not a hard enum, so roles can grow without migrations.)
create type culinary_role as enum (
  'salt','sweetener','acid','leavening','aromatic','spice_seasoning',
  'fat','thickener','liquid_base','protein','bulk','other'
);


-- ═══════════════════════════════════════════════════════════════════════════
--  1. ONTOLOGY: families, membership, transfer guard
-- ═══════════════════════════════════════════════════════════════════════════

create table food_families (
  id                uuid primary key default uuid_generate_v4(),
  slug              text not null unique,
  name              text not null,
  domain            text not null,                -- 'red_meat','poultry','fish','dough'
  description       text,
  connective_tissue text,                         -- 'low'|'medium'|'high'
  default_method    text,
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
  ingredient_id  uuid not null references ingredients(id) on delete cascade,  -- ✓ confirmed uuid
  attributes     jsonb,
  evidence_grade evidence_grade not null default 'e1_literature',
  evidence_source text,
  confidence     numeric(3,2),
  asserted_at    timestamptz not null default now(),
  unique (family_id, ingredient_id)
);

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
  check (from_family_id <> to_family_id),
  unique (from_family_id, to_family_id)
);
-- Conflict resolution: highest evidence_rank() wins; ties → most conservative
-- transfer ('forbidden' > 'with_adjustment' > 'free'). Safety beats permissiveness.


-- ═══════════════════════════════════════════════════════════════════════════
--  2. TRANSFORMATION RULES: target states, method breakpoints, scaling
-- ═══════════════════════════════════════════════════════════════════════════

create table target_state_rules (
  id                 uuid primary key default uuid_generate_v4(),
  family_id          uuid references food_families(id),
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
-- NOTE: 'doneness' targets are an ABSTRACT axis, distinct from the coarse
-- food_state enum (which is about storage/thermal state, not doneness). They are
-- intentionally separate vocabularies. See DESIGN NOTE 1.

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
  applies_to_role culinary_role not null,   -- ✓ keys off the new role vocab, NOT ingredient_category
  factor_curve    jsonb not null,           -- {"type":"power","exponent":0.85} | {"type":"lookup","points":[...]}
  notes           text,
  evidence_grade  evidence_grade not null default 'e2_expert',
  evidence_source text,
  confidence      numeric(3,2),
  asserted_at     timestamptz not null default now(),
  unique (applies_to_role)
);


-- ═══════════════════════════════════════════════════════════════════════════
--  3. PASSIVE / TIME TRANSFORMATION RULES
-- ═══════════════════════════════════════════════════════════════════════════
-- food_state enum ALREADY EXISTS (live). No create. Using live coarse values.
-- DESIGN NOTE 1: live food_state is coarse (storage/thermal). It lacks 'held',
-- 'reheated', 'marinating', 'spoiled', and cannot express the fine potato chain
-- (peeled→cut→blanched→held→reheated). Two options to decide:
--   (A) extend the enum:  alter type food_state add value 'held'; ... etc.
--   (B) keep enum coarse; model fine states in a separate context-keyed table.
-- v0.3 uses the live enum as-is and leaves fine-state modelling to a later table.

create table passive_transform_rules (
  id              uuid primary key default uuid_generate_v4(),
  domain          text not null,
  process         text not null,                 -- 'thaw','ferment','rest','oxidize','stale'
  from_state      food_state,                    -- ✓ live enum
  to_state        food_state,                    -- ✓ live enum
  condition_temp_c numeric(5,2),
  condition_humidity_pct numeric(5,2),
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
--  4. NUTRIENT TRANSFORMATION RULES (food-class-aware; not "one number")
-- ═══════════════════════════════════════════════════════════════════════════
-- food_class here is a NUTRITION-behaviour class, distinct from ingredient_category
-- (which has no leafy/root distinction). Kept as text so it can grow; null = general.
create table nutrient_transform_rules (
  id              uuid primary key default uuid_generate_v4(),
  method          text not null,                 -- 'boil','steam','fry','dehydrate','reheat'
  nutrient        text not null,                 -- 'vitamin_c','fat','energy','mass_water'
  food_class      text,                          -- 'leafy_veg','root_veg','red_meat'... null=general
  duration_seconds_ref integer,
  retention_curve jsonb,
  retention_factor numeric(5,3) not null,
  basis           text,                           -- 'per_100g'|'whole'
  notes           text,
  evidence_grade  evidence_grade not null default 'e1_literature',
  evidence_source text,
  confidence      numeric(3,2),
  asserted_at     timestamptz not null default now(),
  unique (method, nutrient, food_class)
);
-- Applier prefers most-specific food_class match, then highest evidence_rank().


-- ═══════════════════════════════════════════════════════════════════════════
--  5. MATERIALIZATION POLICY (audience-scoped ambition)
-- ═══════════════════════════════════════════════════════════════════════════
create table materialization_policies (
  id                 uuid primary key default uuid_generate_v4(),
  scope_kind         text not null check (scope_kind in ('workspace','recipe','product','global_default')),
  scope_id           uuid,
  preexpand_axes     text[],
  servings_breakpoint_mode text not null default 'parameter_below_method_above',
  state_granularity  text not null default 'coarse' check (state_granularity in ('coarse','fine')),
  notes              text,
  created_at         timestamptz not null default now(),
  unique (scope_kind, scope_id)
);
-- Materialize a state if (demand) requested OR (consequence) crossing it sets
-- changes_method/changes_nutrition past threshold OR (audience) resolved policy
-- state_granularity='fine'. Policy precedence: recipe/product > workspace > global_default.


-- ═══════════════════════════════════════════════════════════════════════════
--  6. EVIDENCE RESOLUTION (the ratchet, enforceable)
-- ═══════════════════════════════════════════════════════════════════════════
-- assert_value(table,key,new_value,new_grade,source):
--   no incumbent → insert; rank(new) >  rank(incumbent) → supersede+insert;
--   rank equal → flag for human review; rank lower → record as observation only.
create view target_state_rules_current as
  select distinct on (domain, axis, state_name, coalesce(family_id::text,'*')) *
    from target_state_rules
   where superseded_by is null
   order by domain, axis, state_name, coalesce(family_id::text,'*'),
            evidence_rank(evidence_grade) desc, asserted_at desc;

-- ═══════════════════════════════════════════════════════════════════════════
--  MIGRATION TODO (apply to LIVE tables, separately, when agreed):
--   alter table ingredients add column culinary_role culinary_role;   -- DESIGN NOTE 2
--   -- (later) migrate ingredients.nutrition_source / products.data_source /
--   --  product_cooking_profiles.source onto evidence_grade.
--   -- (decide) DESIGN NOTE 1: extend food_state enum, or add a fine-state table.
-- ═══════════════════════════════════════════════════════════════════════════
