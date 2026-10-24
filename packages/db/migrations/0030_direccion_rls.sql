-- RLS de Dirección (blueprint direccion-jaime §4). Solo SELECT: toda escritura pasa por Server
-- Actions con el cliente `db`, que conecta como dueño de las tablas — en ese camino RLS NO aplica y
-- la única autorización es resolveSection(). Estas políticas cierran la OTRA puerta: PostgREST con la
-- anon key y el JWT del usuario. Ninguna respalda a la otra.
--
-- Mismo patrón que 0016: el tipo de permiso decide, con left join para que "sin tipo" niegue. El
-- `pt.org_id = m.org_id` impide que un tipo de otra empresa conceda algo aquí.

alter table org_vision enable row level security;
create policy "members read the vision their permission type allows"
  on org_vision for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = org_vision.org_id
      and m.user_id = auth.uid()
      and (m.role = 'owner' or pt.grants->>'vision' = 'empresa')
  ));

alter table org_measurable enable row level security;
create policy "members read the measurables their permission type allows"
  on org_measurable for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = org_measurable.org_id
      and m.user_id = auth.uid()
      and (
        m.role = 'owner'
        or pt.grants->>'scorecard' = 'empresa'
        or (pt.grants->>'scorecard' = 'propio' and org_measurable.owner_profile_id = auth.uid())
      )
  ));

alter table measurable_value enable row level security;
create policy "members read values of the measurables they can read"
  on measurable_value for select
  using (exists (
    select 1 from org_measurable om
    join membership m on m.org_id = om.org_id and m.user_id = auth.uid()
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where om.id = measurable_value.measurable_id
      and (
        m.role = 'owner'
        or pt.grants->>'scorecard' = 'empresa'
        or (pt.grants->>'scorecard' = 'propio' and om.owner_profile_id = auth.uid())
      )
  ));

alter table meeting enable row level security;
create policy "members read the meetings their permission type allows"
  on meeting for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id and pt.org_id = m.org_id
    where m.org_id = meeting.org_id
      and m.user_id = auth.uid()
      and (m.role = 'owner' or pt.grants->>'junta' = 'empresa')
  ));

-- La subconsulta sobre meeting corre con el RLS de meeting: solo ve calificaciones de juntas que ya
-- puede leer (mismo comportamiento que 0028 documentó para organization).
alter table meeting_rating enable row level security;
create policy "members read ratings of the meetings they can read"
  on meeting_rating for select
  using (exists (select 1 from meeting mt where mt.id = meeting_rating.meeting_id));

grant select on org_vision, org_measurable, measurable_value, meeting, meeting_rating to authenticated;
