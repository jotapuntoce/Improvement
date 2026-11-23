-- Custom SQL migration file, put your code below! --
-- ERP v1 (inventario y proveedores): mismo criterio que lealtad — dueño o sección `erp` = empresa.
alter table product enable row level security;
create policy "members read products their permission type allows"
  on product for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = product.org_id and m.user_id = auth.uid()
      and (m.role = 'owner' or pt.grants->>'erp' = 'empresa')));

alter table stock_move enable row level security;
create policy "members read stock moves their permission type allows"
  on stock_move for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = stock_move.org_id and m.user_id = auth.uid()
      and (m.role = 'owner' or pt.grants->>'erp' = 'empresa')));

alter table supplier enable row level security;
create policy "members read suppliers their permission type allows"
  on supplier for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = supplier.org_id and m.user_id = auth.uid()
      and (m.role = 'owner' or pt.grants->>'erp' = 'empresa')));

grant select on product, stock_move, supplier to authenticated;
