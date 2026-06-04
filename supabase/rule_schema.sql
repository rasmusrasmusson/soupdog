-- ═══════════════════════════════════════════════════════════════════════════
--  SOUPDOG FOOD MODEL — RULE LIBRARY (strawman v0.1)
--  Net-new layer. Sits UNDER the existing recipe/variant schema.
--  The existing variant_* tables become CONSUMERS of these rules.
--  Nothing here exists in the live schema yet. For discussion, not deployment.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0. The unifying primitive: an evidence grade ──────────────────────────
-- Today the schema has scattered ad-hoc source strings:
--   ingredients.nutrition_source = 'usda'|'calculated'|'lab_tested'|'manufacturer'
--   products.data_source         = 'openfoodfacts'|'manufacturer'|'user'|'lab_tested'
--   product_cooking_profiles.source = 'manufacturer'|'user'|'ai_inferred'
-- These are primitive provenance markers. The Food Model unifies them into ONE
-- graded scale used EVERYWHERE a value is asserted.

create type evidence_grade as enum (
  'e0_inferred',        -- applier output, cross-family transfer, small model
  'e1_literature',      -- food-science texts, peer-reviewed, physics
  'e2_expert',          -- hired chef / food scientist asserted or corrected
  'e3_tested',          -- one controlled in-kitchen test
  'e4_validated',       -- repeated independent validation (the apex / moat)
  'u_user_feedback'     -- aggregated ratings / structured interviews (modifies)
);

-- Reusable embedded provenance. Attached to every asserted value below.
-- (In Postgres we inline these columns rather than a composite type, so they're
--  queryable/indexable. Shown grouped here for clarity.)
--   evidence_grade   evidence_grade  not null
--   evidence_source  text            -- citation, expert id, test id, etc. (INTERNAL only)
--   confidence       numeric(3,2)    -- 0..1, optional finer signal within a grade
--   asserted_by      uuid            -- internal: who/what set this (never shown to end users)
--   asserted_at      timestamptz


-- ═══════════════════════════════════════════════════════════════════════════
--  1. ONTOLOGY OF KNOWLEDGE: families and the objects they group
-- ═══════════════════════════════════════════════════════════════════════════

-- A behavioural family: a cluster of food objects that share transformation
-- behaviour. Red-meat cut families are the first instance, but the table is
-- generic (poultry, fish, vegetable, dough families come later).
create table food_families (
  id                uuid primary key default uuid_generate_v4(),
  slug              text not null unique,         -- 'redmeat_tender', 'redmeat_tough'
  name              text not null,                -- 'Tender / low-collagen red meat'
  domain            text not null,                -- 'red_meat','poultry','fish','dough'...
  description       text,
  -- defining attributes (what makes membership true)
  connective_tissue text,                         -- 'low'|'medium'|'high'
  default_method    text,                         -- 'dry_heat'|'moist_heat'|'low_slow'
  evidence_grade    evidence_grade not null default 'e1_literature',
  evidence_source   text,                          -- internal citation
  created_at        timestamptz not null default now()
);

