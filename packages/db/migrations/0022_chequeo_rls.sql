-- chequeo y chequeo_evento son admin-only (service-role / rol dueño de las tablas). RLS sin políticas = deny-all para
-- anon y authenticated: la anon key del navegador no puede leer ni escribir el inventario por PostgREST.
alter table chequeo enable row level security;
alter table chequeo_evento enable row level security;
