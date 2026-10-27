-- Custom SQL migration file, put your code below! --
-- Lealtad: mismo criterio que client (dueño o clientes = empresa). El monedero público no pasa por aquí:
-- lo sirve el servidor con columnas explícitas; PostgREST sin JWT con permiso no ve nada.
alter table loyalty_program enable row level security;
create policy "members read the loyalty program their permission type allows"
  on loyalty_program for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = loyalty_program.org_id and m.user_id = auth.uid()
      and (m.role = 'owner' or pt.grants->>'clientes' = 'empresa')));

alter table loyalty_tier enable row level security;
create policy "members read loyalty tiers their permission type allows"
  on loyalty_tier for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = loyalty_tier.org_id and m.user_id = auth.uid()
      and (m.role = 'owner' or pt.grants->>'clientes' = 'empresa')));

alter table experience_grant enable row level security;
create policy "members read experience grants their permission type allows"
  on experience_grant for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = experience_grant.org_id and m.user_id = auth.uid()
      and (m.role = 'owner' or pt.grants->>'clientes' = 'empresa')));

grant select on loyalty_program, loyalty_tier, experience_grant to authenticated;
