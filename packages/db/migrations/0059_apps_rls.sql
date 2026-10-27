-- Motor de apps: lo lee cualquier miembro del org (la barra y las vistas lo necesitan); se escribe
-- solo desde el servidor. record_activity se lee con la misma regla que su sección.
alter table org_brand enable row level security;
create policy "members read their org brand" on org_brand for select
  using (exists (select 1 from membership m where m.org_id = org_brand.org_id and m.user_id = auth.uid()));
alter table app_group enable row level security;
create policy "members read their app groups" on app_group for select
  using (exists (select 1 from membership m where m.org_id = app_group.org_id and m.user_id = auth.uid()));
alter table app_model enable row level security;
create policy "members read their apps" on app_model for select
  using (exists (select 1 from membership m where m.org_id = app_model.org_id and m.user_id = auth.uid()));
alter table app_stage enable row level security;
create policy "members read their app stages" on app_stage for select
  using (exists (select 1 from membership m where m.org_id = app_stage.org_id and m.user_id = auth.uid()));
alter table app_field enable row level security;
create policy "members read their app fields" on app_field for select
  using (exists (select 1 from membership m where m.org_id = app_field.org_id and m.user_id = auth.uid()));
alter table app_view enable row level security;
create policy "members read their app views" on app_view for select
  using (exists (select 1 from membership m where m.org_id = app_view.org_id and m.user_id = auth.uid()));
alter table record_activity enable row level security;
create policy "members read activity their permission type allows" on record_activity for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = record_activity.org_id and m.user_id = auth.uid()
      and (m.role = 'owner' or coalesce(pt.grants->>record_activity.section, 'ninguno') <> 'ninguno')));
grant select on org_brand, app_group, app_model, app_stage, app_field, app_view, record_activity to authenticated;
