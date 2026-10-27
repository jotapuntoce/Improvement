-- Custom SQL migration file, put your code below! --
-- squad_member no puede consultarse a sí mismo en su política (recursión): se usan funciones security
-- definer. La escuadra ve a sus miembros; nunca ve pacto_entry (esa política no cambia).
create or replace function public.is_squad_member(sq uuid) returns boolean
  language sql stable security definer set search_path = public
  as $$ select exists (select 1 from squad_member s where s.squad_id = sq and s.profile_id = auth.uid()) $$;
create or replace function public.squad_muelle(sq uuid) returns uuid
  language sql stable security definer set search_path = public
  as $$ select muelle_org_id from squad where id = sq $$;
create or replace function public.challenge_muelle(ch uuid) returns uuid
  language sql stable security definer set search_path = public
  as $$ select muelle_org_id from challenge where id = ch $$;
revoke all on function public.is_squad_member(uuid), public.squad_muelle(uuid), public.challenge_muelle(uuid) from public;
grant execute on function public.is_squad_member(uuid), public.squad_muelle(uuid), public.challenge_muelle(uuid) to authenticated;

alter table squad enable row level security;
create policy "squad members and dock owners read squads"
  on squad for select using (public.is_squad_member(squad.id) or public.is_dock_owner(squad.muelle_org_id));

alter table squad_member enable row level security;
create policy "squad members and dock owners read squad members"
  on squad_member for select
  using (public.is_squad_member(squad_member.squad_id) or public.is_dock_owner(public.squad_muelle(squad_member.squad_id)));

alter table challenge enable row level security;
create policy "network reads challenges"
  on challenge for select using (public.in_muelle_network(challenge.muelle_org_id));

alter table challenge_participant enable row level security;
create policy "participants and dock owners read participation"
  on challenge_participant for select
  using (challenge_participant.profile_id = auth.uid()
    or public.is_dock_owner(public.challenge_muelle(challenge_participant.challenge_id)));

grant select on squad, squad_member, challenge, challenge_participant to authenticated;
