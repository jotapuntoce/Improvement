-- RLS de org_kpi (0012) — .claude/rules/base-de-datos.md: ninguna tabla org-scoped se crea sin su
-- política en el mismo cambio.
--
-- Membership simple y no `role = 'owner'` como payment: esto es la DEFINICIÓN de qué mide la empresa
-- (cuántos objetivos abiertos, cuántas áreas), no un dato reservado al dueño. Los números que
-- alimenta ya los ve cualquier miembro en su propio panel; esconder la etiqueta no escondería nada.
--
-- Solo SELECT: el dueño edita sus indicadores desde /empresas/configuracion, que escribe por el pool
-- de la aplicación después de requireOrgMembership() — ningún cliente con rol `authenticated`
-- escribe aquí directo.

alter table org_kpi enable row level security;
create policy "org members read their org's kpis"
  on org_kpi for select
  using (exists (
    select 1 from membership m
    where m.org_id = org_kpi.org_id and m.user_id = auth.uid()
  ));

grant select on org_kpi to authenticated;

-- Las empresas que ya existían quedaban sin ningún indicador y su tarjeta saldría vacía. Se siembran
-- los seis que traía el catálogo fijo anterior (DEFAULT_KPIS), traducidos a (source, config): es el
-- mismo panel que veían ayer, ahora expresado en filas que el dueño puede cambiar.
insert into org_kpi (org_id, label, hint, source, config, position)
select o.id, d.label, d.hint, d.source, d.config::jsonb, d.position
from organization o
cross join (values
  ('Objetivos activos',    'Lo que tu equipo tiene en marcha ahora', 'objetivos', '{"estado":"abiertos"}',    0),
  ('Objetivos logrados',   'Todo lo que ya cerraron',                'objetivos', '{"estado":"completados"}', 1),
  ('Objetivos vencidos',   'Pasaron su fecha y siguen abiertos',     'objetivos', '{"estado":"vencidos"}',    2),
  ('Puntos del equipo',    'Los puntos que acumula tu gente',        'puntos',    '{}',                       3),
  ('Personas en el equipo','Cuántos trabajan contigo aquí',          'equipo',    '{}',                       4),
  ('Clientes',             'El tamaño de tu cartera',                'clientes',  '{}',                       5)
) as d(label, hint, source, config, position);
