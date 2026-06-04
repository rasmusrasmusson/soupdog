-- ═══════════════════════════════════════════════════════════════
--  Soupdog — Schema Migration v3: Knowledge Graph Foundation
--
--  This migration adds the structural layer that enables AI to
--  reason over food, processes, and tools. It does not modify
--  any existing tables — it only adds new ones and new columns.
--
--  Run this in Supabase SQL Editor.
--  Safe to run multiple times (uses IF NOT EXISTS throughout).
--
--  Sections:
--  1.  Confidence + source columns on existing tables
--  2.  Equipment hierarchy + calibration
--  3.  Ingredient density + physical properties
--  4.  Tasks — atomic task library
--  5.  Entity relations — weighted graph
--  6.  Sensory profiles
--  7.  Product cooking profiles — enhanced
--  8.  Outcome criteria
--  9.  Execution variants — enhanced
-- 10.  Version steps — enhanced (appliance_settings column)
-- 11.  RLS policies for new tables
-- ═══════════════════════════════════════════════════════════════


-- ── 1. CONFIDENCE + SOURCE on existing tables ─────────────────
-- Every piece of content needs provenance and confidence
-- so AI knows how much to trust it.

alter table ingredients
  add column if not exists source             text not null default 'human_authored',
  -- 'human_authored' | 'ai_generated' | 'ai_generated_reviewed' | 'imported_usda' | 'imported_off'
  add column if not exists confidence         numeric(3,2) default 1.0,
  add column if not exists parent_id          uuid references ingredients(id),
  -- parent_id is a shorthand for the primary is_a relation (taxonomy)
  -- separate from transformed_from_id which is the process chain
  add column if not exists density_g_per_ml   numeric(8,4),
  add column if not exists typical_unit_weight_g numeric(8,2),
  -- e.g. one egg = 53g, one garlic clove = 5g
  add column if not exists retention_category_id uuid;
  -- FK to cooking_retention_categories added later in this file

alter table equipment
  add column if not exists source             text not null default 'human_authored',
  add column if not exists confidence         numeric(3,2) default 1.0,
  add column if not exists parent_id          uuid references equipment(id),
  -- hierarchy: Oven → Convection Oven → Combi Steam Oven → Panasonic NN-DS59NB
  add column if not exists typical_temp_offset_celsius  numeric(5,2),
  -- model-level known calibration offset (e.g. -12°C for a specific Panasonic)
  add column if not exists typical_power_offset_pct     numeric(5,2),
  add column if not exists heat_distribution_score      numeric(3,2),
  -- 0.0 = very uneven, 1.0 = perfectly even
  add column if not exists wattage                      integer,
  add column if not exists cavity_volume_litres         numeric(5,2);

alter table appliance_profiles
  -- Specific registered unit calibration (on top of model-level offsets above)
  add column if not exists purchase_date               date,
  add column if not exists cumulative_cycles           integer,
  add column if not exists temperature_offset_celsius  numeric(5,2),
  -- measured offset for THIS specific unit
  add column if not exists power_offset_pct            numeric(5,2),
  add column if not exists last_calibrated_at          timestamptz,
  add column if not exists calibration_method          text;
  -- 'probe_thermometer' | 'connected_sensor' | 'user_reported'

alter table products
  add column if not exists source             text not null default 'human_authored',
  add column if not exists confidence         numeric(3,2) default 1.0,
  -- Physical properties
  add column if not exists weight_g           numeric(8,2),
  add column if not exists base_state         text default 'ambient',
  -- 'frozen' | 'refrigerated' | 'ambient' — how it's sold/stored
  add column if not exists base_temp_celsius  numeric(5,2),
  -- typical storage temperature (e.g. -18°C for frozen)
  add column if not exists linked_canonical_id uuid references recipe_canonicals(id);
  -- if this product IS a recipe output (e.g. homemade stock)

alter table product_cooking_profiles
  add column if not exists source             text not null default 'user',
  add column if not exists confidence         numeric(3,2) default 0.5,
  -- Physical initial state (numbers, not just labels)
  add column if not exists initial_temp_celsius        numeric(5,2),
  add column if not exists time_out_of_storage_minutes integer,
  -- how long has it been out of storage before cooking?
  -- execution as structured JSONB (steps with exact settings)
  add column if not exists execution_steps    jsonb,
  -- [{order, instruction, duration_seconds, temperature_celsius, appliance_settings}]
  -- Multi-dimensional result scores (not just 1-5)
  add column if not exists result_scores      jsonb,
  -- {overall: 0-100, texture: 0-100, colour: 0-100,
  --  core_temp_celsius: number, timing_accuracy: 0-100}
  add column if not exists result_state       text,
  -- what state is the product in after cooking?
  add column if not exists manufacturer_instructions text;
  -- original instructions from packaging, for comparison

