---
description: Convenciones de Oficinas digitales (tema por org, oficina 2D, agentes y canal, ERP v1, agenda y butacas)
paths:
  - "apps/improvement/server/office/**"
  - "apps/improvement/server/agents/**"
  - "apps/improvement/server/channels/**"
  - "apps/improvement/server/calendar/**"
  - "apps/improvement/server/seats/**"
  - "apps/improvement/server/stripe/**"
  - "apps/improvement/server/erp/**"
  - "apps/improvement/server/crm/**"
  - "apps/improvement/server/companies/**"
  - "apps/improvement/app/[org]/marca/**"
  - "apps/improvement/app/[org]/oficina/**"
  - "apps/improvement/app/[org]/canal/**"
  - "apps/improvement/app/[org]/erp/**"
  - "apps/improvement/app/[org]/agenda/**"
  - "apps/improvement/app/[org]/butacas/**"
  - "apps/improvement/app/agenda/**"
  - "apps/improvement/app/butacas/**"
  - "apps/improvement/app/api/**"
  - "apps/agentes/**"
  - "packages/ui/src/theme.ts"
  - "packages/ui/src/building/**"
---

# Oficinas digitales — reglas de área

Blueprint: `blueprints/oficinas-digitales/blueprint.md`. Mandan `CLAUDE.md` y las reglas
`motor-generico.md`, `base-de-datos.md`, `ia-gateway.md`, `tokens-de-diseno.md` y `summum-improvement.md`;
esto solo agrega lo propio de este cambio.

El tema por org con comprobación AA (`organization.theme`, `packages/ui/src/theme.ts`) es la excepción
aprobada por Jose Carlos a la línea "tema oscuro fijo" de `tokens-de-diseno.md`; fuera de él, esa regla sigue.

## Dos puertas, también aquí

- Cada función exportada de `server/{office,agents,channels,calendar,seats,erp,crm,companies}/**` que actúa
  en nombre de alguien empieza con `findMembership`, `findOwnerMembership` o
  `resolveSection(userId, orgId, slug)`. Sin membresía o sin permiso: `NOT_FOUND`, nunca 403.
- Las que no corren en nombre de nadie (el runtime de agentes, el barrido de apartados, el webhook de
  butacas, la reserva pública) solo se llaman desde su ruta: `app/api/agentes/[tarea]` después de
  `isAuthorizedBearer`, `app/api/stripe/butacas` después de `constructEvent`, las páginas públicas con
  columnas explícitas.
- Toda tabla nueva lleva su política RLS en el `--custom` de su paso. Realtime (`message`, `seat_booking`)
  autoriza a cada suscriptor con esa misma política; los borrados de `message` son suaves (`deleted_at`)
  porque los eventos DELETE no se filtran por RLS.

## Datos sensibles

- Fotos del espacio: solo en el bucket privado `espacios`, carpeta `<orgId>/`; nunca URL pública. La IA
  describe el espacio, nunca identifica personas ni describe rostros. El borrador no cambia nada hasta que
  el dueño confirma.
- Refresh tokens de Google: cifrados con `encryptToken` (AES-256-GCM, `TOKEN_ENCRYPTION_KEY`); la columna
  cifrada nunca sale en un `select` hacia la página ni hacia PostgREST (grant por columnas).
- Compradores de butacas: nombre y correo nunca salen en la ruta pública de estado.
- `SUPABASE_SERVICE_ROLE_KEY` nunca en `apps/improvement` ni en `apps/agentes`.

## Worker de agentes

- `apps/agentes` corre `node src/main.ts` sin compilar: solo sintaxis borrable, imports relativos con `.ts`,
  `import type` para tipos, cero imports de `packages/*` o de otra app (excepto su prueba de contrato, que
  lee `apps/improvement/server/agents/tareas.ts`).
- No ejecuta nada por sí mismo: marca el ritmo y llama `POST /api/agentes/<tarea>` con
  `Authorization: Bearer $AGENTS_API_SECRET`. Lo que una tarea hace vive en `server/agents/runtime.ts`.
- Una tarea nueva = una entrada en `TAREAS` (`tareas.ts`) + la misma en `TAREAS_WORKER` (`schedule.ts`) +
  su rama en `runTarea`. La prueba de contrato del worker falla si los dos conjuntos difieren.

## Dinero

- Butacas: cargo directo en la cuenta conectada del org (`{ stripeAccount }`), solo con
  `charges_enabled`; sin `application_fee_amount`. El webhook de butacas es su propio endpoint de Connect
  con `STRIPE_SEATS_WEBHOOK_SECRET`; los webhooks y el código de Stripe de Summum no se tocan.
- `holdSeats` es el único que escribe `held`; un apartado es todo o nada. Sin reembolsos automáticos: un
  pago que llega tarde se registra como `seat_paid_after_expiry` para reembolso manual.

## Motor genérico

- Plantillas de áreas, mapas de recinto, agentes y horarios son filas o datos de catálogo, nunca una rama
  por cliente. `grep` de UUID literal en cada `Verify` de servidor.
- `seat` es el Accountability Chart y no cambia de significado; los lugares de un recinto son `venue_seat`.
- `org_kpi` no se toca en este cambio.
