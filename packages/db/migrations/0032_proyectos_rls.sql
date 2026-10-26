-- Custom SQL migration file, put your code below! --
-- RLS de project_stage (blueprint summum-improvement §4). Mismo criterio que 0020 para project: lo
-- lee cualquier miembro del org; lo que no cruza es la empresa de al lado.
alter table project_stage enable row level security;
create policy "members read their org's project stages"
  on project_stage for select
  using (exists (
    select 1 from membership m
    where m.org_id = project_stage.org_id
      and m.user_id = auth.uid()
  ));
grant select on project_stage to authenticated;

-- Los proyectos que ya existían no conocían la autorización: quedan como el dueño ya los veía
-- (autorizados). Los que se den de alta después nacen 'pendiente' por el default de la columna.
update project
  set authorization_status = 'autorizado', authorized_at = created_at
  where authorization_status = 'pendiente' and authorized_at is null;