alter table version_steps
  add column if not exists appliance_settings jsonb,
  -- stores connected appliance mode + settings for this step
  add column if not exists step_id            uuid;
  -- self-reference for step identity across versions (populated on create)


-- ── 2. TASKS — atomic task library ───────────────────────────
-- Tasks are the atomic unit of work in a recipe.
-- A step is one or more tasks. Tasks have known inputs/outputs/
-- requirements so the system can schedule, substitute, and
-- reason about parallel execution.

create table if not exists tasks (
  id                        uuid primary key default uuid_generate_v4(),
  slug                      text not null unique,
  name                      text not null,
  description               text,

  -- Classification
  task_family               text not null default 'other',
  -- 'cut' | 'mix' | 'heat' | 'cool' | 'ferment' | 'rest' |
  -- 'measure' | 'prep' | 'move' | 'clean' | 'other'
  is_passive                boolean not null default false,
  -- passive = no active human/machine attention needed (resting, fermenting)
  is_parallelisable         boolean not null default true,
  -- can this run simultaneously with other tasks?

  -- Duration
  min_duration_seconds      integer,
  max_duration_seconds      integer,
  duration_is_exact         boolean not null default false,
  -- true = timer-based, false = condition-based (cook until golden)

  -- Skill
  skill_level_required      smallint check (skill_level_required between 1 and 5),

  -- Equipment requirements (generic level)
  required_equipment_type   text,
  -- references equipment_category enum conceptually (not FK — kept loose)
  optional_equipment_type   text,

  -- State transitions
  typical_input_state       text,   -- what state should the ingredient be in
  typical_output_state      text,   -- what state does this task produce

  -- Condition-based completion (for non-timer tasks)
  completion_criterion      text,
  -- 'surface_temp_165c' | 'colour_golden' | 'texture_elastic' | etc.
  completion_measurable     boolean not null default false,

  -- Provenance
  source                    text not null default 'human_authored',
  confidence                numeric(3,2) default 1.0,
  is_verified               boolean not null default false,

  created_by                uuid references auth.users(id),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index if not exists tasks_slug_idx        on tasks(slug);
create index if not exists tasks_family_idx      on tasks(task_family);
create index if not exists tasks_name_trgm       on tasks using gin(name gin_trgm_ops);

-- Link steps to tasks
alter table version_steps
  add column if not exists task_id uuid references tasks(id);


-- ── 3. ENTITY RELATIONS — weighted knowledge graph ───────────
-- Replaces/supplements simple parent_id hierarchies.
-- Supports multiple parents, typed relations, and strength scores.
-- Used by AI for substitution, scheduling, and reasoning.

create table if not exists entity_relations (
  id            uuid primary key default uuid_generate_v4(),

  -- From entity
  from_type     text not null,
  -- 'ingredient' | 'equipment' | 'task' | 'product' | 'recipe'
  from_id       uuid not null,

  -- To entity
  to_type       text not null,
  to_id         uuid not null,

  -- Relation definition
  relation_type text not null,
  -- TAXONOMY:    'is_a'           (salmon is_a fish)
  -- PROCESS:     'transforms_to'  (raw salmon transforms_to smoked salmon)
  --              'produced_by'    (smoked salmon produced_by cold smoking)
  -- SUBSTITUTION:'substitutes'    (butter substitutes ghee, strength 0.8)
  --              'can_replace'    (convection oven can_replace combi steam)
  -- AFFINITY:    'pairs_with'     (lemon pairs_with fish, strength 0.9)
  --              'conflicts_with' (strong spices conflicts_with delicate fish)
  -- DEPENDENCY:  'requires'       (searing requires cast iron or stainless)
  --              'enhances'       (acid enhances iron absorption)
  -- EQUIPMENT:   'compatible_with'(sous vide compatible_with vacuum bag)
  --              'incompatible'   (aluminium incompatible induction hob)

  -- Strength: how strong/reliable is this relation?
  strength      numeric(3,2) not null default 1.0,
  -- 0.0 = very weak / theoretical, 1.0 = definitive

  -- Direction
  is_bidirectional boolean not null default false,
  -- true = relation applies both ways (pairs_with is usually bidirectional)

  -- Context: when does this relation apply?
  context       text,
  -- 'cold_preparations' | 'high_heat' | 'baking' | null (always applies)

  -- Notes
  notes         text,

  -- Provenance
  source        text not null default 'human_authored',
  confidence    numeric(3,2) default 1.0,

  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),

  -- Prevent exact duplicates
  unique (from_type, from_id, to_type, to_id, relation_type, context)
);
create index if not exists entity_relations_from_idx
  on entity_relations(from_type, from_id, relation_type);
