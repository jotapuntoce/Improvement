-- Custom SQL migration file, put your code below! --
-- Agenda personal: cada quien lee lo suyo (user_id = auth.uid()), ni el dueño lee la agenda de otro.
-- calendar_connection guarda el refresh token cifrado: el grant es por COLUMNA y no incluye
-- refresh_token_enc ni sync_token, así que ni su propio dueño lo lee por PostgREST.
alter table calendar_event enable row level security;
create policy "users read their own calendar events"
  on calendar_event for select
  using (calendar_event.user_id = auth.uid());

alter table calendar_connection enable row level security;
create policy "users read their own calendar connection"
  on calendar_connection for select
  using (calendar_connection.user_id = auth.uid());

alter table booking_page enable row level security;
create policy "users read their own booking pages"
  on booking_page for select
  using (booking_page.user_id = auth.uid());

alter table booking enable row level security;
create policy "users read bookings of their own booking pages"
  on booking for select
  using (exists (
    select 1 from booking_page bp
    where bp.id = booking.booking_page_id and bp.user_id = auth.uid()));

grant select on calendar_event, booking_page, booking to authenticated;
-- Supabase da privilegios por defecto sobre toda tabla nueva de `public`: sin este revoke, el grant por
-- columna de abajo no oculta nada.
revoke all on calendar_connection from anon, authenticated;
grant select (id, org_id, user_id, provider_email, calendar_id, status, last_synced_at, created_at, updated_at)
  on calendar_connection to authenticated;
