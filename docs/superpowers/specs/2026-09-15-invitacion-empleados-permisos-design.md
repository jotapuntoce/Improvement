# Invitación de empleados + permisos por empleado definidos por el dueño

**Fecha:** 2026-09-15
**Estado:** Aprobado por Jose Carlos, listo para plan de implementación.
**Relacionado:** tabla `invitation` (existe en `packages/db/src/schema.ts` desde el esquema inicial,
hoy referenciada por **cero** archivos del repo), `requireOrgMembership()`
(`apps/improvement/server/auth/guard.ts`), `/empresas/configuracion` (página de configuración del
dueño, donde ya vive el editor de indicadores).

## Problema

Todos los datos de la empresa digital de un cliente tienen que alimentarse del trabajo que su gente
hace en la empresa física. Hoy no hay por dónde: un empleado no puede entrar porque no existe
ninguna forma de invitarlo. La tabla `invitation` está en el esquema pero ningún archivo la usa, no
hay ruta de aceptación, y `membership.role` solo distingue `owner` de `employee` — no hay manera de
que el dueño diga quién ve qué.

Jose Carlos lo puso como condición explícita: *"cada empleado tiene un tipo de permiso para poder
tener acceso a información. El dueño tiene acceso a absolutamente todo. Él define a qué tiene acceso
cada empleado."* Y como marco general: *"el dueño de la empresa puede personalizar su empresa
digital."*

Esto es el primer paso de "dejar la tierra arada": sin gente adentro y sin un modelo de quién ve
qué, ninguna de las pantallas que siguen (crear objetivos, reportar avance, recordatorios) tiene a
quién servir.

## Decisiones (confirmadas con Jose Carlos)

1. **El permiso es un tipo con nombre, reutilizable, creado por el dueño** — no una lista de casillas
   que se marca una por una en cada persona. El dueño crea "Vendedor", "Jefe de obra",
   "Administrativo" con los nombres que él quiera, y al invitar solo elige uno. Cambiar el tipo
   cambia a todos los que lo tienen, que es lo que se espera al decir "los vendedores ahora sí ven
   la cartera". Improvement **no trae ningún tipo de fábrica**: los nombres del organigrama son del
   negocio del cliente, no del producto.

2. **Cuatro alcances por sección**, no un sí/no:

   | Alcance | Qué ve |
   |---|---|
   | `empresa` | Todo lo de la sección, de toda la empresa |
   | `area` | Solo lo de su área |
   | `propio` | Solo lo que está asignado a él |
   | `ninguno` | La sección no existe para él — ni en el menú, ni por URL |

3. **Dos reglas que no se rompen:** el dueño ve todo siempre, sin importar qué tipo tenga asignado
   (incluso si no tiene ninguno); y **sin tipo asignado no se ve nada** — negar por defecto. Un
   empleado que quedó a medio configurar no puede terminar viendo de más.

4. **La entrada es por enlace de invitación**, no por alta manual del dueño ni por registro abierto.
   El dueño genera el enlace desde Equipo y hoy lo comparte como quiera (WhatsApp, correo personal,
   lo que sea) — mandarlo automáticamente es el trabajo de comunicación que quedó en pausa. El
   enlace vence a los 7 días y es de un solo uso.

5. **Al aceptar, el empleado llena un formulario completo y de ahí Improvement le asigna su posición
   dentro de la empresa digital.** Una sola pantalla: contraseña, nombre, teléfono, área (de la lista
   del dueño), puesto y de qué se encarga. El sistema no le pregunta qué permisos quiere — eso ya lo
   decidió el dueño al invitarlo.

6. **El dueño personaliza el vocabulario de su empresa digital.** Puede renombrar cada sección y
   apagar las que no usa: una constructora ve "Obras" donde otra ve "Clientes", y quien no usa
   PowerUps no lo tiene en el menú. Lo que NO es personalizable es *cuáles* secciones existen —
   cada una es una pantalla real con su código. (Jose Carlos aprobó el diseño con "comienza" sin
   separar esta parte; se incluye porque es barato y porque él lo marcó como "super importante". Si
   prefiere sacarlo del primer corte, es lo único de este spec que se puede quitar sin tocar nada
   más.)

7. **Crear áreas entra en este trabajo.** No estaba en el pedido original, pero el formulario de
   aceptación le pide al empleado elegir su área de la lista del dueño, y hoy no hay ninguna pantalla
   que cree áreas — solo el seed. Sin esto, la lista siempre está vacía.

## Fuera de alcance (YAGNI, por ahora)

- **Mandar la invitación por correo o WhatsApp.** El dueño copia el enlace. La integración de
  comunicación está en pausa por decisión suya hasta terminar de construir la empresa digital
  (memoria `comunicacion-diferida`).
