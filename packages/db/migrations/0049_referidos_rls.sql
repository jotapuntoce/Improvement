-- Custom SQL migration file, put your code below! --
-- Referidos: el referente ve lo suyo; los socios ven su muelle. Otro referente no ve nada ajeno.
alter table referral_link enable row level security;
create policy "owners of the link and dock owners read referral links"
  on referral_link for select
  using (referral_link.profile_id = auth.uid() or public.is_dock_owner(referral_link.muelle_org_id));

alter table referral_attribution enable row level security;
create policy "dock owners and the referrer read attributions"
  on referral_attribution for select
  using (public.is_dock_owner(referral_attribution.muelle_org_id) or exists (
    select 1 from referral_link l where l.id = referral_attribution.referral_link_id and l.profile_id = auth.uid()));

-- La subconsulta corre con el RLS de referral_attribution: solo comisiones de atribuciones visibles.
alter table referral_commission enable row level security;
create policy "commissions of readable attributions"
  on referral_commission for select
  using (exists (select 1 from referral_attribution a where a.id = referral_commission.attribution_id));

grant select on referral_link, referral_attribution, referral_commission to authenticated;
