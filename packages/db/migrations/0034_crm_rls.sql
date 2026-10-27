-- Custom SQL migration file, put your code below! --
-- RLS del CRM. Mismo criterio que 0016 para client: dueño o tipo de permiso con clientes = empresa.
alter table client_preference enable row level security;
create policy "members read client preferences their permission type allows"
  on client_preference for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = client_preference.org_id
      and m.user_id = auth.uid()
      and (m.role = 'owner' or pt.grants->>'clientes' = 'empresa')
  ));

alter table deal enable row level security;
create policy "members read deals their permission type allows"
  on deal for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = deal.org_id
      and m.user_id = auth.uid()
      and (m.role = 'owner' or pt.grants->>'clientes' = 'empresa')
  ));

grant select on client_preference, deal to authenticated;
