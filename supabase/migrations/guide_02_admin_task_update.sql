-- guide_02_admin_task_update.sql
-- Lets the ADMIN account curate (UPDATE) ANY task, not just ones it created.
-- The verified core was blessed as role postgres → created_by is NULL → the existing
-- "Update own tasks" policy (created_by = auth.uid()) can't touch them. This adds an
-- admin override. Solo-founder gate: hardcoded admin account id (upgrade to an
-- is_admin flag later). Autocommit style (no BEGIN).
--
-- Rasmus's account id (= person id used elsewhere): b6a30271-7992-406e-8578-da6e2ccf9f19

drop policy if exists tasks_admin_update on tasks;
create policy tasks_admin_update on tasks
  for update to public
  using      (auth.uid() = 'b6a30271-7992-406e-8578-da6e2ccf9f19')
  with check (auth.uid() = 'b6a30271-7992-406e-8578-da6e2ccf9f19');

-- (UPDATE grant already present for authenticated. SELECT policy "Public read tasks"
--  using(true) already lets the row be read back after update — no 42501 on RETURNING.)

-- VERIFY:
-- select policyname, cmd, roles::text, qual, with_check
--   from pg_policies where tablename='tasks' and policyname='tasks_admin_update';
