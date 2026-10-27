-- Custom SQL migration file, put your code below! --
-- Check-in (base NOM-035) y 1-a-1: la persona y el dueño del org. Nunca un compañero.
alter table checkin enable row level security;
create policy "people and their org owner read checkins"
  on checkin for select
  using (checkin.profile_id = auth.uid() or exists (
    select 1 from membership m where m.org_id = checkin.org_id and m.user_id = auth.uid() and m.role = 'owner'));

alter table one_on_one enable row level security;
create policy "the employee and the org owner read one-on-ones"
  on one_on_one for select
  using (one_on_one.employee_id = auth.uid() or exists (
    select 1 from membership m where m.org_id = one_on_one.org_id and m.user_id = auth.uid() and m.role = 'owner'));

grant select on checkin, one_on_one to authenticated;
