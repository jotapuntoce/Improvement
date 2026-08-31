# Epic 02: Producto core

> Tras esta épica el gemelo digital tiene sus cinco piezas de negocio funcionando: el empleado ve su
> propio nivel de responsabilidad, puede canjear PowerUps, recibe recordatorios, el dueño gestiona un
> CRM ligero de sus clientes y puede pedir sugerencias de IA sobre su empresa.

| | |
|---|---|
| **Epic id** | `02-producto-core` |
| **Tasks** | `E2-T1` … `E2-T5` |
| **Depends on** | `01-fundacion` |
| **Unlocks** | `03-experiencia-y-lanzamiento` (E3-T1 depende de E2-T1; E3-T4 depende de E2-T3) |
| **Parallel with** | ninguna dentro de sí misma de forma total — `E2-T1`, `E2-T2`, `E2-T3` y `E2-T4` no comparten archivos entre sí y pueden avanzar en paralelo una vez `01-fundacion` está `done`; `E2-T5` espera a `E2-T4` |

No necesitas ningún otro archivo para completar esta épica. Todo lo de abajo se repite aquí a
propósito.

---

## Stack

Igual que `01-fundacion`: Next.js 16, TypeScript 6 (`apps/improvement`), Drizzle sobre Postgres,
Supabase Auth, Vitest.

| Task | Command |
|---|---|
| Dev — improvement | `pnpm dev:improvement` |
| Test (un archivo) | `pnpm --filter improvement test tests/{archivo}.test.ts` |
| Typecheck | `pnpm typecheck` |

**Gate:** `pnpm typecheck && pnpm lint && pnpm test` pasa antes de marcar cualquier tarea aquí como
hecha.

Toda tarea de esta épica reutiliza `requireOrgMembership` de `01-fundacion` (`E1-T4`) — no reimplementes
la verificación de sesión ni de membresía en ninguno de estos módulos.

## Directory subtree

```
apps/improvement/
  server/
    employees/responsibility.ts     # NUEVO — E2-T1
    powerups/mutations.ts           # NUEVO — E2-T2
    reminders/deliver.ts            # NUEVO — E2-T3
    clients/mutations.ts            # NUEVO — E2-T4
    ai/gateway.ts                   # NUEVO — E2-T5
    ai/prompts/suggestion.ts        # NUEVO — E2-T5
  app/
    [org]/equipo/page.tsx           # NUEVO — E2-T1
    [org]/powerups/page.tsx         # NUEVO — E2-T2
    [org]/clientes/page.tsx         # NUEVO — E2-T4
    api/cron/reminders/route.ts     # NUEVO — E2-T3
    api/ai/suggestions/route.ts     # NUEVO — E2-T5
  tests/
    responsibility.test.ts          # NUEVO — E2-T1
    powerups.test.ts                # NUEVO — E2-T2
    reminders.test.ts               # NUEVO — E2-T3
    clients.test.ts                 # NUEVO — E2-T4
    ai-gateway.test.ts              # NUEVO — E2-T5
apps/admin/
  app/powerups/page.js              # NUEVO — E2-T2, catálogo global gestionado por Jose Carlos
```

Todo lo fuera de este subárbol está fuera de alcance para esta épica.

## Data model touched here

| Entity | Fields this epic adds or reads | Notes |
|---|---|---|
| `powerup_partner`, `powerup_redemption` | escritura/lectura completas | catálogo global, no org-scoped en `powerup_partner` |
| `reminder` | lectura de `scheduled_at`/`delivered_at`, escritura de `delivered_at` | |
| `client` | CRUD completo | |
| `ai_suggestion`, `llm_calls` | escritura | ver `.claude/rules/ia-gateway.md` |
| `employee_points_ledger`, `objective` | solo lectura (para el cálculo de `responsibility_level` y el balance de puntos) | ya definidas en `01-fundacion` |

## Contracts

**Consumed** — ya existe, no lo reconstruyas:

| From | Interface | Guarantee |
|---|---|---|
| `01-fundacion` | `requireOrgMembership(orgId)` | lanza 404 si no hay membresía; retorna `{ userId, role }` |
| `01-fundacion` | `packages/db` — `schema`, `db` | cliente Drizzle listo, `{ prepare: false }` |

