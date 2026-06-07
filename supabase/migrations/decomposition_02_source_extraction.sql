-- decomposition_02_source_extraction.sql
-- Run in Supabase SQL editor (project npvajzgciuykugqxedmm).
--
-- Adds the hidden step-1 parse to recipe_versions. When a recipe is imported, the
-- faithful rough extraction (the import route's output) is stored here, and the
-- ATOMIC DAG is what the user reviews/saves. Keeping the parse means:
--   - revert / re-decompose costs NO new parse call (the expensive read already ran);
--     the AI re-decomposes from this stored extraction.
--   - an admin debug view can later show "what was extracted before decomposition".
--
-- It belongs on the version (each version was decomposed from one extraction), so a
-- column is the right home — no new table.

alter table recipe_versions
  add column if not exists source_extraction jsonb;

comment on column recipe_versions.source_extraction is
  'Hidden step-1 parse (faithful rough extraction) this version was decomposed from. Revert/re-decompose source. Not user-facing (admin debug only).';

-- column-level grants caveat (the recurring lesson): a plain grant is ignored unless
-- every column is granted, so re-grant ALL after adding a column.
grant all on recipe_versions to anon, authenticated;

-- VERIFY:
--   select column_name from information_schema.columns
--   where table_name='recipe_versions' and column_name='source_extraction';
