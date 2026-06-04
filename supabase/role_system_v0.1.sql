-- ═══════════════════════════════════════════════════════════════════════════
--  SOUPDOG FOOD MODEL — CULINARY ROLE SYSTEM (strawman, companion to design v0.4)
--  Reconciled against the live schema (ingredients, version_ingredients exist).
--  Net-new tables + a small addition to version_ingredients.
--  Transformation/state "roles" are intentionally EXCLUDED (they are lineage
--  position and transformations, not functional roles — see design §5.4).
--  For discussion, not deployment.
-- ═══════════════════════════════════════════════════════════════════════════

-- Reuses evidence_grade from rule_schema v0.3. If loading standalone, define it.
-- create type evidence_grade as enum ('e0_inferred','e1_literature','e2_expert','e3_tested','e4_validated','u_user_feedback');

-- ── 1. Hierarchical role vocabulary (LOOKUP TABLE, not enum) ───────────────
-- Integrity via FK; extensible by inserting rows (no migration) — the lesson
-- from the rigid food_state enum.

create table culinary_role_categories (
  id    uuid primary key default uuid_generate_v4(),
  slug  text not null unique,     -- 'structure','flavor','texture','baking','appearance','preservation','process'
  name  text not null,
  sort_order int
);

create table culinary_roles (
  id          uuid primary key default uuid_generate_v4(),
  category_id uuid not null references culinary_role_categories(id),
  slug        text not null unique,   -- 'emulsifier','leavening','salt'...
  name        text not null,
  description text,
  -- 'process' roles are inherently contextual (water as 'carrier' only when used so)
  is_contextual_only boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ── 2. INTRINSIC capabilities: what an ingredient CAN do (many-to-many) ────
-- Lives on the ingredient. Egg -> {protein, binder, emulsifier, foaming_agent}.
create table ingredient_roles (
  id            uuid primary key default uuid_generate_v4(),
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  role_id       uuid not null references culinary_roles(id) on delete cascade,
  -- a default/typical primary capability flag (most recipes use egg as protein/binder)
  is_typical_primary boolean not null default false,
  evidence_grade evidence_grade not null default 'e1_literature',
  evidence_source text,
  confidence    numeric(3,2),
  asserted_at   timestamptz not null default now(),
  unique (ingredient_id, role_id)
);

-- ── 3. CONTEXTUAL role: what the ingredient is DOING in THIS recipe ────────
-- Lives on the recipe-ingredient. Adds a join beside version_ingredients so an
-- ingredient can carry a PRIMARY + secondary roles per recipe version.
-- RECONCILE: version_ingredients(id) is the live PK to reference.
create table version_ingredient_roles (
  id                    uuid primary key default uuid_generate_v4(),
  version_ingredient_id uuid not null references version_ingredients(id) on delete cascade,
  role_id               uuid not null references culinary_roles(id),
  is_primary            boolean not null default false,
  evidence_grade        evidence_grade not null default 'e2_expert',
  evidence_source       text,
  asserted_at           timestamptz not null default now(),
  unique (version_ingredient_id, role_id)
);
-- Integrity intent (enforce in app or trigger):
--   • at most ONE is_primary=true per version_ingredient_id;
--   • a contextual role SHOULD be among the ingredient's intrinsic capabilities
--     (ingredient_roles), UNLESS the role is_contextual_only (e.g. 'carrier').
--   These are not pure column constraints; enforce on write.

-- ── 4. What this enables ───────────────────────────────────────────────────
-- Scaling:      read the CONTEXTUAL primary role -> scaling_factor_rules.
-- Substitution: read INTRINSIC capabilities -> "what else can emulsify?"
-- Both axes available because both layers are modelled from the start.