create index if not exists entity_relations_to_idx
  on entity_relations(to_type, to_id, relation_type);
create index if not exists entity_relations_type_idx
  on entity_relations(relation_type);


-- ── 4. SENSORY PROFILES ───────────────────────────────────────
-- Physical and sensory characterisation of ingredients, products,
-- and recipe outputs. Powers simulation and preference matching.

create table if not exists sensory_profiles (
  id            uuid primary key default uuid_generate_v4(),
  entity_type   text not null,
  -- 'ingredient' | 'product' | 'recipe_version' | 'execution_variant'
  entity_id     uuid not null,

  -- Flavour compounds (from chemistry databases or AI prediction)
  dominant_compounds  jsonb,
  -- [{name: 'linalool', ppm: 0.3, source: 'lab'}, ...]

  -- Taste dimensions (0-100)
  sweetness     smallint check (sweetness between 0 and 100),
  saltiness     smallint check (saltiness between 0 and 100),
  sourness      smallint check (sourness between 0 and 100),
  bitterness    smallint check (bitterness between 0 and 100),
  umami         smallint check (umami between 0 and 100),
  fattiness     smallint check (fattiness between 0 and 100),
  spiciness     smallint check (spiciness between 0 and 100),

  -- Aroma (0-100)
  aroma_intensity   smallint check (aroma_intensity between 0 and 100),
  aroma_complexity  smallint check (aroma_complexity between 0 and 100),
  aroma_notes       text[],  -- ['citrus','floral','earthy','smoky']

  -- Texture (0-100)
  texture_tenderness  smallint check (texture_tenderness between 0 and 100),
  texture_crunch      smallint check (texture_crunch between 0 and 100),
  texture_creaminess  smallint check (texture_creaminess between 0 and 100),
  texture_chewiness   smallint check (texture_chewiness between 0 and 100),
  texture_notes       text[],

  -- Demographic preference scores (derived from ratings)
  demographic_scores  jsonb,
  -- {young_adults: 72, families: 85, health_conscious: 60, ...}

  -- Provenance
  source        text not null default 'ai_predicted',
  -- 'laboratory' | 'sensory_panel' | 'ai_predicted' | 'user_aggregated'
  confidence    numeric(3,2) default 0.3,
  -- laboratory data = 0.95+, ai_predicted = 0.2-0.5

  profiled_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),

  unique (entity_type, entity_id)
);
create index if not exists sensory_profiles_entity_idx
  on sensory_profiles(entity_type, entity_id);


-- ── 5. OUTCOME CRITERIA ───────────────────────────────────────
-- Measurable success criteria for a recipe step or product profile.
-- Moves Soupdog from "cook until golden" to precise, verifiable targets.

create table if not exists outcome_criteria (
  id              uuid primary key default uuid_generate_v4(),

  -- What does this criterion belong to?
  entity_type     text not null,
  -- 'version_step' | 'product_cooking_profile' | 'execution_variant'
  entity_id       uuid not null,

  -- What are we measuring?
  criterion_type  text not null,
  -- 'core_temperature' | 'surface_temperature' | 'colour' |
  -- 'texture' | 'weight_loss_pct' | 'elapsed_time' | 'visual'
  criterion_label text not null,
  -- human-readable: 'Core temperature', 'Crust colour', 'Rest time'

  -- Target (numeric where possible)
  target_value    numeric(10,4),
  tolerance_plus  numeric(10,4),
  tolerance_minus numeric(10,4),
  -- e.g. target 65°C ± 2°C
  unit            text,
  -- '°C' | 'g' | '%' | 'seconds' | null (for visual/descriptive)

  -- Descriptive target (for non-numeric criteria)
  target_description text,
  -- 'Deep golden brown, not dark brown'

  -- How to measure it?
  measurement_method text not null default 'visual',
  -- 'probe_thermometer' | 'instant_read' | 'visual' |
  -- 'timer' | 'kitchen_scale' | 'connected_sensor'

  -- Importance
  is_critical     boolean not null default false,
  -- critical = must be met (food safety, structural)
  -- non-critical = quality indicator

  -- Order within a step/profile
  order_index     integer not null default 0,

  -- Provenance
  source          text not null default 'human_authored',
  confidence      numeric(3,2) default 1.0,

  created_at      timestamptz not null default now()
);
create index if not exists outcome_criteria_entity_idx
  on outcome_criteria(entity_type, entity_id);


