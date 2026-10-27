-- Custom SQL migration file, put your code below! --
alter table seat enable row level security;
create policy "members read seats their permission type allows"
  on seat for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = seat.org_id
      and m.user_id = auth.uid()
      and (m.role = 'owner' or pt.grants->>'equipo' in ('empresa', 'area'))
  ));
grant select on seat to authenticated;