**Produced** — la épica `03-experiencia-y-lanzamiento` depende de estas firmas exactas:

| Export | Signature | Used by |
|---|---|---|
| `apps/improvement/server/employees/responsibility.ts` → `responsibilityLevel` | `(employeeId, orgId, windowDays?) => Promise<number>` | `E3-T1` (escena 3D marca avatares por estado, deriva de la misma lógica de vencidos) |

## Conventions that bite in this area

- Antes de escribir la primera llamada al SDK de Anthropic (`E2-T5`), invoca la skill `claude-api`
  para obtener el model id vigente — nunca lo escribas de memoria. Regla completa:
  `.claude/rules/ia-gateway.md`.
- `powerup_partner` es la única tabla de esta épica que **no** es org-scoped — es un catálogo global.
  No le agregues una columna `org_id` ni una política RLS de membresía; su RLS es "cualquier usuario
  autenticado puede leer, solo el service role escribe".
- `deliverDueReminders()` debe ser segura de invocar más de una vez seguida — Vercel Cron puede
  reintentar o el operador puede disparar el endpoint manualmente.

Reglas completas del proyecto: `CLAUDE.md`. Reglas de área: `.claude/rules/{name}.md`.

---

## Tasks

Listadas en el mismo orden que `tasks.json`.

### `E2-T1` — Nivel de responsabilidad

**Depends on:** `E1-T6` · **Priority:** p0

`apps/improvement/server/employees/responsibility.ts`: `responsibilityLevel(employeeId, orgId,
windowDays = 90)` — `onTime / (onTime + late + overdueNotCompleted)` sobre objetivos asignados en la
ventana, como porcentaje 0-100 redondeado. `apps/improvement/app/[org]/equipo/page.tsx`: el propio
empleado ve su nivel; el owner ve la lista de empleados sin el número expuesto por persona.

**Files**
- `apps/improvement/server/employees/responsibility.ts` — nuevo
- `apps/improvement/app/[org]/equipo/page.tsx` — nuevo
- `apps/improvement/tests/responsibility.test.ts` — nuevo

**Acceptance**

1. **WHEN** un empleado con 3 objetivos completados a tiempo y 1 tarde en la ventana consulta su
   nivel **THE SYSTEM SHALL** devolver 75.
2. **WHEN** el empleado B solicita el `responsibility_level` del empleado A (mismo org)
   **THE SYSTEM SHALL** devolver 404, no el valor.
3. **WHEN** el owner visita `/[org]/equipo` **THE SYSTEM SHALL** renderizar la lista de empleados
   sin un campo de nivel de responsabilidad por fila — verificado buscando que la respuesta no
   contenga la cadena `responsibility` en el HTML servido para esa vista cuando la sesión es de un
   owner.

**Verify**

```bash
pnpm --filter improvement test tests/responsibility.test.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T1: nivel de responsabilidad"
git tag step-07-responsibility
```

### `E2-T2` — Catálogo y canje de PowerUps

**Depends on:** `E1-T6` · **Priority:** p1

`apps/improvement/server/powerups/mutations.ts`: `pointsBalance(employeeId)` = suma del ledger menos
suma de canjes no cancelados; `redeemPowerup(employeeId, partnerId)` — rechaza si
`balance < partner.points_cost`. `apps/improvement/app/[org]/powerups/page.tsx`: catálogo con balance
visible. `apps/admin/app/powerups/page.js`: CRUD del catálogo global.

**Files**
- `apps/improvement/server/powerups/mutations.ts` — nuevo
- `apps/improvement/app/[org]/powerups/page.tsx` — nuevo
- `apps/admin/app/powerups/page.js` — nuevo
- `apps/improvement/tests/powerups.test.ts` — nuevo

**Acceptance**

1. **WHEN** un empleado con balance 300 intenta canjear un PowerUp de costo 500
   **THE SYSTEM SHALL** rechazar la operación y no insertar ninguna fila en `powerup_redemption`.
2. **WHEN** un empleado con balance suficiente canjea un PowerUp **THE SYSTEM SHALL** insertar
   exactamente una fila y reducir su balance calculado en `points_cost`.
