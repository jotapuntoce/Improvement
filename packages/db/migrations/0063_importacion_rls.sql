-- import_job y record_origin: solo el dueño de la empresa los lee (importar es configuración del
-- negocio). Se escriben solo desde el servidor.
alter table import_job enable row level security;
create policy "owners read their imports" on import_job for select
  using (exists (select 1 from membership m where m.org_id = import_job.org_id and m.user_id = auth.uid() and m.role = 'owner'));
alter table record_origin enable row level security;
create policy "owners read their record origins" on record_origin for select
  using (exists (select 1 from membership m where m.org_id = record_origin.org_id and m.user_id = auth.uid() and m.role = 'owner'));
grant select on import_job, record_origin to authenticated;
