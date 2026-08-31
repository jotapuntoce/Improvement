# Improvement (jotapuntoce monorepo) — agent instructions

Constructor de empresas digitales de JotaPuntoCe. Monorepo Turborepo: `apps/admin` (panel interno,
JS), `apps/improvement` (producto del cliente, TS), `packages/db` (Drizzle/Postgres), `packages/ui`
(tokens de diseño compartidos).

## Commands

| Task | Command |
|---|---|
| Install | `pnpm install` |
| Dev — admin / improvement | `pnpm dev:admin` (puerto 3100) / `pnpm dev:improvement` (puerto 3200) |
| Build | `pnpm build` |
| Lint | `pnpm lint` |
| Typecheck | `pnpm typecheck` |
| Test | `pnpm test` · E2E: `pnpm --filter improvement test:e2e` |
| DB | `pnpm db:generate` · `pnpm db:migrate` · `pnpm db:seed` |

## Non-negotiable

1. Ninguna tabla org-scoped nueva se crea sin su política RLS en la misma migración.
2. El motor genérico (`packages/db`, `apps/*/server/**`) nunca referencia un org, empresa o empleado
   por id o nombre literal — solo por parámetro.
3. `SUPABASE_SERVICE_ROLE_KEY` solo se importa en código server-only de `apps/admin`.
4. Un empleado nunca puede leer el `responsibility_level` de otro empleado.
5. Nunca commitear secretos ni salida de build generada.
6. Nunca editar a mano un archivo bajo `packages/db/migrations/`.
7. Nunca marcar una tarea hecha con un comando de gate en rojo.

Arquitectura completa, boundaries y sistema de diseño: ver `CLAUDE.md` en este mismo directorio.
