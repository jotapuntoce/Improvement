# Onboarding de cliente: selector de empresas + edificio personalizado

**Fecha:** 2026-09-02
**Estado:** Aprobado por Jose Carlos, listo para implementación.
**Relacionado:** primer cliente real del backlog de prospectos, Jaime Salinas (Camibel + Afianza) —
ver `apps/admin/app/prospects/actions.js` y `apps/admin/app/improvement/page.js`.

## Problema

Hoy, cuando un cliente (ej. Jaime) inicia sesión en `apps/improvement`, `resolveHomeOrgId()` lo
manda directo a `/${orgId}/dashboard` de su primera organización — sin momento de bienvenida, sin
forma de elegir entre varias empresas si tiene más de una, y sin ninguna experiencia visual antes
del dashboard de trabajo. Jose Carlos quiere que, antes de mandar la invitación real de WhatsApp a
Jaime, exista: un momento de bienvenida animado ("efecto Rappi", mostrando el estado real de
construcción de sus empresas), un panel para elegir entre sus empresas (íconos grandes tipo app), y
al entrar a una empresa, un edificio personalizado — la misma experiencia visual con la que Jose
Carlos ve JotaPuntoCe hoy en `apps/admin/app/login`, pero con los datos reales de esa organización.

## Decisiones (confirmadas con Jose Carlos)

1. **Efecto Rappi = intro animada + badge persistente.** Al entrar, una animación de una sola vez
   (2-3s) que resume el estado real de construcción de sus empresas (`org_build_stage`, no texto
   genérico) y se abre hacia el panel de íconos. Cada ícono conserva después su propio badge de
   etapa, siempre visible.
2. **Motor de edificio compartido.** Se generaliza `JotaPuntoCeBuilding.js` (hoy específico de
   JotaPuntoCe, en `apps/admin`) a un componente de props puros en `packages/ui`, usado por ambas
   apps. JotaPuntoCe sigue pasando sus 6 áreas/colores/siluetas actuales como constante literal
   (identidad de marca de la plataforma, no dato de cliente) — cero cambio visual ahí. Cualquier
   organización cliente lo alimenta con sus filas reales de `area`.
3. **Se ve cada vez que inicia sesión**, no solo la primera vez. Sin estado nuevo tipo "ya vio el
   onboarding" — el panel de empresas es simplemente el punto de entrada permanente, útil desde hoy
   (Camibel sola) y sin cambios cuando exista Afianza.

## Fuera de alcance (YAGNI, por ahora)

