-- decomposition_01_step_dependencies.sql
-- Run in Supabase SQL editor (project npvajzgciuykugqxedmm).
-- The ONE genuinely-new piece of schema for atomic decomposition: explicit DAG edges.
--
-- WHY THIS EXISTS (audited 2026-06-07): version_steps already has order_index
-- (linear sequence), parallel_group_id / is_parallel_prev (siblings run together),
-- blocking, and group_label (section name). NONE of these express "this step
-- consumes the output of those steps". parallel_group_id says these run at the same
-- time; it does NOT say step 12 needs the intermediate from steps 3-5. The DAG edge
-- is new information. We model it as an explicit join table (NOT a uuid[] column),
-- matching how version_sub_recipes models composition as its own table, and avoiding
-- the untyped/implicit-reference pain that caused the mirror-table and self-FK traps.
--
-- An edge means: step `step_id` depends on (consumes the output of) `depends_on_step_id`.
-- Linear "next depends on prev" is just one possible edge set; independent prep
-- sub-graphs simply have no edge between them (that's the parallelism the DAG captures).

create table if not exists version_step_dependencies (
  id uuid primary key default gen_random_uuid(),
  -- both ends are steps within the SAME recipe version (enforced in code at insert)
  step_id uuid not null references version_steps(id) on delete cascade,
  depends_on_step_id uuid not null references version_steps(id) on delete cascade,
  -- optional human label for what flows along this edge ("masala base", "chopped onion").
  -- when the producing step(s) form a named/derived group, this is the intermediate's name.
  consumes_intermediate_label text,
  created_at timestamptz not null default now(),
  -- a step cannot depend on itself; a given edge is unique
  constraint vsd_no_self_edge check (step_id <> depends_on_step_id),
  constraint vsd_unique_edge unique (step_id, depends_on_step_id)
);

-- backward traversal ("what consumes this step's output?") and forward ("what does
-- this step need first?") are both common — index both directions.
create index if not exists idx_vsd_step on version_step_dependencies(step_id);
create index if not exists idx_vsd_depends_on on version_step_dependencies(depends_on_step_id);

-- RLS + GRANTS (the recurring two-halves rule: a new table is invisible to the app
-- without BOTH a policy AND a grant, even though it's visible to postgres in the editor).
alter table version_step_dependencies enable row level security;

-- Edges are recipe content, readable by anyone who can read the recipe. version_steps
-- itself is already world-readable for published recipes via the recipe read path, so
-- edges follow the same openness. Scope to public (NOT `to authenticated` — on this DB
-- the authenticated role does not resolve in policies; public + auth.uid() is the
-- working pattern, though here SELECT is simply open like the rest of recipe content).
drop policy if exists vsd_select on version_step_dependencies;
create policy vsd_select on version_step_dependencies
  for select to public using (true);

-- Writes happen server-side during import/decomposition. The recipe insert path runs
-- as the authoring user; allow insert/update/delete for rows whose step belongs to a
-- version the caller authored. Kept simple + public-scoped; tighten later alongside the
-- recipe-write policies if needed.
drop policy if exists vsd_write on version_step_dependencies;
create policy vsd_write on version_step_dependencies
  for all to public
  using (
    exists (
      select 1
      from version_steps vs
      join recipe_versions rv on rv.id = vs.version_id
      join recipe_canonicals rc on rc.id = rv.canonical_id
      where vs.id = version_step_dependencies.step_id
        and rc.author_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from version_steps vs
      join recipe_versions rv on rv.id = vs.version_id
      join recipe_canonicals rc on rc.id = rv.canonical_id
      where vs.id = version_step_dependencies.step_id
        and rc.author_id = auth.uid()
    )
  );

-- column-level grants caveat: a plain `grant insert` is ignored unless every column is
-- granted, so grant ALL and re-run after any future column add.
grant select, insert, update, delete on version_step_dependencies to anon, authenticated;

-- gen_random_uuid() is built-in (no execute grant needed, unlike uuid_generate_v4()).

-- VERIFY:
--   select count(*) from version_step_dependencies;            -- 0, table exists
--   insert ... then select to confirm RLS lets the author read back.
