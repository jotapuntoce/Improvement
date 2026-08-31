-- RLS — blueprint §4/§8, .claude/rules/base-de-datos.md ("ninguna tabla org-scoped sin política en
-- la misma migración"). Patrón: un miembro del org puede leer/escribir filas de su propio org, vía
-- EXISTS contra membership. employee_points_ledger es más estricta: employee_id = auth.uid(), un
-- empleado nunca lee la fila de otro (Non-negotiable #4 de CLAUDE.md). prospect_company NO tiene
-- política para `authenticated` — solo el service role (que bypasea RLS) la toca, desde apps/admin.

alter table organization enable row level security;
create policy "org members read their org"
  on organization for select
  using (exists (select 1 from membership m where m.org_id = organization.id and m.user_id = auth.uid()));

alter table profile enable row level security;
create policy "users read their own profile"
  on profile for select
  using (id = auth.uid());
create policy "org members read profiles of their org-mates"
  on profile for select
  using (exists (
    select 1 from membership m1
    join membership m2 on m1.org_id = m2.org_id
    where m1.user_id = auth.uid() and m2.user_id = profile.id
  ));

alter table membership enable row level security;
create policy "users read their own memberships"
  on membership for select
  using (user_id = auth.uid());

alter table invitation enable row level security;
create policy "org members read their org's invitations"
  on invitation for select
  using (exists (select 1 from membership m where m.org_id = invitation.org_id and m.user_id = auth.uid()));

alter table area enable row level security;
create policy "org members read their org's areas"
  on area for select
  using (exists (select 1 from membership m where m.org_id = area.org_id and m.user_id = auth.uid()));

alter table objective enable row level security;
create policy "org members read their org's objectives"
  on objective for select
  using (exists (select 1 from membership m where m.org_id = objective.org_id and m.user_id = auth.uid()));

-- La política más estricta del esquema: un empleado SOLO ve su propia fila de puntos, nunca la de
-- un compañero del mismo org (verificado por tests/auth/guard.test.ts).
alter table employee_points_ledger enable row level security;
create policy "employees read only their own points"
  on employee_points_ledger for select
  using (employee_id = auth.uid());

alter table powerup_partner enable row level security;
create policy "any authenticated user reads the global powerup catalog"
  on powerup_partner for select
  to authenticated
  using (true);

alter table powerup_redemption enable row level security;
create policy "org members read their org's redemptions"
  on powerup_redemption for select
  using (exists (select 1 from membership m where m.org_id = powerup_redemption.org_id and m.user_id = auth.uid()));

alter table client enable row level security;
create policy "org members read their org's clients"
  on client for select
  using (exists (select 1 from membership m where m.org_id = client.org_id and m.user_id = auth.uid()));

alter table ai_suggestion enable row level security;
create policy "org members read their org's ai suggestions"
  on ai_suggestion for select
  using (exists (select 1 from membership m where m.org_id = ai_suggestion.org_id and m.user_id = auth.uid()));

alter table llm_calls enable row level security;
create policy "org members read their org's llm call log"
  on llm_calls for select
  using (exists (select 1 from membership m where m.org_id = llm_calls.org_id and m.user_id = auth.uid()));

alter table reminder enable row level security;
create policy "org members read their org's reminders"
  on reminder for select
  using (exists (select 1 from membership m where m.org_id = reminder.org_id and m.user_id = auth.uid()));

alter table org_build_stage enable row level security;
create policy "org members read their org's build map"
  on org_build_stage for select
  using (exists (select 1 from membership m where m.org_id = org_build_stage.org_id and m.user_id = auth.uid()));

-- prospect_company: RLS habilitada, deliberadamente SIN política para `authenticated` — nadie con un
-- JWT normal puede leerla. Solo la service-role key (apps/admin, bypasea RLS por diseño de Supabase).
alter table prospect_company enable row level security;
