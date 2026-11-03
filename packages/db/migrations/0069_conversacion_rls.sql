-- Conversación con Improvement o con el agente del rol: solo la persona la lee. Ni el dueño lee la de
-- un empleado. Se escribe solo desde el servidor.
alter table agent_message enable row level security;
create policy "own reads agent messages" on agent_message for select using (user_id = auth.uid());
grant select on agent_message to authenticated;
