-- RLS de `project`, la tabla org-scoped que nace en 0019.
-- .claude/rules/base-de-datos.md — ninguna tabla con org_id se crea sin su política en el mismo
-- cambio. Solo SELECT: toda escritura pasa por Server Actions con el cliente `db` (rol dueño de las
-- tablas, que bypasea RLS por diseño), nunca por un cliente `authenticated`.

-- Los proyectos los ve CUALQUIERA que trabaje en la empresa, no solo el dueño — a diferencia de
-- org_need, que es el diagnóstico y ahí sí solo el dueño. Un proyecto es trabajo compartido: el
-- equipo necesita saber en qué está metida la empresa, y la pantalla de la recepción se los enseña
-- a todos. Lo que no cruza esta política es la empresa de al lado.
alter table project enable row level security;
create policy "members read their org's projects"
  on project for select
  using (exists (
    select 1 from membership m
    where m.org_id = project.org_id
      and m.user_id = auth.uid()
  ));
grant select on project to authenticated;
