---
name: add-migration
description: Genera una migración de Drizzle para packages/db y recuerda la política RLS que toda tabla org-scoped nueva necesita. Úsala cuando el usuario pida "agregar una migración", "cambiar el esquema" o "agregar una tabla/columna".
---

# add-migration

## When to use

Cualquier cambio a `packages/db/src/schema.ts`: tabla nueva, columna nueva, índice nuevo.

## Steps

1. Edita `packages/db/src/schema.ts` con el cambio deseado, siguiendo las convenciones de
   `.claude/rules/base-de-datos.md` (id/timestamps requeridos, `org_id` con índice si es org-scoped).
2. Corre `pnpm db:generate` — genera el archivo SQL en `packages/db/migrations/`. No lo edites a mano.
3. Si la tabla nueva tiene columna `org_id`: corre `pnpm --filter @jotapuntoce/db exec drizzle-kit
   generate --custom` para crear una segunda migración con la política RLS (patrón en blueprint §4,
   Migrations). Nunca dejes una tabla org-scoped sin política en el mismo cambio.
4. Si `employee_id` es una columna de esa tabla y expone datos por-empleado (como
   `employee_points_ledger`), la política usa `employee_id = auth.uid()`, no solo `org_id`.
5. Aplica con `pnpm db:migrate` (requiere `DATABASE_URL_DIRECT` real en `.env.local`).

## Verify

```bash
pnpm --filter @jotapuntoce/db typecheck   # expect: exit 0
pnpm db:generate                          # expect: exit 0, sin diff pendiente en la segunda corrida
```

## Do not

- No mezcles un cambio de esquema con lógica de negocio en el mismo commit — la migración es su
  propio paso.
- No agregues una tabla org-scoped sin su política RLS en el mismo cambio.
