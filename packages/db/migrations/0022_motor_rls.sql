-- RLS de las cinco tablas org-scoped que nacen en 0021: el motor de Improvement (improvement_cycle,
-- improvement_event), su conversación con el dueño (owner_message), lo que le delega al equipo
-- (delegated_task) y las subtareas de proyecto (project_task).
--
-- .claude/rules/base-de-datos.md — ninguna tabla con org_id se crea sin su política en el mismo
-- cambio. Solo SELECT: toda escritura pasa por Server Actions con el cliente `db` (rol dueño de las
-- tablas, que bypasea RLS por diseño), nunca por un cliente `authenticated`.
--
-- Esta política NO respalda al guard de la aplicación ni al revés (CLAUDE.md, "Dos puertas, no dos
-- cerraduras"): cierra la puerta de PostgREST, donde cualquier empleado con sesión puede pegarle
-- directo con el anon key y su propio JWT. El guard cierra la otra. Las dos hacen falta.
--
-- Quién ve qué, y por qué no es lo mismo en las cinco:
--
--   · improvement_cycle / improvement_event / owner_message — SOLO EL DUEÑO. El razonamiento del
--     Director General es la conversación privada de quien dirige: por qué cree que un área va
--     lenta, qué sospecha de quién, qué descartó. Que un empleado lo leyera desde la consola del
--     navegador sería exactamente la fuga que el producto ya prohíbe para responsibility_level (no
--     negociable #4). Y además se filtra por owner_id: un segundo dueño (Jose Carlos entra con
--     membresía de dueño para dar soporte) tampoco lee los ciclos del cliente.
--   · delegated_task — el dueño ve todas las de su empresa; cada persona ve SOLO las suyas. Tiene
--     que verlas: una tarea que no puedes leer no la puedes aceptar. Lo que no ve es la de al lado.
--   · project_task — cualquiera que trabaje en la empresa, igual que `project` en 0020. El trabajo
--     en curso es información compartida.

alter table improvement_cycle enable row level security;
create policy "owners read their own cycles"
  on improvement_cycle for select
  using (
    improvement_cycle.owner_id = auth.uid()
    and exists (
      select 1 from membership m
      where m.org_id = improvement_cycle.org_id
        and m.user_id = auth.uid()
        and m.role = 'owner'
    )
  );
grant select on improvement_cycle to authenticated;
--> statement-breakpoint

alter table improvement_event enable row level security;
create policy "owners read events of their own cycles"
  on improvement_event for select
  using (exists (
    select 1 from improvement_cycle c
    join membership m on m.org_id = c.org_id and m.user_id = auth.uid() and m.role = 'owner'
    where c.id = improvement_event.cycle_id
      and c.org_id = improvement_event.org_id
      and c.owner_id = auth.uid()
  ));
grant select on improvement_event to authenticated;
--> statement-breakpoint

alter table owner_message enable row level security;
create policy "owners read their own conversation"
  on owner_message for select
  using (
    owner_message.owner_id = auth.uid()
    and exists (
      select 1 from membership m
      where m.org_id = owner_message.org_id
        and m.user_id = auth.uid()
        and m.role = 'owner'
    )
  );
grant select on owner_message to authenticated;
--> statement-breakpoint

alter table delegated_task enable row level security;
create policy "assignees read their tasks, owners read all of theirs"
  on delegated_task for select
  using (exists (
    select 1 from membership m
    where m.org_id = delegated_task.org_id
      and m.user_id = auth.uid()
      and (m.role = 'owner' or delegated_task.assigned_to = auth.uid())
  ));
grant select on delegated_task to authenticated;
--> statement-breakpoint

alter table project_task enable row level security;
create policy "members read their org's project tasks"
  on project_task for select
  using (exists (
    select 1 from membership m
    where m.org_id = project_task.org_id
      and m.user_id = auth.uid()
  ));
grant select on project_task to authenticated;
