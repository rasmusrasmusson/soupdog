-- supabase/migrations/tools_03_archive.sql
-- Soft-delete (archive) support for equipment/tools.
-- NULL archived_at = live; a timestamp = archived (hidden from public, reversible).

alter table equipment add column if not exists archived_at timestamptz;
create index if not exists equipment_archived_at_idx on equipment (archived_at);

-- Re-grant after adding a column (column-level grants can drop the new column otherwise).
grant all on equipment to authenticated;

-- Archiving/unarchiving goes through the existing equipment_admin_update RLS policy
-- (it's an UPDATE of archived_at), so no new policy is needed — provided
-- equipment_admin_update already exists for the admin accounts.
