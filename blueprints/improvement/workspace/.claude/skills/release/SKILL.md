---
name: release
description: Corre el gate de aceptación completo, aplica migraciones pendientes y verifica el health check de producción. Úsala cuando el usuario pida "desplegar", "hacer release" o "publicar a producción".
---

# release

## When to use

Antes de cualquier despliegue a producción, después de que todos los pasos de la §9 del blueprint
estén en verde localmente.

## Steps

1. Corre el gate completo de la §20.1 del blueprint: `pnpm install --frozen-lockfile && pnpm lint &&
   pnpm typecheck && pnpm test && pnpm --filter improvement test:e2e && pnpm build`.
2. Confirma que cada variable de `.env.example` está configurada en el proyecto Vercel de producción
   (ambas apps) — nunca despliegues con una variable requerida ausente.
3. Empuja a `main` — el pipeline de CI corre el mismo gate y Vercel despliega automáticamente ambos
   proyectos.
4. Aplica las migraciones pendientes contra producción: `DATABASE_URL_DIRECT=<url de producción> pnpm
   db:migrate` — como paso explícito de release, nunca en el arranque de la app.
5. Verifica el health check.

## Verify

```bash
curl -sf "$PRODUCTION_URL/api/health"   # expect: exit 0, body { "ok": true, "db": "up", ... }
```

## Do not

- No apliques migraciones contra `DATABASE_URL` (pooled) — solo `DATABASE_URL_DIRECT`.
- No despliegues si algún comando del gate salió distinto de 0.