3. **WHEN** Jose Carlos desactiva un partner desde `apps/admin` **THE SYSTEM SHALL** dejar de
   mostrarlo en el catálogo de todos los orgs sin borrar los canjes históricos que ya lo referencian.

**Verify**

```bash
pnpm --filter improvement test tests/powerups.test.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T2: catalogo y canje de powerups"
git tag step-08-powerups
```

### `E2-T3` — Recordatorios in-app y email

**Depends on:** `E1-T4` · **Priority:** p1

`apps/improvement/app/api/cron/reminders/route.ts`: `GET`, valida `Authorization: Bearer
$CRON_SECRET`. `apps/improvement/server/reminders/deliver.ts`: `deliverDueReminders()` selecciona
`reminder` con `scheduled_at <= now()` y `delivered_at is null`, envía por Resend si
`channel='email'`, marca `delivered_at=now()` en ambos canales. `apps/improvement/vercel.json`
(**autorado aquí, único dueño** — el paso 16 solo lo despliega): declara el cron cada 15 minutos
contra `/api/cron/reminders`.

**Files**
- `apps/improvement/app/api/cron/reminders/route.ts` — nuevo
- `apps/improvement/server/reminders/deliver.ts` — nuevo
- `apps/improvement/vercel.json` — nuevo
- `apps/improvement/tests/reminders.test.ts` — nuevo

**Acceptance**

1. **WHEN** `GET /api/cron/reminders` llega sin el header `Authorization` correcto
   **THE SYSTEM SHALL** devolver 401 y no marcar ningún `delivered_at`.
2. **WHEN** `deliverDueReminders()` corre sobre un recordatorio vencido **THE SYSTEM SHALL** marcar
   `delivered_at` una vez.
3. **WHEN** `deliverDueReminders()` corre una segunda vez inmediatamente después
   **THE SYSTEM SHALL** no reenviar el email de ese recordatorio (ya tiene `delivered_at` no nulo).
4. **WHEN** `apps/improvement/vercel.json` se inspecciona **THE SYSTEM SHALL** declarar exactamente
   una entrada de cron con `path` `/api/cron/reminders`.

**Verify**

```bash
pnpm --filter improvement test tests/reminders.test.ts
grep -c '"/api/cron/reminders"' apps/improvement/vercel.json
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T3: recordatorios in-app y email"
git tag step-09-reminders
```

### `E2-T4` — CRM ligero de clientes

**Depends on:** `E1-T4` · **Priority:** p1

`apps/improvement/server/clients/mutations.ts`: CRUD estándar org-scoped con `health_status`.
`apps/improvement/app/[org]/clientes/page.tsx`: lista cursor-paginada, filtro por `health_status`.

**Files**
- `apps/improvement/server/clients/mutations.ts` — nuevo
- `apps/improvement/app/[org]/clientes/page.tsx` — nuevo
- `apps/improvement/tests/clients.test.ts` — nuevo

**Acceptance**

1. **WHEN** un miembro del org A solicita la lista de clientes del org B **THE SYSTEM SHALL**
   devolver 404.
2. **WHEN** se crea un cliente sin `health_status` explícito **THE SYSTEM SHALL** almacenarlo como
   `neutral` por default.
3. **WHEN** se filtra por `health_status='at_risk'` **THE SYSTEM SHALL** devolver solo esas filas.

**Verify**

```bash
pnpm --filter improvement test tests/clients.test.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T4: crm ligero de clientes"
git tag step-10-crm
```

### `E2-T5` — Gateway de IA y sugerencias

**Depends on:** `E1-T6`, `E2-T4` · **Priority:** p1

`apps/improvement/server/ai/gateway.ts`: único módulo que importa `@anthropic-ai/sdk` en todo el
repo. Invoca la skill `claude-api` antes de escribir la primera llamada. `generateSuggestion(orgId,
category)`: lee áreas/objetivos/clientes del org vía las queries ya existentes, arma el prompt, llama
al modelo, valida con `zod`, un reintento en fallo de validación, escribe `ai_suggestion` +
`llm_calls`. `apps/improvement/server/ai/prompts/suggestion.ts`: plantilla del prompt como export
nombrado, nunca inline en `gateway.ts`. `apps/improvement/app/api/ai/suggestions/route.ts`: `POST`,
exige rol `owner`, límite de 10 solicitudes/org/hora contando `llm_calls`.

