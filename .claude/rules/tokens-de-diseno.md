---
description: Los tokens de diseño viven en un solo lugar
paths:
  - "apps/*/app/**/*.css"
  - "packages/ui/**"
---

- Todo token de color, radio o sombra vive en `packages/ui/src/tokens.css`. Ningún archivo `.css` de
  `apps/admin` o `apps/improvement` define un valor hex nuevo — solo referencia `var(--token)`.
- Un componente que "necesita un color distinto" primero pregunta si ese color ya existe como token
  (incluidos los `--brand-*` de la marca madre). Si genuinamente no existe, se
  agrega a `packages/ui/src/tokens.css`, nunca inline.
- El tema es oscuro fijo — no agregues lógica de `prefers-color-scheme` ni un segundo set de tokens
  claros sin que el usuario lo pida explícitamente (decisión ya tomada, ver blueprint §7). Única excepción,
  aprobada por Jose Carlos: el tema por org de Oficinas digitales (`organization.theme`), que sobrescribe
  cuatro tokens en `app/[org]/layout.tsx` solo si pasa AA (`packages/ui/src/theme.ts`; ver
  `.claude/rules/oficinas-digitales.md`).
- Toda animación respeta `@media (prefers-reduced-motion: reduce)` — especialmente crítico en la
  escena 3D (`apps/improvement/app/[org]/dashboard/Scene3D.tsx`) y el `app-icon` heredado de
  `apps/admin`.

## Do not

- No dupliques `packages/ui/src/tokens.css` dentro de una app "por si acaso". Se importa con
  `@import "@jotapuntoce/ui/tokens.css";`.
