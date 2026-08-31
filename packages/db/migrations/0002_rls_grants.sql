-- Complemento de 0001_rls.sql: una política RLS solo FILTRA filas — Postgres exige además el GRANT
-- de tabla para que el rol pueda intentar la query. Al desactivar "Automatically expose new tables"
-- al crear el proyecto (a propósito, para no exponer nada por default), ningún rol quedó con
-- privilegios base — descubierto corriendo tests/auth/guard.test.ts contra la base real en este
-- mismo paso ("permission denied for table employee_points_ledger").
--
-- Solo SELECT: toda escritura de la app pasa por Server Actions con el cliente `db` (rol postgres,
-- bypasea RLS por diseño — ver server/auth/guard.ts y CLAUDE.md), nunca por un cliente autenticado
-- con rol `authenticated`. RLS aquí es la segunda capa de lectura, no el camino de escritura.
grant select on organization to authenticated;
grant select on profile to authenticated;
grant select on membership to authenticated;
grant select on invitation to authenticated;
grant select on area to authenticated;
grant select on objective to authenticated;
grant select on employee_points_ledger to authenticated;
grant select on powerup_partner to authenticated;
grant select on powerup_redemption to authenticated;
grant select on client to authenticated;
grant select on ai_suggestion to authenticated;
grant select on llm_calls to authenticated;
grant select on reminder to authenticated;
grant select on org_build_stage to authenticated;
-- prospect_company NO recibe grant — ni RLS ni permiso, invisible para `authenticated` (blueprint §4).
