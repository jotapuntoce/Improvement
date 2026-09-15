-- RLS de permission_type (tabla org-scoped nueva) y reemplazo de las políticas de objective y
-- client, que ahora dependen del tipo de permiso del miembro.
--
-- DROP y no una segunda política: dos policies de SELECT sobre la misma tabla se SUMAN con OR, así
-- que dejar la de 0001 (membresía simple) volvería a abrir todo y la nueva no filtraría nada.

alter table permission_type enable row level security;
create policy "org members read their org's permission types"
  on permission_type for select
  using (exists (
    select 1 from membership m
    where m.org_id = permission_type.org_id and m.user_id = auth.uid()
  ));
grant select on permission_type to authenticated;

-- left join y no join: sin tipo asignado, pt es null, ninguna rama se cumple y la política niega —
-- que es exactamente la regla de negar por defecto, escrita en SQL.
drop policy "org members read their org's objectives" on objective;
create policy "members read objectives their permission type allows"
  on objective for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id
    where m.org_id = objective.org_id
      and m.user_id = auth.uid()
      and (
        m.role = 'owner'
        or pt.grants->>'objetivos' = 'empresa'
        or (pt.grants->>'objetivos' = 'area'   and objective.area_id = m.area_id)
        or (pt.grants->>'objetivos' = 'propio' and objective.assigned_employee_id = auth.uid())
      )
  ));

drop policy "org members read their org's clients" on client;
create policy "members read clients their permission type allows"
  on client for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id
    where m.org_id = client.org_id
      and m.user_id = auth.uid()
      and (m.role = 'owner' or pt.grants->>'clientes' = 'empresa')
  ));
