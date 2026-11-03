-- org_profile: lo leen los miembros de su empresa. app_record: el dueño, o quien tenga la sección
-- 'aplicaciones' en su tipo de permiso (misma regla que record_activity en 0059). Se escriben solo
-- desde el servidor.
alter table org_profile enable row level security;
create policy "members read their org profile" on org_profile for select
  using (exists (select 1 from membership m where m.org_id = org_profile.org_id and m.user_id = auth.uid()));
alter table app_record enable row level security;
create policy "members read custom records their permission type allows" on app_record for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = app_record.org_id and m.user_id = auth.uid()
      and (m.role = 'owner' or coalesce(pt.grants->>'aplicaciones', 'ninguno') <> 'ninguno')));
grant select on org_profile, app_record to authenticated;

-- Bucket `brand`: logo de cada negocio, lectura pública; escribe solo el dueño, dentro de la carpeta
-- de su org (`<orgId>/logo.png`). Mismo patrón que avatars (0011); la app sube con el token del
-- usuario, nunca con la service-role key.
insert into storage.buckets (id, name, public) values ('brand', 'brand', true) on conflict (id) do nothing;
drop policy if exists "brand is publicly readable" on storage.objects;
create policy "brand is publicly readable" on storage.objects for select using (bucket_id = 'brand');
drop policy if exists "owners write their brand" on storage.objects;
create policy "owners write their brand" on storage.objects for insert to authenticated
  with check (bucket_id = 'brand' and exists (select 1 from membership m
    where m.org_id::text = (storage.foldername(name))[1] and m.user_id = auth.uid() and m.role = 'owner'));
drop policy if exists "owners replace their brand" on storage.objects;
create policy "owners replace their brand" on storage.objects for update to authenticated
  using (bucket_id = 'brand' and exists (select 1 from membership m
    where m.org_id::text = (storage.foldername(name))[1] and m.user_id = auth.uid() and m.role = 'owner'));
