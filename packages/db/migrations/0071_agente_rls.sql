-- El agente de cada persona: lo lee ella y el dueño de su empresa. Nadie más del equipo. Se escribe
-- solo desde el servidor.
alter table agente enable row level security;
create policy "own or owner reads agente" on agente for select using (
  user_id = auth.uid()
  or exists (select 1 from membership m where m.org_id = agente.org_id and m.user_id = auth.uid() and m.role = 'owner'));
grant select on agente to authenticated;
