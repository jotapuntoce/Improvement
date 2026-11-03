-- Tablero: cada quien lee sus tarjetas; el dueño, además, las de toda su empresa. Se escribe solo
-- desde el servidor.
alter table dashboard_card enable row level security;
create policy "own or owner reads dashboard cards" on dashboard_card for select using (
  user_id = auth.uid()
  or exists (select 1 from membership m where m.org_id = dashboard_card.org_id and m.user_id = auth.uid() and m.role = 'owner'));
grant select on dashboard_card to authenticated;
