-- Custom SQL migration file, put your code below! --
-- Butacas: dueño o sección `butacas` = empresa (taquilla). La página pública no pasa por aquí: lee con
-- el servidor y columnas explícitas.
alter table venue_map enable row level security;
create policy "members read venue maps their permission type allows"
  on venue_map for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = venue_map.org_id and m.user_id = auth.uid()
      and (m.role = 'owner' or pt.grants->>'butacas' = 'empresa')));

alter table venue_seat enable row level security;
create policy "members read venue seats their permission type allows"
  on venue_seat for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = venue_seat.org_id and m.user_id = auth.uid()
      and (m.role = 'owner' or pt.grants->>'butacas' = 'empresa')));

alter table venue_session enable row level security;
create policy "members read venue sessions their permission type allows"
  on venue_session for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = venue_session.org_id and m.user_id = auth.uid()
      and (m.role = 'owner' or pt.grants->>'butacas' = 'empresa')));

alter table seat_booking enable row level security;
create policy "members read seat bookings their permission type allows"
  on seat_booking for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = seat_booking.org_id and m.user_id = auth.uid()
      and (m.role = 'owner' or pt.grants->>'butacas' = 'empresa')));

grant select on venue_map, venue_seat, venue_session, seat_booking to authenticated;

-- La taquilla escucha cambios de seat_booking por Realtime, autorizados por la política de arriba.
alter publication supabase_realtime add table seat_booking;
