-- Bucket `avatars` para la foto de perfil del dueño (profile.avatar_path, 0009).
--
-- Público de lectura: la foto se dibuja en el panel con un <img src> normal, sin firmar una URL en
-- cada render. Lo que NO es público es la escritura — cada quien solo puede escribir dentro de la
-- carpeta que lleva su propio auth.uid(), que es el primer segmento de la ruta
-- (`<userId>/avatar.jpg`, ver apps/improvement/server/storage/avatar.ts).
--
-- Por qué la política importa aquí más que en otras tablas: apps/improvement sube la foto con el
-- token del usuario, no con la service-role key (regla no negociable #3 de CLAUDE.md). Esta
-- política es la que hace que eso sea seguro — sin ella, cualquier cliente autenticado podría
-- sobrescribir la foto de otro.
--
-- on conflict do nothing: la migración se aplica sobre proyectos donde el bucket ya podría existir.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars are publicly readable" on storage.objects;
create policy "avatars are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "users write their own avatar" on storage.objects;
create policy "users write their own avatar"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users replace their own avatar" on storage.objects;
create policy "users replace their own avatar"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users delete their own avatar" on storage.objects;
create policy "users delete their own avatar"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
