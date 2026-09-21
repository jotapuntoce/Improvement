# Panel de Clientes para el platform admin + ícono personalizable

**Fecha:** 2026-09-04
**Estado:** Aprobado por Jose Carlos, listo para plan de implementación.
**Relacionado:** `/empresas` de `apps/improvement` (ya existe, del plan de onboarding de cliente),
`provisionOrganization()` (ya agrega a cada platform admin como member de cada org nueva — commit
`340143f`).

## Problema

Con el membership automático de platform admin ya en producción, cuando Jose Carlos entra a
`apps/improvement` ve exactamente lo mismo que vería un cliente: un mosaico plano de todas las
organizaciones donde tiene membership. Hoy es solo "JotaPuntoCe (demo)" — pero en cuanto Jaime
tenga Camibel y Afianza, ese mosaico mezclaría las empresas de Jaime con las de cualquier otro
cliente futuro, sin agrupar por persona. Jose Carlos necesita, en vez de eso, una vista de
**Clientes**: una tarjeta por persona (Jaime Salinas), y al entrar a una — sus empresas activas.
Además, quiere que cada cliente pueda personalizar su propio ícono desde su propia sesión, y que
esa personalización se vea reflejada en la vista de Clientes de Jose Carlos.

## Decisiones (confirmadas con Jose Carlos)

1. **`/empresas` se comporta distinto según el rol de quien entra.** Un cliente normal (Jaime) ve
   exactamente lo mismo que hoy — sus propias empresas, sin cambios. Un platform admin
   (`profile.is_platform_admin = true`) ve, en su lugar, una vista de Clientes.
2. **La vista de Clientes solo muestra empresas activas** — las que ya son un `organization` real
   con membership. Las que todavía no se construyen (solo existen como `prospectCompany` sin
   `orgId`) NO se muestran aquí — esa vista ya existe y es correcta en `apps/admin/app/improvement`,
   que agrupa por `prospectClient` con acceso completo vía service-role key. `apps/improvement`
   nunca toca `prospectClient`/`prospectCompany` (regla ya establecida) — la vista de Clientes se
   arma enteramente con `membership`+`profile`, datos que `apps/improvement` ya usa en todos lados.
3. **Agrupación por "el otro dueño real" de cada organización**, no por tabla de admin. Para cada
   org donde el platform admin tiene membership, se busca el membership con `role='owner'` de esa
   misma org cuyo `userId` no sea el del admin — esa persona es el cliente. Una org sin ningún otro
   owner (como "JotaPuntoCe (demo)", que solo tiene al admin) no pertenece a ningún cliente y no
   aparece en esta vista — resuelve directamente la queja original ("solo veo JotaPuntoCe (Demo)").
4. **Ícono personalizable por el propio cliente**, no editado por Jose Carlos. Cada `profile` puede
   elegir su propio color de identidad — reutilizando los 4 presets de acento que ya existen en
   `packages/ui/src/tokens.css` (Aurora/default, Esmeralda, Solar, Índigo; ver
   `.claude/rules/tokens-de-diseno.md`), nunca un hex nuevo. Se guarda como el NOMBRE del preset
   (`"aurora" | "esmeralda" | "solar" | "indigo"`), no como hex crudo — la fuente de verdad del
   valor sigue siendo tokens.css. El color elegido se ve en cualquier lugar donde se muestre la
   identidad de esa persona, incluida la tarjeta de Jose Carlos en su vista de Clientes.

## Fuera de alcance (YAGNI, por ahora)

- Un cliente con más de un `owner` real por organización (co-dueños) — se agrupa por el primer
  owner-no-admin encontrado (determinista por `acceptedAt`), sin manejar multi-dueño todavía.
- Subir una imagen propia como ícono — el ícono sigue siendo iniciales + color, mismo lenguaje
  visual que `AppIconLarge`; no hay infraestructura de subida de archivos en este monorepo todavía
  y agregarla es una decisión más grande, fuera de este cambio.
- Cualquier cambio a `apps/admin/app/improvement/page.js` — ya hace bien la parte de "empresas por
  construirse", no se toca.

## Datos

Una columna nueva en `profile` (`packages/db/src/schema.ts`), nullable:

- `avatar_color: text` — uno de `"aurora" | "esmeralda" | "solar" | "indigo"`. `null` = usa
  "aurora" (el degradado default, `--accent-1`/`--accent-2` sin override) al renderizar.

## Rutas y componentes (`apps/improvement`)

- **`app/empresas/page.tsx`** (modificado): además de `loadCompanies`, ahora también resuelve
  `profile.isPlatformAdmin` para el usuario de la sesión. Si es `true`, renderiza `ClientPicker`
  (nuevo) en vez de `CompanyPicker` (existente, sin cambios — sigue siendo lo que ve un cliente
  normal).
- **`app/empresas/ClientPicker.tsx`** (nuevo, `"use client"`): grilla de clientes, mismo lenguaje
  visual que `CompanyPicker` (reutiliza el mismo patrón de intro/grilla, sin el efecto Rappi de
  construcción — aquí no aplica, es una lista de personas, no de estados de obra). Cada tarjeta usa
  el nuevo `AvatarIcon` (ver abajo) con las iniciales y el `avatarColor` de esa persona. Clic navega
  a `/empresas/clientes/[clientUserId]`.