-- Membership of a food object (an ingredient identity) in a family.
-- An ingredient can belong to one family per domain-axis.
create table food_family_members (
  id            uuid primary key default uuid_generate_v4(),
  family_id     uuid not null references food_families(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  -- per-member attributes that modulate rules (thickness, fat %, typical mass)
  attributes    jsonb,                             -- {typical_thickness_mm:25, fat_pct:15}
  evidence_grade evidence_grade not null default 'e1_literature',
  evidence_source text,
  unique (family_id, ingredient_id)
);

-- THE TRANSFER GUARD — the valuable, dangerous part.
-- Explicitly declares which families rules may transfer between, and which must
-- NOT. Default is no transfer; you must assert a permitted relation.
-- This is what stops "ribeye logic" being applied to brisket.
create table family_transfer_rules (
  id              uuid primary key default uuid_generate_v4(),
  from_family_id  uuid not null references food_families(id) on delete cascade,
  to_family_id    uuid not null references food_families(id) on delete cascade,
  transfer        text not null,        -- 'free' | 'with_adjustment' | 'forbidden'
  adjustment_note text,                  -- what must change if 'with_adjustment'
  evidence_grade  evidence_grade not null default 'e2_expert',
  evidence_source text,
  unique (from_family_id, to_family_id)
);


-- ═══════════════════════════════════════════════════════════════════════════
--  2. TRANSFORMATION RULES: target states and how to reach them
-- ═══════════════════════════════════════════════════════════════════════════

-- A target-state rule. For red meat the first instance is DONENESS:
-- a named target defined primarily by internal temperature, near-constant
-- across a family.
create table target_state_rules (
  id                 uuid primary key default uuid_generate_v4(),
  family_id          uuid references food_families(id),  -- null = applies across a domain
  domain             text not null,                       -- 'red_meat'
  axis               text not null,                       -- 'doneness'
  state_name         text not null,                       -- 'medium_rare'
  -- the rule payload
  target_temp_celsius numeric(5,2),                        -- 57.0
  target_temp_range_c  numeric(4,2),                        -- +/- tolerance
  notes               text,
  evidence_grade     evidence_grade not null default 'e1_literature',
  evidence_source    text,
  unique (domain, axis, state_name, family_id)
);

-- A method/scaling rule: how the METHOD changes with a parameter (mass, count),
-- including the breakpoint where a quantity-transform becomes a method-variant.
create table method_rules (
  id                 uuid primary key default uuid_generate_v4(),
  family_id          uuid references food_families(id),
  domain             text not null,                       -- 'red_meat'
  -- the breakpoint: below = scale quantities; at/above = different method
  breakpoint_kind    text not null,                       -- 'total_mass_g'|'piece_count'
  breakpoint_value   numeric(10,2) not null,              -- e.g. 1500 (g) or 4 (pieces)
  below_method       text not null,                       -- 'single_pan_sear'
  at_or_above_method text not null,                       -- 'oven_then_batch_finish'
  capacity_basis     text,                                -- 'equipment_capacity' if inferred
  notes              text,
  evidence_grade     evidence_grade not null default 'e2_expert',
  evidence_source    text,
  unique (domain, family_id, breakpoint_kind)
);

-- Sub-linear scaling factors for non-quantity-proportional ingredients
-- (the spice/salt/leavening problem). Generic across domains.
create table scaling_factor_rules (
  id              uuid primary key default uuid_generate_v4(),
  applies_to      text not null,        -- ingredient_category: 'spice','salt','leavening','aromatic'
  factor_curve    jsonb not null,       -- e.g. {"type":"power","exponent":0.85} or lookup points
  notes           text,
  evidence_grade  evidence_grade not null default 'e2_expert',
  evidence_source text
);


-- ═══════════════════════════════════════════════════════════════════════════
--  3. PASSIVE / TIME TRANSFORMATION RULES (the "20-minute pizza" layer)
-- ═══════════════════════════════════════════════════════════════════════════

-- How a food state changes over time under conditions. Edges driven by time.
create table passive_transform_rules (
  id              uuid primary key default uuid_generate_v4(),
  domain          text not null,                 -- 'dough','red_meat','frozen_product'
  process         text not null,                 -- 'thaw','ferment','rest','oxidize','stale'
  from_state      food_state,                    -- uses existing enum where it fits
  to_state        food_state,
  -- conditions & kinetics
  condition_temp_c numeric(5,2),
  typical_duration_seconds integer,
  effect_note     text,                           -- 'surface temp equalizes; cook time -15%'
  -- consequence flags: does crossing this edge change execution or nutrition?
  changes_method  boolean not null default false,
  changes_nutrition boolean not null default false,
  evidence_grade  evidence_grade not null default 'e1_literature',
  evidence_source text
);


-- ═══════════════════════════════════════════════════════════════════════════
--  4. NUTRIENT TRANSFORMATION RULES (nutrition changes along edges)
-- ═══════════════════════════════════════════════════════════════════════════

-- Retention/gain factors applied when a transformation occurs.
-- Replaces "ingredient list -> add numbers -> done" with edge-aware nutrition.
create table nutrient_transform_rules (
  id              uuid primary key default uuid_generate_v4(),
  method          text not null,                 -- 'boil','steam','fry','dehydrate','reheat'
  nutrient        text not null,                 -- 'vitamin_c','fat','mass_water','energy'
  -- multiplicative retention factor (1.0 = unchanged; >1 = gain e.g. fat in frying)
  retention_factor numeric(5,3) not null,        -- 0.50 = 50% retained
  basis           text,                           -- 'per_100g'|'whole'
  notes           text,
  evidence_grade  evidence_grade not null default 'e1_literature',
  evidence_source text,                            -- e.g. 'USDA retention factor table r12'
  unique (method, nutrient)
);


-- ═══════════════════════════════════════════════════════════════════════════
--  5. MATERIALIZATION POLICY (audience-scoped ambition)
-- ═══════════════════════════════════════════════════════════════════════════

-- Per-workspace ambition: how aggressively to pre-compute states/variants.
-- A food company workspace = high; a consumer recipe = low.
create table materialization_policies (
  id                 uuid primary key default uuid_generate_v4(),
  scope_kind         text not null,        -- 'workspace'|'recipe'|'product'|'global_default'
  scope_id           uuid,                 -- null for global_default
  -- which axes get pre-expanded, and how deep
  preexpand_axes     text[],               -- ['doneness'] for consumer; more for B2B
  servings_breakpoint_mode text not null default 'parameter_below_method_above',
  state_granularity  text not null default 'coarse',  -- 'coarse'|'fine'
  notes              text,
  created_at         timestamptz not null default now()
);
-- A state is materialized if: it's been requested (demand-driven), OR crossing
-- into it changes execution/nutrition past threshold (consequence-driven),
-- OR the policy's state_granularity calls for it (audience-driven).
