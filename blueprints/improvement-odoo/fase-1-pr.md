# Improvement estilo Odoo — Fase 1 (Base)

Spec: `blueprints/improvement-odoo/spec.md` · Plan: `blueprints/improvement-odoo/fase-1-plan.md`

## Qué cambia

- **Adiós al edificio 3D.** `/` lleva a la primera empresa; `/empresas/[orgId]` redirige a `/[orgId]`.
- **Barra izquierda estilo Whop:** cambio de empresa, Inicio, Dirección, Tu marca y las apps por grupo
  (Ventas: Clientes y Ventas · Operación: Proyectos y Postventa). Marca la sección actual.
- **Inicio del negocio:** portada y logo de su marca, junta pendiente, "Pedir siguiente movimiento" y
  pendientes de esa empresa.
- **Motor de configuración:** `app_group`, `app_model`, `app_stage`, `app_field`, `app_view`,
  `org_brand`, `record_activity` y columna `custom jsonb` en `client`, `deal`, `project`, `ticket`.
  Las apps base se siembran solas por org (`ensureOrgApps`, idempotente y con advisory lock).
- **Vistas genéricas:** lista (con total en MXN), kanban (arrastrar o select de etapa, avisa si no se
  pudo mover), ficha con campos extra y bitácora tipo chatter.
- **Tu marca:** logo, portada y dos colores que pintan todo el Improvement del negocio.
- **Vista previa como:** el dueño ve su Improvement como un tipo de permiso; solo reduce lo visible.
- **Tokens de Improvement:** negro + degradado verde `#1fbe79 → #98e33b`.

## Seguridad (dos puertas)

- Páginas: `requireSection(orgId, section)`; `server/apps/**`: `resolveSection` (leer con alcance ≠
  ninguno, escribir solo con "empresa"). Cada Server Action vuelve a leer la sesión.
- Migración `0059_apps_rls.sql`: SELECT para miembros en las tablas del motor; `record_activity` solo
  si el tipo de permiso concede la sección. Ya aplicadas 0058 y 0059.

## Pruebas

- Unitarias/integración nuevas: `apps-schema`, `apps-catalog`, `apps-fields`, `apps-records`,
  `apps-sidebar`, `brand`.
- E2E: `frente.spec.ts` nuevo; a11y cubre inicio, lista y kanban; `direccion` y `movimiento` al día.
- Revisión en navegador con sesión real: inicio, barra, Clientes (lista/kanban/ficha), Tu marca.

## Pendientes conocidos (no bloquean)

- Un campo `si_no` requerido no puede guardarse desmarcado.
- `app_group` sin unique `(org_id, name)` (lo cubre el advisory lock); faltan índices en
  `app_view.app_id` y `app_model.group_id`.
- `server/building` y `server/lobby` quedan sin uso (con sus pruebas); limpieza aparte.
- Las pruebas de `apps/admin` no corren en el worktree (falta su `.env.test`); admin no se tocó.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
