---
description: Convenciones del programa Summum + Improvement (operación, red de afiliadas, Sello, Pacto, comunidad, personas, lealtad)
paths:
  - "apps/improvement/server/erp/**"
  - "apps/improvement/server/crm/**"
  - "apps/improvement/server/seal/**"
  - "apps/improvement/server/sinapsis/**"
  - "apps/improvement/server/people/**"
  - "apps/improvement/server/powerups/**"
  - "apps/improvement/server/ai/**"
  - "apps/improvement/app/w/**"
  - "apps/summum/server/**"
  - "apps/summum/app/red/**"
  - "apps/summum/app/muelle/**"
  - "apps/summum/app/directorio/**"
  - "apps/summum/app/r/**"
---

# Summum + Improvement — reglas de área

Blueprint: `blueprints/summum-improvement/blueprint.md`. Mandan `CLAUDE.md` y las reglas
`motor-generico.md`, `base-de-datos.md` e `ia-gateway.md`; esto solo agrega lo propio de este programa.

## Dos puertas, en las dos apps

- `apps/improvement/server/**`: cada función exportada empieza con `assertMembership`,
  `findOwnerMembership` o `resolveSection(userId, orgId, slug)`. Las de cron (`runSealCycle`,
  `generateProposals`) no corren en nombre de nadie y solo las llama `app/api/cron/sello/route.ts`
  después de comprobar el bearer `CRON_SECRET`.
- `apps/summum/server/**`: cada función exportada empieza con un guard de `server/auth/guard.ts`
  (`assertDockOwner`, `assertBarcoOwner`, `assertPactoAccess`, `assertNetworkMember`) o comprueba que la
  fila es de `userId` (afiliada, Pacto, referidos). 404 nunca 403.
- Toda tabla nueva lleva su política RLS en la migración `--custom` del mismo paso. RLS no respalda al
  guard: el cliente `db` conecta como dueño de las tablas y ninguna política corre en ese camino.

## Datos sensibles

- Pacto (`pacto_*`), check-ins, 1-a-1 y People Analyzer: la política es `profile_id = auth.uid()` (o
  `employee_id`), más el dueño del org donde aplica. Nunca por `org_id` solo.
- Ningún registro del Pacto se guarda sin una fila vigente en `pacto_consent`. Revocar con "borrar"
  borra las entradas y pausas de esa persona.
- Una escuadra ve un estado de apoyo (`bien` / `apoyo`), nunca entradas, notas ni pilares.
- Nunca un ranking ni un orden por puntaje dentro de `apps/improvement`. El ranking existe solo entre
  afiliadas, en `apps/summum`.

## Rutas públicas sin sesión

- `/directorio`, `/directorio/[slug]`, `/r/[code]` (Summum) y `/w/[token]` (Improvement) leen con un
  `select` de columnas explícitas, nunca `select()` completo, y nunca devuelven un id interno, un monto
  ni una nota.
- Un barco o una afiliada aparece en `/directorio` solo con opt-in propio y una evaluación aprobada con
  vigencia `vigente` o `en_riesgo`.

## Motor genérico y datos

- Requisitos del Sello, mínimo, días de gracia, umbral de severidad, pilares del Pacto, especialidades,
  niveles VIP y features de lealtad son filas. Ningún literal de requisito, cliente o afiliada en código.
- `org_kpi` crece solo por su vía: entrada nueva en `KPI_SOURCES` + valor en `org_kpi_source_check`.
- Dinero en centavos enteros (`bigint`/`integer`); tasas en puntos base. Las comisiones de referidos
  se calculan sobre `ledger_entry.summum_fee_cents` y nunca se pagan desde aquí.
- Las aprobaciones de dos socios (`seal_evaluation`, `specialist_proposal`, `referral_attribution`)
  exigen dos perfiles distintos en la base (check) y en el servidor ("Necesita la firma del otro dueño.").

## Do not

- No escribas en `org_need` desde `apps/summum`: la flecha va de Improvement a Summum. La derivación la
  hace `referNeedToSummum()` cuando el dueño aprueba en Improvement.
- No importes `@anthropic-ai/sdk` fuera de `apps/improvement/server/ai/gateway.ts`.
- No agregues dependencias: el programa se construye con lo que ya está en `pnpm-lock.yaml`.