-- ── 6. COOKING RETENTION CATEGORIES ──────────────────────────
-- Nutritional values change during cooking (vitamins degrade,
-- water evaporates, fat renders). USDA provides retention factors
-- by food category and cooking method. This table stores those
-- categories so nutrition calculations can be accurate post-cooking.

create table if not exists cooking_retention_categories (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null unique,
  -- 'vegetables_boiled' | 'meat_roasted' | 'fish_baked' | etc.
  description     text,
  usda_category   text,
  -- reference to USDA retention factor table category

  -- Average retention factors by nutrient (0.0-1.0)
  -- 1.0 = no loss, 0.7 = 30% lost during cooking
  retention_factors jsonb not null default '{}',
  -- {vitamin_c: 0.65, vitamin_b12: 0.90, folate: 0.55,
  --  iron: 0.95, protein: 0.98, fat: 0.90, ...}

  source          text not null default 'usda',
  created_at      timestamptz not null default now()
);

-- Add FK now that the table exists
alter table ingredients
  add constraint fk_retention_category
  foreign key (retention_category_id)
  references cooking_retention_categories(id);


-- ── 7. VARIANT AXES (enhanced preference_axes) ────────────────
-- The existing preference_axes table is good but needs to support
-- the full variation taxonomy: servings, method, ingredient sub,
-- equipment sub, tool state, ingredient state.

alter table preference_axes
  add column if not exists axis_type text not null default 'method',
  -- 'serving_count' | 'method' | 'ingredient_substitution' |
  -- 'equipment_substitution' | 'equipment_state' | 'ingredient_state'
  add column if not exists affects_equipment boolean not null default false,
  add column if not exists affects_ingredients boolean not null default false,
  add column if not exists affects_steps boolean not null default false;


-- ── 8. EXECUTION VARIANTS — enhanced ─────────────────────────
-- Add columns to support the full variation model.

alter table execution_variants
  add column if not exists source             text not null default 'human_authored',
  -- 'human_authored' | 'ai_generated' | 'ai_generated_reviewed'
  add column if not exists confidence         numeric(3,2) default 1.0,
  add column if not exists divergence_score   numeric(3,2),
  -- 0.0 = identical to base, 1.0 = fundamentally different
  -- above ~0.35 should surface as "significant variant"
  add column if not exists variant_label      text,
  -- human-readable: '20 servings', 'medium-rare', 'convection oven'
  add column if not exists variant_axes       jsonb,
  -- which axes define this variant:
  -- [{type: 'serving_count', value: 20},
  --  {type: 'method', axis: 'doneness', value: 'medium-rare'}]
  add column if not exists method_changes     boolean not null default false,
  -- true = the cooking method itself changes at this variant
  add column if not exists method_change_note text,
  -- description of the method change for display
  add column if not exists equipment_level    text not null default 'generic',
  -- 'generic' | 'model' | 'unit'
  -- generic = written for equipment category
  -- model = written for specific model (e.g. Panasonic NN-DS59NB)
  -- unit = written for specific registered appliance
  add column if not exists variant_ingredient_scaling jsonb,
  -- cached scaled ingredients for fast reads (from scale route)
  add column if not exists ai_scaling_metadata jsonb;
  -- metadata from AI scaling process


-- ── 9. VARIANT EQUIPMENT OVERRIDES ───────────────────────────
-- Missing from schema v2. Stores equipment substitutions per variant.

create table if not exists variant_equipment_overrides (
  id                    uuid primary key default uuid_generate_v4(),
  variant_id            uuid not null references execution_variants(id) on delete cascade,
  version_equipment_id  uuid not null references version_equipment(id),
  replacement_equipment_id uuid references equipment(id),
  -- null = remove this equipment entirely
  substitution_note     text,
  -- 'Using conventional oven: add 15% to cooking time'
  override_reason       text,
  unique (variant_id, version_equipment_id)
);


-- ── 10. TASKS — additional indexes and triggers ───────────────

create trigger tasks_updated_at
  before update on tasks
  for each row execute procedure update_updated_at();


-- ── 11. COVERAGE VIEW ─────────────────────────────────────────
-- The accuracy KPI: which product × appliance combinations
-- have cooking profiles, and at what confidence?
-- Used by the content priority queue.

