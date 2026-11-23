-- Custom SQL migration file, put your code below! --
-- Agentes y encargos. Las instrucciones de un agente pueden llevar memoria del dueño: solo el dueño
-- lee `agent`. Un encargo lo lee quien lo pidió y el dueño. `worker_heartbeat` no tiene política: RLS
-- encendida sin política = nadie lo lee por PostgREST; solo el servidor (rol dueño) lo escribe.
alter table agent enable row level security;
create policy "owners read their org's agents"
  on agent for select
  using (exists (
    select 1 from membership m
    where m.org_id = agent.org_id and m.user_id = auth.uid() and m.role = 'owner'));

alter table agent_task enable row level security;
create policy "requesters and owners read encargos"
  on agent_task for select
  using (agent_task.requested_by = auth.uid() or exists (
    select 1 from membership m
    where m.org_id = agent_task.org_id and m.user_id = auth.uid() and m.role = 'owner'));

alter table worker_heartbeat enable row level security;

grant select on agent, agent_task to authenticated;