- **Excepciones por persona** ("este vendedor además ve la cartera"). Se eligieron tipos limpios; si
  alguien necesita algo distinto, se le crea otro tipo.
- **Crear objetivos, reportar avance y recordatorios.** Son los pasos siguientes del mismo plan, ya
  acordados en ese orden. Este spec solo deja a la gente adentro y con permisos.
- **Que el empleado pertenezca a más de un área.** Una persona, un área por empresa.
- **Revocar o expirar una membresía existente.** Se invita y se acepta; dar de baja a alguien es otro
  cambio.
- **Reenviar o cancelar una invitación ya emitida.** Se genera otra; la vieja vence sola a los 7 días.

## Datos

### Tabla nueva: `permission_type`

Org-scoped, con su política RLS en la misma migración (Non-negotiable #1).

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid pk | `id()` |
| `org_id` | uuid not null | → `organization.id`, `on delete cascade`, con índice |
| `name` | text not null | El nombre que el dueño le puso. `unique(org_id, name)` |
| `grants` | jsonb not null default `'{}'` | Mapa sección → alcance |
| `created_at` / `updated_at` | | |

`grants` se ve así:

```json
{ "mapa": "empresa", "objetivos": "area", "equipo": "area", "clientes": "ninguno", "powerups": "empresa" }
```

Una sección ausente del mapa se lee como `ninguno` — el default niega, nunca concede.

### Las secciones y sus alcances válidos

Viven en `apps/improvement/server/permissions/sections.ts`, una sola lista, validada en el borde con
zod. No toda sección admite los cuatro alcances: `area` y `propio` solo significan algo donde la fila
tiene de dónde colgarse.

| Sección | Alcances válidos | Por qué |
|---|---|---|
| `mapa` | `empresa`, `ninguno` | Es el estado de la empresa completa |
| `objetivos` | `empresa`, `area`, `propio`, `ninguno` | `objective` tiene `area_id` y `assigned_employee_id` |
| `equipo` | `empresa`, `area`, `ninguno` | `membership.area_id` filtra compañeros |
| `clientes` | `empresa`, `ninguno` | `client` no tiene área ni responsable todavía |
| `powerups` | `empresa`, `ninguno` | El catálogo es de toda la empresa |

`planos` NO entra: es herramienta de Jose Carlos, ya cerrada por el guard de platform admin en
`app/[org]/planos/page.tsx`. Un tipo de permiso no puede abrirla.

### Columnas nuevas

**`membership`** — el área vive aquí y no en `profile` porque la misma persona podría estar en dos
empresas del mismo dueño con papeles distintos:

- `permission_type_id uuid` → `permission_type.id`, `on delete set null`. **null = no ve nada.**
- `area_id uuid` → `area.id`, `on delete set null`
- `job_title text` — el puesto que declaró al aceptar
- `responsibilities text` — de qué se encarga, en sus palabras

**`profile`** — `phone text`. Es el teléfono que la integración de comunicación va a necesitar
después; se captura aquí porque es el único momento en que se le pregunta a la persona
(decisión ya tomada en `comunicacion-diferida`).

**`invitation`** — `permission_type_id uuid` → `permission_type.id`, `on delete cascade`. La tabla ya
trae `email`, `token_hash` (único), `expires_at` y `accepted_at`; no hace falta nada más.

**`organization`** — `section_labels jsonb not null default '{}'`, para la personalización del punto 6:

```json
{ "clientes": { "label": "Obras" }, "powerups": { "hidden": true } }
```

Una columna y no una tabla: son cinco llaves por empresa que solo se leen completas, nunca se
consultan ni se ordenan. `organization` ya es legible por cualquier miembro, así que no agrega
política nueva.

## Servidor (`apps/improvement/server/**`)

- **`permissions/sections.ts`** (nuevo) — `SECTIONS` (slug, label por defecto, alcances válidos),
  el tipo `Scope`, el esquema zod de `grants` y `scopeFor(membership, permissionType, section)`, que
  es la única función que sabe que el dueño siempre gana y que la ausencia de tipo niega. Sin acceso
  a base: pura, para poder probarla sola.
- **`permissions/mutations.ts`** (nuevo) — `createPermissionType`, `updatePermissionType`,
  `deletePermissionType`. Solo dueño (mismo `requireOwner()` que `server/kpis/mutations.ts`).
  Borrar un tipo que alguien tiene asignado deja a esa gente en `null`, o sea sin ver nada — es el
  comportamiento seguro, y la pantalla lo advierte antes.
- **`invitations/mutations.ts`** (nuevo) — `createInvitation(userId, orgId, email, permissionTypeId)`
  y `acceptInvitation(token, form)`.
- **`invitations/loadInvitation.ts`** (nuevo) — resuelve un token a la invitación viva y a los datos
  que la pantalla de aceptación necesita (nombre de la empresa, lista de áreas).
- **`areas/mutations.ts`** (nuevo) — `createArea`, `renameArea`, `removeArea`. Solo dueño. No se
  puede borrar un área con gente u objetivos colgando.
- **`organizations/mutations.ts`** (nuevo o donde caiga natural) — `setSectionLabels`.
- **`auth/guard.ts`** (modificado) — se le agrega `requireSection()`, ver abajo. Todo lo que ya
  existe ahí se queda igual.

### El enlace

`createInvitation` genera un token con `crypto.randomUUID()`, guarda **solo** su SHA-256 en
`token_hash` y devuelve el token crudo una única vez, para que la pantalla lo muestre en un enlace
copiable. Quien se robe la base no se roba invitaciones usables. `expires_at` = ahora + 7 días.

### La aceptación

Es el único paso delicado, porque mezcla una llamada externa con una transacción:

1. Se busca la invitación por el hash del token. Si no existe, ya tiene `accepted_at`, o venció → la
   pantalla dice "este enlace ya no sirve" y no dice de qué empresa era.
2. Se valida el formulario con zod.
3. **`supabase.auth.signUp()` con la llave anon** — no `auth.admin.createUser`, que exige la
   service-role key y tiene prohibido existir en `apps/improvement` (Non-negotiable #3). El correo no
   se le pregunta al empleado: lo fijó el dueño al invitar y el formulario no lo puede cambiar.
   *Prerrequisito a verificar al implementar:* el proyecto de Supabase debe tener "Confirm email"
   apagado, o `signUp` no devuelve sesión. La prueba de que ese correo es suyo es el enlace, que solo
   le llegó a él. Si estuviera encendido, el empleado queda creado pero aterriza en el login en vez
   de entrar directo — degradación aceptable, pero hay que saberlo antes.
4. En **una sola transacción**: `profile` (con teléfono), `membership` (con área, puesto,
   responsabilidades y el `permission_type_id` que venía en la invitación) y el `accepted_at` de la
   invitación. Si algo truena, no queda un usuario a medias adentro de la empresa.
5. El `update` de la invitación lleva `where accepted_at is null` — dos personas abriendo el mismo
   enlace a la vez, gana una. Misma guarda de carrera que usa `server/reminders/deliver.ts`.

## Cómo se hace valer el permiso

Tres capas. Ninguna sola alcanza.

**1. El guard.** `requireSection(orgId, section)` en `server/auth/guard.ts`: hace lo que
`requireOrgMembership` y además resuelve el alcance. Devuelve `{ membership, scope }`. Si el alcance
es `ninguno` → `notFound()`. **404 y no 403**, mismo criterio que ya rige el guard de tenencia: un
403 le confirma a alguien que la sección existe.

**2. El filtro.** El guard no solo deja pasar: devuelve el alcance y el loader filtra con él. El
loader nunca adivina — se lo dan:

- `area` → `where area_id = <su área>` (si su `area_id` es null, no ve nada, no ve todo)
- `propio` → `where assigned_employee_id = <él>`

**3. RLS.** La política lee el tipo desde `membership` y decide igual que el guard. Es la que atrapa
el error del día que alguien escriba una consulta nueva y se le olvide llamar al guard (Code rule #7
de CLAUDE.md: "RLS + `requireOrgMembership()` siempre juntos, ninguna query confía solo en uno"):

```sql
create policy "members read objectives their permission type allows"
  on objective for select
  using (exists (
    select 1 from membership m
    left join permission_type pt on pt.id = m.permission_type_id
    where m.org_id = objective.org_id
      and m.user_id = auth.uid()
      and (
        m.role = 'owner'
        or pt.grants->>'objetivos' = 'empresa'
        or (pt.grants->>'objetivos' = 'area'   and objective.area_id = m.area_id)
        or (pt.grants->>'objetivos' = 'propio' and objective.assigned_employee_id = auth.uid())
      )
  ));
```

`left join` y no `join`: sin tipo asignado, `pt` es null, ninguna rama se cumple y la política niega
— que es exactamente la regla de negar por defecto, escrita en SQL.

Tablas que cambian de política en esta migración: `objective` y `client`. Las dos ya tienen una
política de 0001 (`"org members read their org's objectives"` y `"org members read their org's
clients"`, ambas de membresía simple) que se hace `drop policy` y se reemplaza por la nueva en el
mismo archivo — no se agrega una segunda, porque dos políticas de SELECT se suman con OR y la vieja
volvería a abrir todo. `permission_type` estrena la suya (lectura para miembros del org; la escritura
pasa por el pool de la aplicación después de `requireOwner()`, igual que `org_kpi`). `area`,
`membership` y `invitation` no cambian.

**Lo que RLS aquí NO cubre, dicho de frente:** el alcance `area` de la sección **Equipo** es un
filtro de presentación, no una frontera de base. La política de 0001 `"org members read profiles of
their org-mates"` ya deja a cualquier miembro leer el `profile` de sus compañeros, y cerrarla es un
cambio más grande que este spec (rompería el mapa, los objetivos asignados y la escena 3D, que
muestran nombres de otros). Lo que sí sigue blindado por RLS es lo que exige el Non-negotiable #4: un
empleado nunca lee el `responsibility_level` de otro — eso no lo toca este cambio. `powerups` y
`mapa` son todo-o-nada y los cierra el guard.

**4. El menú.** `DashboardNav` solo dibuja las secciones que esa persona tiene, con el nombre que el
dueño les puso y sin las que apagó. Nadie ve una puerta que no abre.

## Rutas y componentes (`apps/improvement/app/**`)

- **`[org]/equipo/page.tsx`** (modificado) — la rama de dueño gana un botón **Invitar** y la lista de
  invitaciones vivas (correo, tipo, cuándo vence). La rama de empleado no cambia, salvo que ahora
  respeta el alcance `area`.
- **`[org]/equipo/invitar/page.tsx`** (nuevo) — correo + tipo de permiso. Al guardar muestra el
  enlace con un botón de copiar, una sola vez, con la advertencia de que no se vuelve a mostrar.
- **`[org]/equipo/permisos/page.tsx`** (nuevo) — los tipos de permiso de la empresa. Una fila por
  tipo; al abrirlo, una cuadrícula de sección × alcance. Solo dueño.
- **`invitacion/[token]/page.tsx`** (nuevo, fuera de `[org]` porque quien entra todavía no es miembro
  de nada) — el formulario de aceptación. Server Component que valida el token y renderiza un
  formulario cliente para la contraseña.
- **`empresas/configuracion/page.tsx`** (modificado) — se le agregan dos bloques junto al editor de
  indicadores que ya vive ahí: **Áreas** (crear, renombrar, borrar) y **Nombres de las secciones**
  (renombrar y apagar). Es la página de "así se llama todo en mi empresa"; partirla en tres sería
  mandar al dueño a tres lugares para la misma decisión.

Sin CSS nuevo fuera de `app/globals.css` y sin ningún hex que no esté en
`packages/ui/src/tokens.css` (`.claude/rules/tokens-de-diseno.md`). Los formularios reusan las clases
`.config-*` que ya existen.

## Testing

Contra el proyecto Supabase real, en el estilo WHEN/SHALL del repo. Las que importan:

**Alcance (`server/permissions/sections.ts`, puras):**
- WHEN el miembro es dueño THE SYSTEM SHALL devolver `empresa` en toda sección, aunque su
  `permission_type_id` sea null.
- WHEN el miembro no tiene tipo THE SYSTEM SHALL devolver `ninguno` en toda sección.
- WHEN `grants` no menciona una sección THE SYSTEM SHALL devolver `ninguno` para esa sección.
- WHEN `grants` trae un alcance inválido para esa sección (`clientes: "propio"`) THE SYSTEM SHALL
  rechazarlo al guardar, no al leer.

**Filtrado (contra base):**
- WHEN un empleado con alcance `area` pide objetivos THE SYSTEM SHALL devolver solo los de su área, y
  los de otra área **no aparecen ni pidiéndolos por id**.
- WHEN un empleado con alcance `propio` pide objetivos THE SYSTEM SHALL ocultar los de un compañero.
- WHEN un empleado con alcance `area` tiene `area_id` null THE SYSTEM SHALL devolver cero filas, no
  todas.

**Guard:**
- WHEN un empleado sin tipo entra a una sección THE SYSTEM SHALL responder 404.
- WHEN el dueño entra a cualquier sección THE SYSTEM SHALL dejarlo pasar.

**RLS, no solo el guard** (mismo criterio que la prueba de `payment`): consultando como
`authenticated`, un empleado con alcance `propio` no lee los objetivos de otro.

**Invitación:**
- WHEN el token ya fue aceptado, o venció, THE SYSTEM SHALL rechazarlo.
- WHEN la aceptación falla a media transacción THE SYSTEM SHALL no dejar `profile` ni `membership`
  creados.
- WHEN la invitación se acepta THE SYSTEM SHALL crear la membresía con el área, el puesto y el tipo
  de permiso que traía, sin que el formulario haya podido cambiar el correo ni el tipo.

## Orden sugerido para el plan

1. Esquema + migraciones (tabla, columnas, políticas RLS) — su propio commit, sin lógica.
2. `sections.ts` + `requireSection` + pruebas puras.
3. Áreas y tipos de permiso (las dos pantallas del dueño).
4. Invitar y aceptar.
5. Filtrado por alcance en los loaders existentes + menú.
6. Nombres de secciones.

Cada paso deja el repo con `pnpm lint && pnpm typecheck && pnpm test` en verde.
