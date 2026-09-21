-- RLS de payment (0009) — .claude/rules/base-de-datos.md: ninguna tabla org-scoped se crea sin su
-- política en el mismo cambio.
--
-- A diferencia del resto de tablas org-scoped, aquí NO basta con ser miembro de la organización: lo
-- que el dueño le debe a Improvement no es asunto de sus empleados. La política exige role = 'owner',
-- no solo la existencia del membership — mismo criterio que la regla 4 de CLAUDE.md sobre
-- responsibility_level: un dato que un empleado no puede leer se corta en RLS, no solo en el guard
-- de la aplicación.
--
-- Solo SELECT: toda escritura pasa por apps/admin con la service-role key tras
-- requirePlatformAdmin(), nunca por un cliente con rol `authenticated`.

alter table payment enable row level security;
create policy "org owners read their org's payments"
  on payment for select
  using (exists (
    select 1 from membership m
    where m.org_id = payment.org_id
      and m.user_id = auth.uid()
      and m.role = 'owner'
  ));

grant select on payment to authenticated;
