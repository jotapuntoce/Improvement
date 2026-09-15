-- RLS de las tablas de ensambles (0005) — .claude/rules/base-de-datos.md: ninguna tabla org-scoped
-- se crea sin política en el mismo cambio. Mismo patrón que 0001_rls.sql y su complemento de grants
-- 0002_rls_grants.sql (una política filtra filas, pero Postgres además exige el GRANT de tabla).
--
-- Solo `assembly` lleva org_id. Las otras tres cuelgan de ella, así que su política llega al org por
-- join contra assembly en vez de denormalizar org_id en cada tabla: un org_id copiado en cuatro
-- lugares es un org_id que se puede desincronizar, y la pieza siempre se lee por su ensamble.
--
-- Solo SELECT, igual que 0002: toda escritura pasa por Server Actions con el cliente `db` (rol
-- postgres, bypasea RLS por diseño) tras requireOrgMembership(). RLS es la segunda capa de lectura,
-- nunca el camino de escritura.

alter table assembly enable row level security;
create policy "org members read their org's assemblies"
  on assembly for select
  using (exists (select 1 from membership m where m.org_id = assembly.org_id and m.user_id = auth.uid()));

alter table assembly_piece enable row level security;
create policy "org members read pieces of their org's assemblies"
  on assembly_piece for select
  using (exists (
    select 1 from assembly a
    join membership m on m.org_id = a.org_id
    where a.id = assembly_piece.assembly_id and m.user_id = auth.uid()
  ));

alter table assembly_connection enable row level security;
create policy "org members read connections of their org's assemblies"
  on assembly_connection for select
  using (exists (
    select 1 from assembly a
    join membership m on m.org_id = a.org_id
    where a.id = assembly_connection.assembly_id and m.user_id = auth.uid()
  ));

alter table assembly_event enable row level security;
create policy "org members read the history of their org's assemblies"
  on assembly_event for select
  using (exists (
    select 1 from assembly a
    join membership m on m.org_id = a.org_id
    where a.id = assembly_event.assembly_id and m.user_id = auth.uid()
  ));

grant select on assembly to authenticated;
grant select on assembly_piece to authenticated;
grant select on assembly_connection to authenticated;
grant select on assembly_event to authenticated;
