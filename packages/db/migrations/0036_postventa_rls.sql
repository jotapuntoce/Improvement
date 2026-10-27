-- Custom SQL migration file, put your code below! ---- RLS de ticket: dueño o tipo de permiso con postventa = empresa.
alter table ticket enable row level security;
create policy "members read tickets their permission type allows"
  on ticket for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = ticket.org_id
      and m.user_id = auth.uid()
      and (m.role = 'owner' or pt.grants->>'postventa' = 'empresa')
  ));
grant select on ticket to authenticated;