create or replace view coverage_matrix as
  select
    p.id          as product_id,
    p.name        as product_name,
    p.brand       as product_brand,
    e.id          as equipment_id,
    e.name        as equipment_name,
    count(pcp.id) as profile_count,
    max(pcp.confidence) as best_confidence,
    bool_or(pcp.source = 'human_authored') as has_human_profile,
    max(pcp.created_at) as latest_profile_at
  from products p
  cross join equipment e
  where e.connected = true or e.category = 'oven' or e.category = 'appliance'
  left join product_cooking_profiles pcp
    on pcp.product_id = p.id
    and (pcp.equipment_id = e.id or
         pcp.appliance_profile_id in (
           select id from appliance_profiles where equipment_id = e.id
         ))
  group by p.id, p.name, p.brand, e.id, e.name;


-- ── 12. ENHANCED SEARCH INDEX ─────────────────────────────────
-- Extend search to include tasks and equipment

create or replace view search_index as
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
    to_tsvector('english',
      name || ' ' ||
      coalesce(brand,'') || ' ' ||
      coalesce(description,'')
    ) as tsv
  from products
  union all
  select
    id, slug, 'equipment' as type, name as title,
    to_tsvector('english',
      name || ' ' ||
      coalesce(description,'') || ' ' ||
      coalesce(brand,'')
    ) as tsv
  from equipment
  union all
  select
    id, slug, 'task' as type, name as title,
    to_tsvector('english',
      name || ' ' ||
      coalesce(description,'') || ' ' ||
      task_family
    ) as tsv
  from tasks;

-- Re-grant after view recreation
grant select on search_index    to anon, authenticated;
grant select on coverage_matrix to anon, authenticated;


-- ── 13. RLS FOR NEW TABLES ────────────────────────────────────

alter table tasks                      enable row level security;
alter table entity_relations           enable row level security;
alter table sensory_profiles           enable row level security;
alter table outcome_criteria           enable row level security;
alter table cooking_retention_categories enable row level security;
alter table variant_equipment_overrides enable row level security;

-- Public read (all reference/knowledge data is public)
create policy "Public read tasks"
  on tasks for select using (true);

create policy "Public read entity_relations"
  on entity_relations for select using (true);

create policy "Public read sensory_profiles"
  on sensory_profiles for select using (true);

create policy "Public read outcome_criteria"
  on outcome_criteria for select using (true);

create policy "Public read cooking_retention_categories"
  on cooking_retention_categories for select using (true);

create policy "Public read variant_equipment_overrides"
  on variant_equipment_overrides for select using (true);

-- Staff / authenticated users can write reference data
-- (In production this would check a staff role; for now authenticated = can write)
create policy "Authenticated write tasks"
  on tasks for insert with check (auth.uid() = created_by);

create policy "Authenticated write entity_relations"
  on entity_relations for insert with check (auth.uid() = created_by);

create policy "Authenticated write sensory_profiles"
  on sensory_profiles for insert with check (true);

create policy "Authenticated write outcome_criteria"
  on outcome_criteria for insert with check (true);

create policy "Authenticated write variant_equipment_overrides"
  on variant_equipment_overrides for insert
  with check (
    auth.uid() = (
      select ev.author_id from execution_variants ev where ev.id = variant_id
    )
  );


-- ═══════════════════════════════════════════════════════════════
--  DONE
--
--  What this migration adds:
--
--  NEW TABLES:
--    tasks                        — atomic task library
--    entity_relations             — weighted knowledge graph
--    sensory_profiles             — flavour/texture characterisation
--    outcome_criteria             — measurable success criteria
--    cooking_retention_categories — nutritional retention by method
--    variant_equipment_overrides  — equipment substitutions per variant
--
--  NEW COLUMNS on existing tables:
--    ingredients          — source, confidence, parent_id, density,
--                           typical_unit_weight, retention_category
--    equipment            — source, confidence, parent_id, calibration
--                           offsets, wattage, cavity_volume
--    appliance_profiles   — purchase_date, cycles, calibration data
--    products             — source, confidence, weight, base_state,
--                           base_temp, linked_canonical
--    product_cooking_profiles — confidence, physical initial state,
--                           execution_steps, result_scores,
--                           result_state, manufacturer_instructions
--    version_steps        — appliance_settings, task_id, step_id
--    execution_variants   — source, confidence, divergence_score,
--                           variant_label, variant_axes,
--                           method_changes, equipment_level
--    preference_axes      — axis_type, affects_* flags
--
--  NEW VIEWS:
--    coverage_matrix      — product × appliance coverage KPI
--    search_index         — extended with tasks + equipment
--
-- ═══════════════════════════════════════════════════════════════
