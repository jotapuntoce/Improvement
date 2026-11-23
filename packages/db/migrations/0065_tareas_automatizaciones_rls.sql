-- Tareas: cada quien lee las suyas; el dueño, todas las de su empresa. Los pasos siguen a su tarea.
-- Permisos del copiloto: cada quien los suyos. Reglas y corridas: solo el dueño (configuración del
-- negocio). Todo se escribe solo desde el servidor.
alter table task enable row level security;
create policy "assignee or owner reads tasks" on task for select using (
  assignee_id = auth.uid()
  or exists (select 1 from membership m where m.org_id = task.org_id and m.user_id = auth.uid() and m.role = 'owner'));
alter table task_step enable row level security;
create policy "steps follow their task" on task_step for select using (
  exists (select 1 from task t where t.id = task_step.task_id and (t.assignee_id = auth.uid()
    or exists (select 1 from membership m where m.org_id = t.org_id and m.user_id = auth.uid() and m.role = 'owner'))));
alter table agent_permission enable row level security;
create policy "each person reads own agent permissions" on agent_permission for select using (user_id = auth.uid());
alter table automation_rule enable row level security;
create policy "owners read automation rules" on automation_rule for select using (
  exists (select 1 from membership m where m.org_id = automation_rule.org_id and m.user_id = auth.uid() and m.role = 'owner'));
alter table automation_run enable row level security;
create policy "owners read automation runs" on automation_run for select using (
  exists (select 1 from membership m where m.org_id = automation_run.org_id and m.user_id = auth.uid() and m.role = 'owner'));
grant select on task, task_step, agent_permission, automation_rule, automation_run to authenticated;
