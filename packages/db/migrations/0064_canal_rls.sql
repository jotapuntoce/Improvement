-- Custom SQL migration file, put your code below! --
-- Canal. `channel_member` se lee solo la fila propia (sin auto-referencia: una política que consulta
-- su propia tabla entra en recursión). `channel` y `message` se leen si hay una fila propia en
-- channel_member. El mensaje NO se filtra por deleted_at: el borrado es suave (body vacío por check) y
-- el UPDATE tiene que llegar por Realtime a los miembros; un DELETE físico no lo filtra RLS en Realtime.
alter table channel_member enable row level security;
create policy "members read their own channel memberships"
  on channel_member for select
  using (channel_member.profile_id = auth.uid());

alter table channel enable row level security;
create policy "members read channels they belong to"
  on channel for select
  using (exists (
    select 1 from channel_member cm
    where cm.channel_id = channel.id and cm.profile_id = auth.uid()));

alter table message enable row level security;
create policy "members read messages of channels they belong to"
  on message for select
  using (exists (
    select 1 from channel_member cm
    where cm.channel_id = message.channel_id and cm.profile_id = auth.uid()));

grant select on channel, channel_member, message to authenticated;

-- Realtime Postgres Changes autoriza cada evento contra la política de arriba, por suscriptor.
alter publication supabase_realtime add table message;
