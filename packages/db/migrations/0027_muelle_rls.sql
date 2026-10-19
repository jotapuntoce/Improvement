-- RLS del casco del muelle (spec 2026-10-19). Solo SELECT: toda escritura pasa por apps/summum con
-- el cliente `db` (rol dueño, bypasea RLS). Ninguna fila se escribe desde el rol authenticated.

alter table membership_plan enable row level security;
alter table stripe_account enable row level security;
alter table fee_rate enable row level security;
alter table fee_rate_change enable row level security;
alter table ledger_entry enable row level security;

-- Dueños del muelle: todo lo de su muelle.
create policy "dock owners read plans" on membership_plan for select using (exists (
  select 1 from membership m where m.org_id = membership_plan.muelle_org_id and m.user_id = auth.uid() and m.role = 'owner'));
create policy "dock owners read fee rates" on fee_rate for select using (exists (
  select 1 from membership m where m.org_id = fee_rate.muelle_org_id and m.user_id = auth.uid() and m.role = 'owner'));
create policy "dock owners read fee changes" on fee_rate_change for select using (exists (
  select 1 from membership m where m.org_id = fee_rate_change.muelle_org_id and m.user_id = auth.uid() and m.role = 'owner'));

-- Libro: dueño del muelle o dueño de ESE barco. Un empleado no ve dinero.
create policy "dock or boat owners read ledger" on ledger_entry for select using (exists (
  select 1 from membership m where m.user_id = auth.uid() and m.role = 'owner'
    and m.org_id in (ledger_entry.muelle_org_id, ledger_entry.barco_org_id)));

-- Cuenta Stripe: dueño del barco o dueño de su muelle.
create policy "dock or boat owners read stripe account" on stripe_account for select using (exists (
  select 1 from organization o join membership m on m.user_id = auth.uid() and m.role = 'owner'
  where o.id = stripe_account.org_id and m.org_id in (o.id, o.parent_org_id)));

grant select on membership_plan, stripe_account, fee_rate, fee_rate_change, ledger_entry to authenticated;
