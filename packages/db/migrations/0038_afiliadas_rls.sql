-- Custom SQL migration file, put your code below! --
-- Funciones de la red (security definer: leen membership/affiliate/organization sin pasar por su RLS,
-- igual que public.org_parent_id de 0028). Las reusan las migraciones siguientes.
create or replace function public.is_dock_owner(muelle uuid) returns boolean
  language sql stable security definer set search_path = public
  as $$ select exists (
    select 1 from membership m where m.org_id = muelle and m.user_id = auth.uid() and m.role = 'owner') $$;

create or replace function public.is_network_member(muelle uuid) returns boolean
  language sql stable security definer set search_path = public
  as $$ select public.is_dock_owner(muelle) or exists (
    select 1 from affiliate a
    where a.muelle_org_id = muelle and a.profile_id = auth.uid() and a.status = 'activa') $$;

create or replace function public.in_muelle_network(muelle uuid) returns boolean
  language sql stable security definer set search_path = public
  as $$ select public.is_network_member(muelle) or exists (
    select 1 from membership m join organization o on o.id = m.org_id
    where m.user_id = auth.uid() and o.parent_org_id = muelle) $$;

revoke all on function public.is_dock_owner(uuid), public.is_network_member(uuid), public.in_muelle_network(uuid) from public;
grant execute on function public.is_dock_owner(uuid), public.is_network_member(uuid), public.in_muelle_network(uuid) to authenticated;

alter table specialty enable row level security;
create policy "network reads its specialties"
  on specialty for select
  using (public.in_muelle_network(specialty.muelle_org_id));

alter table affiliate enable row level security;
create policy "affiliate reads itself, dock owners read their network"
  on affiliate for select
  using (affiliate.profile_id = auth.uid() or public.is_dock_owner(affiliate.muelle_org_id));

-- El cuestionario es de la persona: ni los socios lo leen por PostgREST (el ranking lo calcula el servidor).
alter table personality_profile enable row level security;
create policy "people read only their own personality profile"
  on personality_profile for select
  using (personality_profile.profile_id = auth.uid());

grant select on specialty, affiliate, personality_profile to authenticated;
