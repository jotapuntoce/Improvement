-- Custom SQL migration file, put your code below! --
-- ERP v1 (órdenes de venta y de compra): dueño o sección `erp` = empresa.
alter table sale_order enable row level security;
create policy "members read sale orders their permission type allows"
  on sale_order for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = sale_order.org_id and m.user_id = auth.uid()
      and (m.role = 'owner' or pt.grants->>'erp' = 'empresa')));

alter table sale_order_line enable row level security;
create policy "members read sale order lines their permission type allows"
  on sale_order_line for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = sale_order_line.org_id and m.user_id = auth.uid()
      and (m.role = 'owner' or pt.grants->>'erp' = 'empresa')));

alter table purchase_order enable row level security;
create policy "members read purchase orders their permission type allows"
  on purchase_order for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = purchase_order.org_id and m.user_id = auth.uid()
      and (m.role = 'owner' or pt.grants->>'erp' = 'empresa')));

alter table purchase_order_line enable row level security;
create policy "members read purchase order lines their permission type allows"
  on purchase_order_line for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = purchase_order_line.org_id and m.user_id = auth.uid()
      and (m.role = 'owner' or pt.grants->>'erp' = 'empresa')));

grant select on sale_order, sale_order_line, purchase_order, purchase_order_line to authenticated;
