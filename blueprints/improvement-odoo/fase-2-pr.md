## Fase 2 — Registro y arranque

Un dueño nuevo crea su cuenta (correo o Google), cuenta su negocio, sube su logo y acepta las apps
que Improvement le propone para su giro. Llega a su inicio con su ERP/CRM ya armado.

**Plan:** `blueprints/improvement-odoo/fase-2-plan.md` (aprobado con D1–D5).

### Qué entra
- **T1** `org_profile` y `app_record` con RLS en la misma migración (0060/0061, ya aplicadas). La sección `aplicaciones` y el bucket `brand` solo dejan escribir al dueño dentro de `<orgId>/`.
- **T2** Las apps propias (`app_model.kind='custom'`) usan las vistas genéricas mediante `customAdapter`. Agregamos el botón "Nuevo".
- **T3** "Agregar aplicación" en la barra del dueño: nombre, grupo y etapas.
- **T4** Plantillas por giro, en código (D1). `applyTemplate` se salta las apps que ya existen.
- **T5** `/registro` (correo + Google), `/auth/callback` y `/arranque` paso 1 (crea el negocio y la membresía de dueño). Si alguien entra sin empresa, va a `/arranque`.
- **T6** Paso 2, la marca: subimos el logo a Storage y sacamos sus colores con canvas, sin IA (D3). Paso 3, la propuesta: checkboxes y nombres editables (D4). Un dueño que no terminó el arranque vuelve a él.
- **T7** E2E del flujo completo + axe en las pantallas nuevas.

### Verificación
- `pnpm lint && pnpm typecheck` ✔
- `pnpm test`: improvement 415/415 y summum 120/120 ✔. Las pruebas de admin no corren en el worktree porque no hay `.env.test`; ya era así antes.
- `pnpm --filter improvement test:e2e`: 16/16 ✔

### Pendiente fuera del código
- **D5:** activar el proveedor Google en Supabase (Auth → Providers) y agregar `/auth/callback` a las Redirect URLs. Sin eso, "Continuar con Google" falla.

Va encima del PR de la Fase 1 (jotapuntoce/Improvement#6).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
