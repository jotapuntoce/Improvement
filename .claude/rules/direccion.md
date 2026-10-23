---
description: Convenciones de los módulos de Dirección (V/TO, Scorecard semanal, Issues, Junta L10)
paths:
  - "apps/improvement/server/direccion/**"
  - "apps/improvement/app/[org]/direccion/**"
---

# Dirección — V/TO, Scorecard semanal, Issues, Junta L10

- Cada página de `app/[org]/direccion/**` empieza con `requireSection(orgId, "<slug>")` (404 nunca 403).
  El hub `app/[org]/direccion/page.tsx` usa `requireOrgMembership(orgId)` + `loadDireccionNav()` y da
  404 si la persona no tiene ninguna de las cuatro secciones.
- Cada función exportada de `server/direccion/**` recibe `(userId, orgId, ...)` y empieza con
  `resolveSection(userId, orgId, "<slug>")`, o con `findOwnerMembership(userId, orgId)` cuando la
  escritura es solo del dueño: editar la V/TO, crear o archivar medibles, crear issues y pendientes.
  Nunca confíes en que la pantalla escondió el botón.
  Excepciones, porque no leen datos de un org: los módulos puros `scorecard/week.ts` y
  `meetings/agenda.ts` (sin base, sin sesión), y `nav.ts` → `loadDireccionNav(userId, orgId)`, que
  valida el uuid y usa `findMembership` para devolver `[]` sin lanzar (lo usa el layout de todas las
  rutas `[org]`).
- RLS no respalda a este guard: el cliente `db` conecta como dueño de las tablas y ninguna política
  corre en este camino. La política de la migración `*_direccion_rls.sql` cierra la otra puerta
  (PostgREST con la anon key). Una consulta nueva sin `resolveSection` fuga de verdad.
- La semana sale SOLO de `server/direccion/scorecard/week.ts` (`weekStart`, `recentWeeks`,
  `SCORECARD_WEEKS = 13`). Nadie calcula un lunes a mano ni usa `getDay()` sobre la hora del servidor.
- Los bloques de la junta salen SOLO de `MEETING_BLOCKS` (`packages/db/src/schema.ts`) y sus minutos de
  `AGENDA` (`server/direccion/meetings/agenda.ts`). Ninguna pantalla repite la lista.
- Un pendiente (to-do) es un `objective`: se crea llamando `createObjective()` de
  `server/objectives/mutations.ts`. Nunca un `db.insert(objective)` propio, nunca puntos calculados aquí.
- Issues son filas de `org_need`. Las transiciones válidas viven en `ISSUE_TRANSITIONS`
  (`server/direccion/issues/issues.ts`); `derivada` no se mueve desde Dirección.
- On-track se muestra con texto (`En meta` / `Fuera de meta`) además del color
  (`var(--success)` / `var(--danger)`) — nunca solo color.
- Resultados tipados `{ ok: true, data } | { ok: false, error: { code, message } }`; zod en el borde de
  cada función que recibe `input: unknown`.

## Do not

- No toques `org_kpi` ni `server/kpis/**`: "Indicadores" y "Scorecard semanal" son cosas distintas.
- No agregues un literal de `org_id`, slug o nombre de empresa (Camibel, Jaime) en este árbol.
- No agregues sincronización en tiempo real a la junta: un solo dispositivo maneja la pantalla.
