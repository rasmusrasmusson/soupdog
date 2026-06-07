-- guide_00_task_schema.sql
-- Phase A, step 0 — schema additions for the Culinary Knowledge Layer
-- (docs/Soupdog_Culinary_Knowledge_Layer_Design_v0_3.md §2c, §2d).
-- Autocommit style (no BEGIN). Idempotent (IF NOT EXISTS / guarded enum creates).

-- ── §2c: typed completion signal ──────────────────────────────────────────
-- Doneness = a measured quantity crossing a threshold. WHICH quantity matters
-- (probe vs camera vs scale vs timer) — appliance-grade. Extensible enum.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'completion_type') then
    create type completion_type as enum (
      'time',          -- elapsed from task start ("9 minutes")
      'core_temp',     -- internal probe ("until 74C internal")
      'surface_temp',  -- surface/IR ("pan to 180C")
      'color',         -- optical/camera ("until golden")
      'volume',        -- "reduce by half"
      'mass',          -- "until reduced to 200g"
      'texture',       -- viscosity/firmness ("coats the spoon", "fork-tender")
      'structural',    -- visual structural state ("until set", "until boiling")
      'aroma',         -- "until fragrant"
      'ph',            -- "until acidified to pH X" (pickle/ferment/cure)
      'subjective'     -- "to taste" / irreducibly human
    );
  end if;
end $$;

alter table tasks add column if not exists completion_type   completion_type;
alter table tasks add column if not exists completion_target text;
-- completion_criterion (existing text) stays = the HUMAN phrasing.
-- completion_measurable (existing bool) becomes derivable (type != 'subjective');
-- left in place, no longer authoritative.

-- ── §2d: principled technique taxonomy (heat mechanism + medium) ───────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'heat_mechanism') then
    create type heat_mechanism as enum (
      'conduction','convection','radiation','dielectric','combination','none'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'heat_medium') then
    create type heat_medium as enum (
      'fat','water','steam','air','direct','none'
    );
  end if;
end $$;

alter table tasks add column if not exists heat_mechanism heat_mechanism;
alter table tasks add column if not exists heat_medium    heat_medium;

-- ── grants (column-level grant lesson: re-grant after adding columns) ──
grant all on tasks to anon, authenticated;

-- ── VERIFY ──
-- select column_name, data_type, udt_name from information_schema.columns
--   where table_name='tasks'
--     and column_name in ('completion_type','completion_target','heat_mechanism','heat_medium');
