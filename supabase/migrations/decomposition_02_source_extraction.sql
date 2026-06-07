-- guide_02_admin_task_update.sql  (CORRECTED — real auth.users ids, both accounts)
-- The earlier version was keyed to the PERSON id (b6a30271-...), not the ACCOUNT id.
-- auth.uid() returns the AUTH account id. Rasmus's two accounts:
--   bb02ae50-436c-4402-8c8c-447344e10151  (rr@varm.io)
--   1a0f72dd-f0a7-487c-9ecd-7ef898f8dabf  (rr@le.works)
-- Lets either admin account UPDATE any task (curation). Autocommit (no BEGIN).

drop policy if exists tasks_admin_update on tasks;
create policy tasks_admin_update on tasks
  for update to public
  using      (auth.uid() in ('bb02ae50-436c-4402-8c8c-447344e10151','1a0f72dd-f0a7-487c-9ecd-7ef898f8dabf'))
  with check (auth.uid() in ('bb02ae50-436c-4402-8c8c-447344e10151','1a0f72dd-f0a7-487c-9ecd-7ef898f8dabf'));

-- VERIFY:
-- select policyname, cmd, qual from pg_policies
--   where tablename='tasks' and policyname='tasks_admin_update';
