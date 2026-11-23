-- Custom SQL migration file, put your code below! --
-- Oficina 2D. El plano confirmado y sus zonas los lee cualquier miembro del org; el borrador (fotos y
-- propuesta de la IA) solo el dueño. Solo lectura para `authenticated`: toda escritura pasa por
-- apps/improvement/server/office/** con el cliente `db` (rol dueño de las tablas, RLS no aplica).
alter table office_plan enable row level security;
create policy "members read the confirmed office plan, owners read drafts too"
  on office_plan for select
  using (exists (
    select 1 from membership m
    where m.org_id = office_plan.org_id and m.user_id = auth.uid()
      and (m.role = 'owner' or office_plan.status = 'confirmed')));

alter table office_zone enable row level security;
create policy "members read zones of their org's confirmed office plan"
  on office_zone for select
  using (exists (
    select 1 from office_plan p
    join membership m on m.org_id = p.org_id
    where p.id = office_zone.plan_id and m.user_id = auth.uid()
      and (m.role = 'owner' or p.status = 'confirmed')));

grant select on office_plan, office_zone to authenticated;

-- Bucket PRIVADO `espacios`: fotos del local, con datos personales posibles. Ruta `{orgId}/{uuid}.{ext}`;
-- el primer segmento es el org y solo su dueño lee, sube o borra. Sin política de update: las fotos no
-- se reemplazan, se suben de nuevo. on conflict do nothing: el bucket podría existir.
insert into storage.buckets (id, name, public)
values ('espacios', 'espacios', false)
on conflict (id) do nothing;

drop policy if exists "owners read their org's space photos" on storage.objects;
create policy "owners read their org's space photos"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'espacios' and exists (
    select 1 from membership m
    where m.org_id::text = (storage.foldername(name))[1] and m.user_id = auth.uid() and m.role = 'owner'));

drop policy if exists "owners upload their org's space photos" on storage.objects;
create policy "owners upload their org's space photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'espacios' and exists (
    select 1 from membership m
    where m.org_id::text = (storage.foldername(name))[1] and m.user_id = auth.uid() and m.role = 'owner'));

drop policy if exists "owners delete their org's space photos" on storage.objects;
create policy "owners delete their org's space photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'espacios' and exists (
    select 1 from membership m
    where m.org_id::text = (storage.foldername(name))[1] and m.user_id = auth.uid() and m.role = 'owner'));
