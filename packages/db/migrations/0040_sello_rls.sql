-- Custom SQL migration file, put your code below! --
-- RLS del Sello y de la sinapsis. Los socios ven todo su muelle; un barco ve lo suyo (solo su dueño, un
-- empleado no ve dinero ni evaluaciones); una afiliada ve lo suyo.
alter table muelle_settings enable row level security;
create policy "dock owners read their settings"
  on muelle_settings for select using (public.is_dock_owner(muelle_settings.muelle_org_id));

alter table seal_requirement enable row level security;
create policy "network reads the seal requirements"
  on seal_requirement for select using (public.in_muelle_network(seal_requirement.muelle_org_id));

alter table seal_requirement_result enable row level security;
create policy "dock owners and the subject read seal results"
  on seal_requirement_result for select
  using (
    public.is_dock_owner(seal_requirement_result.muelle_org_id)
    or (seal_requirement_result.barco_org_id is not null and exists (
      select 1 from membership m where m.org_id = seal_requirement_result.barco_org_id
        and m.user_id = auth.uid() and m.role = 'owner'))
    or (seal_requirement_result.affiliate_id is not null and exists (
      select 1 from affiliate a where a.id = seal_requirement_result.affiliate_id and a.profile_id = auth.uid()))
  );

alter table seal_evaluation enable row level security;
create policy "dock owners and the subject read seal evaluations"
  on seal_evaluation for select
  using (
    public.is_dock_owner(seal_evaluation.muelle_org_id)
    or (seal_evaluation.barco_org_id is not null and exists (
      select 1 from membership m where m.org_id = seal_evaluation.barco_org_id
        and m.user_id = auth.uid() and m.role = 'owner'))
    or (seal_evaluation.affiliate_id is not null and exists (
      select 1 from affiliate a where a.id = seal_evaluation.affiliate_id and a.profile_id = auth.uid()))
  );

alter table barco_listing enable row level security;
create policy "boat owner and its dock owners read the listing"
  on barco_listing for select
  using (exists (
    select 1 from membership m where m.user_id = auth.uid() and m.role = 'owner'
      and m.org_id in (barco_listing.barco_org_id, public.org_parent_id(barco_listing.barco_org_id))));

alter table specialist_proposal enable row level security;
create policy "dock owners and the boat owner read proposals"
  on specialist_proposal for select
  using (
    public.is_dock_owner(specialist_proposal.muelle_org_id)
    or exists (select 1 from membership m where m.org_id = specialist_proposal.org_id
      and m.user_id = auth.uid() and m.role = 'owner')
  );

grant select on muelle_settings, seal_requirement, seal_requirement_result, seal_evaluation, barco_listing, specialist_proposal to authenticated;
