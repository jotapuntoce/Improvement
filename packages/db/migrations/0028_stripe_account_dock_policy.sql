-- La política de 0027 hacía join con organization, cuyo propio RLS oculta el barco al dueño del
-- muelle: esa rama nunca coincidía. La función security definer lee parent_org_id sin pasar por RLS.
create or replace function public.org_parent_id(org uuid) returns uuid
  language sql stable security definer set search_path = public
  as $$ select parent_org_id from organization where id = org $$;
revoke all on function public.org_parent_id(uuid) from public;
grant execute on function public.org_parent_id(uuid) to authenticated;

drop policy "dock or boat owners read stripe account" on stripe_account;
create policy "dock or boat owners read stripe account" on stripe_account for select using (exists (
  select 1 from membership m where m.user_id = auth.uid() and m.role = 'owner'
    and m.org_id in (stripe_account.org_id, public.org_parent_id(stripe_account.org_id))));