- **`app/empresas/clientes/[clientUserId]/page.tsx`** (nuevo): Server Component. Guard: sesión +
  `profile.isPlatformAdmin` (404 si no es admin — mismo criterio "404 nunca 403" que el resto de la
  app). Carga las organizaciones activas de ese cliente específico (mismas orgs, filtradas a las que
  ese `clientUserId` tiene `membership`) y las renderiza con el `CompanyPicker` ya existente
  (reutilizado tal cual — la grilla de empresas de un cliente es visualmente idéntica sea quien sea
  quien la esté viendo). **Punto a verificar en implementación:** `apps/improvement` corre bajo RLS
  con la sesión real del usuario (no service-role) — hay que confirmar que la política de
  `membership`/`organization` deja a un platform admin leer el membership de OTRO usuario (no solo
  el propio) antes de asumir que esta consulta funciona tal cual; si RLS lo bloquea, la lectura
  necesita pasar por una ruta con service-role acotada a esta consulta específica, nunca ampliar el
  acceso general de `apps/improvement`.
- **`app/empresas/PersonalizeAvatar.tsx`** (nuevo, `"use client"`): un botón pequeño ("Personalizar
  mi ícono") visible en `/empresas` para CUALQUIER usuario (cliente o admin — cada quien personaliza
  el suyo), que despliega los 4 presets y llama a la Server Action `updateAvatarColor`. Aparece en
  ambos casos — arriba del `CompanyPicker` para un cliente normal, arriba del `ClientPicker` para un
  admin (el admin también tiene su propio avatarColor, mostrado donde sea que su identidad aparezca
  en el futuro).

## Servidor (`apps/improvement/server/**`)

- **`server/companies/clientList.ts`** (pure, con tests): `buildClientList(orgs, membershipsByOrgId,
  profilesById, adminUserId)` — para cada org, encuentra el primer membership `role='owner'` con
  `userId !== adminUserId`, agrupa las orgs de ese cliente, arma `{ clientUserId, name, avatarColor,
  companies: [...] }[]`. Orgs sin ningún otro owner se excluyen del resultado.
- **`server/companies/loadClients.ts`** (puente DB): consulta `membership` del admin, las
  `organization` correspondientes, TODOS los `membership` de esas orgs, y los `profile` de esos
  userIds — arma los inputs de `buildClientList` y lo llama.
- **`server/companies/loadClientCompanies.ts`** (puente DB, para la página de un cliente
  específico): dado un `clientUserId`, las organizaciones donde ese usuario tiene `membership`,
  reutilizando `buildCompanyList`/`deriveStageLabel` ya existentes (Task 4 del plan anterior) — la
  vista de "empresas de Jaime" usa exactamente la misma lógica de badge de etapa que su propio
  `/empresas`.
- **`server/profile/updateAvatarColor.ts`** (Server Action): valida que el valor sea uno de los 4
  presets exactos (rechaza cualquier otro string), y actualiza `profile.avatarColor` **solo para el
  userId de la sesión actual** — nunca para otro usuario, ni siquiera si quien llama es platform
  admin. Un cliente jamás puede personalizar el ícono de otro cliente, y un admin tampoco.

## Componente compartido (`packages/ui`)

- **`packages/ui/src/building/AvatarIcon.tsx`** (nuevo): mismo lenguaje visual que
  `AppIconLarge.tsx` (degradado, grid, brillo) pero para una PERSONA, no una empresa — sin badge de
  etapa, con las iniciales del nombre en vez del glyph de cuadrícula. Recibe `name` y
  `avatarColor?: "aurora" | "esmeralda" | "solar" | "indigo"` — el degradado se resuelve con un mapa
  fijo de 4 entradas (mismos pares de valores que `packages/ui/src/tokens.css`, nunca un hex nuevo
  inventado aquí). Iniciales: primera letra de la primera palabra + primera letra de la última
  palabra de `name` (ej. "Jaime Salinas" → "JS"); si `name` es una sola palabra, solo esa letra; si
  `name` está vacío (no debería pasar — `profile.fullName` es opcional pero el email siempre existe
  como fallback en el caller), la primera letra del email.

## Testing

- `clientList.ts` (pure): casos — una org sin otro owner se excluye; dos orgs del mismo cliente se
  agrupan; una org con dos owners no-admin usa el primero por `acceptedAt`. Mismo patrón sin DOM que
  `buildingGraph.ts`/`companyList.ts`.
- `updateAvatarColor`: valida que un preset inválido se rechace, y que la actualización solo afecte
  el `userId` de la sesión (no otro usuario) — este es el guard más importante del cambio, requiere
  un test explícito.
- Sin test para `AvatarIcon.tsx`/`ClientPicker.tsx`/`PersonalizeAvatar.tsx` — mismo criterio ya
  establecido para componentes puramente presentacionales en este repo (`Scene3D.tsx`,
  `Building.tsx`, `AppIconLarge.tsx`).