- Editor de siluetas/arquetipos por área para clientes nuevos — Camibel usa una silueta genérica
  para todas sus áreas. Un editor por cliente espera al segundo cliente real, según
  `.claude/rules/motor-generico.md` ("todo se construye a la medida en datos... hasta el segundo
  cliente real se decide qué se generaliza").
- Cualquier cambio al contenido o timing del mensaje de WhatsApp (`apps/admin/lib/whatsapp.js`,
  `provisionOrganization`) — ese flujo ya existe y no cambia.
- Cualquier cambio a `/[org]/dashboard` o `Scene3D.tsx` — ya son genéricos y ya funcionan; el
  edificio es un momento de llegada *antes* del dashboard, no un reemplazo de la escena 3D.

## Datos

Dos columnas nuevas en `organization` (`packages/db/src/schema.ts`), ambas nullable — no requieren
backfill:

- `slogan: text` — tagline bajo el letrero del edificio (ej. "Eficiencia con propósito" para
  JotaPuntoCe). `null` = el edificio no muestra segunda línea.
- `accent_color: text` — hex, tono ambiental del edificio/recepción de esa organización. `null` =
  usa un tono neutro por default.

Nada más nuevo — `organization.name` (letrero) y `area.name`/`area.color` (ventanas, ya usados por
`Scene3D`) ya existen y son exactamente los datos que este componente necesita.

## Rutas nuevas (`apps/improvement`)

Ninguna toca `/[org]/dashboard`, que sigue existiendo tal cual.

- **`app/page.tsx`** (modificado): con sesión, redirige a `/empresas` en vez de directo al
  dashboard. Sin sesión, sigue igual (`/login`).
- **`app/empresas/page.tsx`** (nuevo): Server Component. Guard: solo exige sesión (sin
  `requireOrgMembership`, porque todavía no hay un org elegido). Lee las organizaciones del usuario
  (join `membership` → `organization`) y la etapa actual de cada una (`org_build_stage`, misma
  lógica de derivación que ya usa `apps/admin/app/improvement/page.js`). Pasa esa lista a un Client
  Component que renderiza la intro animada + la grilla de íconos grandes.
- **`app/empresas/[orgId]/page.tsx`** (nuevo): Server Component. Guard:
  `requireOrgMembership(orgId)`, igual que el dashboard. Carga `organization` (nombre, slogan,
  accent_color) + sus filas de `area`. Renderiza el componente de edificio compartido, alimentado
  con esos datos reales. La transición edificio → recepción ocurre dentro de esta misma página
  (estado de cliente, sin ruta aparte — mismo mecanismo que ya usa `apps/admin/app/login` hoy). El
  botón final de la recepción navega a `/${orgId}/dashboard`.
  Caso borde: un usuario con cero memberships (no debería ocurrir — `provisionOrganization` siempre
  crea uno — pero si pasa) hace que `/empresas` muestre el mismo `empty-hint` textual que ya usan
  las listas vacías de `apps/admin`, en vez de una grilla vacía sin explicación.

## Componentes

- **`packages/ui/src/building/Building.tsx`** (nuevo, TypeScript): el motor — ventanas que se
  encienden en secuencia, siluetas trabajando, zoom a la puerta, recepción. Props puros:
  `companyName: string`, `slogan?: string`, `accentColor?: string`,
  `areas: { id, name, color, silhouette?: SilhouetteKind }[]`, `onEnter: () => void`.
  `SilhouetteKind` es un union type con las 6 claves ya usadas por JotaPuntoCe (ej. `"planeador"`,
  `"solucionador"`, `"imaginador"`, etc. — se nombran según el arquetipo real, no genérico) más
  `"generica"`. Cuando un área no trae `silhouette`, el componente usa `"generica"` — el caso de
  Camibel hoy. Sin fetch de datos adentro — mismo patrón que ya sigue `Scene3D.tsx` (todo llega
  resuelto desde el server). TypeScript porque un componente TS se importa sin fricción desde
  `apps/admin` (JS); al revés sí genera fricción de tipos.
- **`packages/ui/src/building/AppIconLarge.tsx`** (nuevo): variante grande del `AppIcon.js` de
  admin (mismo degradado/brillo/grid), con badge de etapa en vez de contador. Vive en `packages/ui`
  porque a la larga sirve a ambas apps, aunque hoy solo lo use `/empresas`.
- **`apps/admin/app/login`**: cambia su import de `JotaPuntoCeBuilding.js` al componente
  compartido, pasando los mismos 6 datos de siempre como constante literal dentro de admin. Cero
  cambio visual esperado — se verifica visualmente antes de dar el cambio por bueno.
- **`apps/improvement/app/empresas/[orgId]/page.tsx`** alimenta el mismo componente con datos
  reales de la organización.

## Testing

- Toda lógica pura nueva (armar las props del edificio desde filas de `area`/`organization`, derivar
  el badge de etapa desde `org_build_stage`) se prueba igual que `sceneGraph.ts` — funciones puras,
  sin DOM, sin mock de Canvas.
- Los componentes visuales (`Building.tsx`, `AppIconLarge.tsx`) no llevan test unitario — mismo
  criterio que ya aplica a `Scene3D.tsx` en este repo.
- Guards nuevos cubiertos igual que el resto de `apps/improvement/server/auth/guard.ts`: `/empresas`
  solo sesión, `/empresas/[orgId]` con `requireOrgMembership(orgId)`.
- Verificación visual manual de `apps/admin/app/login` tras la migración a `packages/ui` — sin
  regresión, mismo edificio de siempre.
