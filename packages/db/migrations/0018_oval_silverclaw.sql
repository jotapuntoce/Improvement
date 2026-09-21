-- RLS de las dos tablas org-scoped que nacen en 0017: org_need y owner_memory.
-- .claude/rules/base-de-datos.md — ninguna tabla con org_id se crea sin su política en el mismo
-- cambio. Solo SELECT: toda escritura pasa por Server Actions con el cliente `db` (rol postgres,
-- bypasea RLS por diseño), nunca por un cliente `authenticated`.

-- El diagnóstico de la empresa es del DUEÑO, no de todo el que trabaje ahí. Un empleado que leyera
-- "el área de finanzas está en severidad 3" estaría leyendo el juicio de Improvement sobre el
-- trabajo de un compañero — el mismo riesgo que el no negociable #4 cierra en responsibility_level.
-- El "por qué existe este objetivo" que sí le toca ver al empleado viaja en el objetivo, no aquí.
alter table org_need enable row level security;
create policy "owners read their org's needs"
  on org_need for select
  using (exists (
    select 1 from membership m
    where m.org_id = org_need.org_id
      and m.user_id = auth.uid()
      and m.role = 'owner'
  ));
grant select on org_need to authenticated;

-- Lo que Improvement aprendió del dueño lo lee el dueño y nadie más — ni sus empleados ni el dueño
-- de otra empresa. Por owner_id y no por membresía del org: es memoria de una persona, igual que
-- employee_points_ledger en 0001_rls.sql.
alter table owner_memory enable row level security;
create policy "owners read their own memory"
  on owner_memory for select
  using (owner_id = auth.uid());
grant select on owner_memory to authenticated;
