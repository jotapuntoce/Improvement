-- Custom SQL migration file, put your code below! --
-- Mismo cuidado que responsibility_level (Non-negotiable #4): la persona evaluada y el dueño, nadie más.
alter table people_review enable row level security;
create policy "the employee and the org owner read people reviews"
  on people_review for select
  using (people_review.employee_id = auth.uid() or exists (
    select 1 from membership m where m.org_id = people_review.org_id and m.user_id = auth.uid() and m.role = 'owner'));
grant select on people_review to authenticated;
