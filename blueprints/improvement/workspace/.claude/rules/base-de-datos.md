---
description: Convenciones de esquema, migraciones y RLS
paths:
  - "packages/db/**"
---

- El esquema vive solo en `packages/db/src/schema.ts`. Cualquier cambio pasa por `pnpm db:generate` —
  nunca se edita a mano un archivo bajo `packages/db/migrations/`.
- Toda tabla nueva que tenga una columna `org_id` es org-scoped y **necesita** una política RLS en la
  misma migración (usa `drizzle-kit generate --custom` para la migración de política si el cambio de
  esquema y la política no salen del mismo diff automático). Sin la política, la tabla existe pero
  queda abierta — no es un "hazlo después".
- `employee_points_ledger` y cualquier tabla que exponga un dato por-empleado usan
  `employee_id = auth.uid()` en su política, nunca solo `org_id` — un empleado no debe leer la fila de
  otro empleado del mismo org.
- El cliente `postgres` en `packages/db/src/client.ts` siempre usa `{ prepare: false }` — el pooler de
  Supabase en modo transacción no soporta prepared statements.
- `DATABASE_URL` (pooled, puerto 6543) es para queries de la aplicación. `DATABASE_URL_DIRECT`
  (puerto 5432) es exclusivo de migraciones y del seed — nunca lo uses en el cliente que sirve
  requests.
- Cada tabla nueva tiene `id uuid primary key default gen_random_uuid()`, y si es mutable,
  `created_at`/`updated_at` timestamptz. Tablas append-only (`employee_points_ledger`) no llevan
  `updated_at` — nunca se actualizan, solo se insertan.
- Money/puntos: enteros, nunca `float`/`numeric` para columnas de puntos (`points`, `points_cost`,
  `points_spent`).

## Do not

- No escribas SQL concatenado a mano en ninguna query — Drizzle parametriza siempre.
- No agregues una segunda forma de migrar el esquema (dashboard de Supabase, SQL manual fuera de
  `packages/db/migrations/`). Una sola fuente de verdad.
