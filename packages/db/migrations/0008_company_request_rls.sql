-- RLS de company_request (0007) — .claude/rules/base-de-datos.md: ninguna tabla con columna org_id
-- (aquí, nullable) se crea sin política en el mismo cambio. Mismo patrón que employee_points_ledger
-- en 0001_rls.sql: un dato por-usuario usa el id del propio usuario, no org_id — un cliente nunca lee
-- la solicitud de otro cliente. Solo SELECT: toda escritura pasa por Server Actions con el cliente
-- `db` (rol postgres, bypasea RLS) tras getSessionUserId()/requirePlatformAdmin(), nunca por un
-- cliente autenticado con rol `authenticated`.

alter table company_request enable row level security;
create policy "users read their own company requests"
  on company_request for select
  using (requester_id = auth.uid());

grant select on company_request to authenticated;