**Files**
- `apps/improvement/server/ai/gateway.ts` — nuevo
- `apps/improvement/server/ai/prompts/suggestion.ts` — nuevo
- `apps/improvement/app/api/ai/suggestions/route.ts` — nuevo
- `apps/improvement/tests/ai-gateway.test.ts` — nuevo

**Acceptance**

1. **WHEN** se simula un rate limit del proveedor **THE SYSTEM SHALL** surfacear un error tipado y
   reintentable, distinto del error para una solicitud `400` (no reintentable).
2. **WHEN** se busca `@anthropic-ai/sdk` con grep en todo `apps/improvement/` fuera de
   `node_modules` **THE SYSTEM SHALL** encontrar exactamente un archivo que lo importe:
   `server/ai/gateway.ts`.
3. **WHEN** una sugerencia se genera exitosamente (proveedor simulado en el test)
   **THE SYSTEM SHALL** insertar una fila en `ai_suggestion` y una en `llm_calls` con
   `input_tokens` y `output_tokens` no nulos.
4. **WHEN** un org ya generó 10 sugerencias en la última hora **THE SYSTEM SHALL** rechazar la 11ª
   sin llamar al proveedor (`llm_calls` no gana una fila nueva).

**Verify**

```bash
pnpm --filter improvement test tests/ai-gateway.test.ts
test "$(grep -rl '@anthropic-ai/sdk' apps/improvement --include='*.ts' | grep -v node_modules | grep -v '\.test\.ts$' | wc -l)" = 1
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T5: gateway de ia y sugerencias"
git tag step-11-ai-gateway
```

---

## Epic acceptance

La épica está hecha cuando cada tarea está `done` en `tasks.json` **y**:

1. **WHEN** un empleado completa un objetivo, canjea un PowerUp y consulta su nivel de
   responsabilidad **THE SYSTEM SHALL** reflejar los tres estados correctamente sin que ninguno
   filtre datos de otro empleado u otro org.
2. **WHEN** un owner genera una sugerencia de IA y agrega un cliente al CRM **THE SYSTEM SHALL**
   registrar ambas acciones con trazabilidad completa (`llm_calls` para la primera, el registro del
   cliente para la segunda).

```bash
pnpm typecheck && pnpm lint && pnpm test
```

## Pitfalls

- **Exponer el `responsibility_level` de un empleado al owner "para que pueda ayudar mejor".** Es
  exactamente el riesgo de vigilancia laboral que el blueprint mitiga explícitamente (§1, §20.2). El
  owner ve conteos agregados, nunca el número por persona.
- **Un segundo import de `@anthropic-ai/sdk`** fuera de `server/ai/gateway.ts` "solo para probar
  algo rápido" — rompe el contrato que `E2-T5` verifica con grep y el que
  `.claude/rules/ia-gateway.md` prohíbe.
- **Enviar el email de un recordatorio sin marcar `delivered_at` primero (o al revés, con una
  condición de carrera).** Marca `delivered_at` dentro de la misma operación que decide enviar, no
  después — si el cron se dispara dos veces casi simultáneamente, ambas invocaciones deben competir
  por la misma fila, no duplicar el envío.

## Before moving on

- [ ] Cada tarea de esta épica está `done` en `tasks.json` — ninguna quedó `in_progress`.
- [ ] Cada comando `verify` de cada tarea pasó, no solo el primero.
- [ ] Ningún `verify` fue editado ni se saltó.
- [ ] **Cada tarea tiene su tag de checkpoint** — `git tag -l 'step-0[7-9]-*' 'step-1[01]-*'` lista 5
      (recordando que `step-10-crm` y `step-11-ai-gateway` también entran).
- [ ] El comando de gate pasa limpio, corrido desde la raíz del proyecto.
- [ ] Cada contrato "Produced" existe con la firma indicada.
- [ ] Ningún archivo fuera del subárbol de esta épica fue modificado.
- [ ] `.env.example` sigue reflejando `ANTHROPIC_API_KEY`, `RESEND_API_KEY` y `CRON_SECRET` — ya
      estaban documentadas desde el bundle.
- [ ] Un commit por tarea, cada uno prefijado con su id de tarea, cada uno seguido de su tag de
      checkpoint.
