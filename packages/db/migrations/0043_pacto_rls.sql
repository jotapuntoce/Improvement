-- Custom SQL migration file, put your code below! --
-- El Pacto guarda hábitos de salud (LFPDPPP, datos sensibles): cada fila la lee SOLO su dueño. Ni los
-- socios del muelle, ni la escuadra, ni el dueño de su empresa.
alter table pacto_consent enable row level security;
create policy "people read only their own pacto consent"
  on pacto_consent for select using (pacto_consent.profile_id = auth.uid());

alter table pacto_entry enable row level security;
create policy "people read only their own pacto entries"
  on pacto_entry for select using (pacto_entry.profile_id = auth.uid());

alter table pacto_pause enable row level security;
create policy "people read only their own pacto pauses"
  on pacto_pause for select using (pacto_pause.profile_id = auth.uid());

-- Los nombres de los pilares no son datos de nadie: los ve la red del muelle.
alter table pacto_pillar enable row level security;
create policy "network reads its pacto pillars"
  on pacto_pillar for select using (public.in_muelle_network(pacto_pillar.muelle_org_id));

grant select on pacto_consent, pacto_entry, pacto_pause, pacto_pillar to authenticated;
