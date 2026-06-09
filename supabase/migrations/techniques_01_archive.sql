-- supabase/migrations/techniques_01_archive.sql
-- Soft-delete (archive) support for tasks/techniques — mirrors equipment.
-- NULL archived_at = live; a timestamp = archived (hidden from public, reversible).

alter table tasks add column if not exists archived_at timestamptz;
create index if not exists tasks_archived_at_idx on tasks (archived_at);

-- Re-grant after adding a column (column-level grants can drop the new column otherwise).
grant all on tasks to authenticated;

-- Archiving/unarchiving goes through the existing tasks_admin_update RLS policy
-- (it's an UPDATE of archived_at), so no new policy is needed.
