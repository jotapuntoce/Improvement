# Inventario de chequeos + puerta de entrada desde la landing

**Fecha:** 2026-10-02
**Estado:** Diseño aprobado por Jose Carlos por partes (1–4) en chat; pendiente su revisión de este documento.
**Alcance:** piezas 1 (inventario y registro) y 2 (puerta de entrada) del frente "Chequeo". Las piezas 3 (las 3
preguntas), 4 (motor que arma el chequeo), 5 (envío por correo con video, regalo y PDF) y la cadena que diagnostica
(Improvement mueve etapas solo y analiza qué convierte) van en specs propias.
**Relacionado:** `Improvement\jotapuntoce\03-crm.md` (etapas firmadas, Puerta 2), `04-director-interno.md` (escalera y
reglas del abono, 2026-10-02), `herramientas-monetise.md` fila 3 (Flozy, "cadena que diagnostica"),
`apps/admin/app/prospects/*` (se renombra a Clientes).

## Problema

El Chequeo gratis es la etapa 0 del CRM de JotaPuntoCe y la entrada de todo el embudo. Hoy vive en archivos sueltos
(`Improvement\jotapuntoce\chequeos\`), no hay registro de quién lo pide y no hay por dónde lo pida nadie: la landing
tiene un botón de WhatsApp y nada más. Jose Carlos lo quiere así:

- Desde la landing, cualquiera pide **un solo chequeo gratis por persona y por negocio**. Para pedirlo se registra
  (nombre, negocio, giro, correo, teléfono, ciudad, cómo nos conoció) y luego contesta una pequeña entrevista (sus
  enlaces y 3 preguntas al dueño).
- **El análisis empieza en la entrevista**: cómo escribe, qué contesta, si se registró y dejó pasar el tiempo o
  contestó de inmediato, de qué canal llegó.
- Todo chequeo, el que llega de la landing y el que hace él (Boreal), queda en **su inventario** del panel admin.
- La meta del embudo es que el prospecto **compre el Diagnóstico 360**. Ese es el número principal.
- A futuro, Improvement mueve solo al prospecto de etapa y aprende qué contacto (siempre pull) funciona con qué perfil.
  Para eso, cada paso tiene que quedar registrado desde el primer día.

## Decisiones (confirmadas con Jose Carlos)

1. **Base de datos, no carpetas.** Dos tablas admin-only, mismo patrón que `prospect_company`.
2. **Registro = solo formulario**, sin cuenta ni contraseña.
3. **La puerta vive en `apps/admin`** (`/api/chequeos`), ruta pública con CORS para la landing. Requisito para lanzar:
   publicar el admin (hoy no está publicado).
4. **Todo automático** después de la entrevista (piezas 4–5). Excepción explícita al nivel 0, solo para el Chequeo de
   la landing.
5. **Correo siempre pull** (valor primero, sin urgencia ni presión).
6. **Ganado = compró el Diagnóstico 360.** Al marcarlo, pasa solo a Clientes.
7. **Nivel 0 = emprendedor sin negocio.** También pide su chequeo, con su propia entrevista.
8. **Prospecto antes de comprar; cliente en cuanto compra algo.** "Prospectos" en el admin se renombra a **Clientes**.
9. **Giro obligatorio** en los dos orígenes.
10. Validación con **zod** en el admin (ya lo usa `apps/improvement`; se agrega en la misma versión, razón en el commit).

## Datos

### Tabla `chequeo`

Fuera del alcance de RLS multi-tenant (sin `org_id`): solo la lee y escribe `apps/admin` con la service-role key.
**RLS se activa sin ninguna política** (deny-all para `anon` y `authenticated`), en una migración `--custom` junto a la
del esquema, para cerrar la puerta de PostgREST.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid pk | |
| `origen` | text not null | check: `landing` · `propio` |
| `tipo` | text not null | check: `negocio` · `emprendedor` |
| `nombre` | text | persona. Obligatorio si `origen = landing` (lo valida zod) |
| `negocio` | text | nombre del negocio, o de la idea del emprendedor (opcional para emprendedor) |
| `negocio_clave` | text | `slug(negocio)` · `slug(ciudad)`; null si `tipo = emprendedor` o sin negocio |
| `giro` | text not null | para el emprendedor: qué quiere emprender |
| `ciudad` | text not null | |
| `correo` | text | guardado en minúsculas y sin espacios; obligatorio si `origen = landing` |
| `telefono` | text | solo dígitos, sin código de país 52 si trae 12 dígitos; obligatorio si `origen = landing` |
| `canal` | text not null | check: `anuncio_meta` · `referido` · `summum` · `tiktok` · `youtube` · `anuncio_google` · `conferencia` · `webinar` · `live` · `reel` · `otro` |
| `canal_detalle` | text | texto libre (para `otro`, o quién lo refirió) |
| `utm` | jsonb | `{source, medium, campaign, content, term}` tal como llegaron en la URL de la landing |
| `enlaces` | jsonb | `{instagram, youtube, linkedin, facebook, tiktok, sitio, google}`, solo las llaves que traiga |
| `sin_redes` | boolean not null default false | la casilla "Mi negocio no tiene redes sociales" |
| `respuestas` | jsonb | `[{pregunta, respuesta}]`: **el texto de la pregunta va con la respuesta**, y la respuesta tal como la escribió |
| `entrevista_segundos` | integer | cuánto tardó, medido por la landing |
| `entrevista_at` | timestamptz | cuándo mandó la entrevista |
| `clave_hash` | text | sha256 de la clave del envío 2; null en `propio` |
| `etapa` | text not null default `registrado` | ver abajo |
| `abre_puerta` | text | quién abre la puerta (Boreal → Ricardo) |
| `proxima_accion` | text | |
| `proxima_fecha` | date | |
| `notas` | text | |
| `pdf_path` | text | ruta dentro del bucket privado `chequeos` |
| `acepta_aviso_at` | timestamptz | obligatorio en `landing` |
| `acepta_correos` | boolean not null default false | consentimiento LFPDPPP para correos de promoción |
| `acepta_correos_at` | timestamptz | |
| `prospect_client_id` | uuid fk → `prospect_client` on delete set null | se llena al pasar a Clientes |
| `created_at`, `updated_at` | timestamptz | `created_at` = hora del registro |

**Etapas** (check): `registrado` → `pedido` → `entregado` → `contacto` → `conversacion` → `diagnostico` → `propuesta` →
`ganado` | `perdido`. Construcción, live y recompra viven en Clientes (`prospect_company.status`), no aquí.

**Un chequeo gratis por persona y por negocio** — índices únicos parciales, la base lo hace cumplir aunque alguien se
salte el formulario:
- `unique (correo) where correo is not null`
- `unique (telefono) where telefono is not null`
- `unique (negocio_clave) where negocio_clave is not null`

La normalización (minúsculas, dígitos, slug) la hace una sola función, `normalizarChequeo()`, antes de insertar. Lo
que no atrapa ("Boreal" vs. "Boreal Pádel") lo puede revisar el motor (pieza 4).

### Tabla `chequeo_evento` (la bitácora)

Append-only: sin `updated_at`, nunca se edita ni se borra (salvo en cascada si se borra el chequeo). Misma regla RLS
deny-all.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid pk | |
| `chequeo_id` | uuid fk → `chequeo` on delete cascade, indexado | |
| `tipo` | text not null | check: `registro` · `entrevista` · `etapa` · `correo` · `mensaje` · `llamada` · `nota` |
| `autor` | text not null | check: `prospecto` · `jose_carlos` · `improvement` |
| `detalle` | jsonb | p. ej. `{de, a}` en `etapa`; `{resultado, nota}` en un contacto |
| `created_at` | timestamptz | |

Resultados de un contacto: `respondio` · `sin_respuesta` · `agendo` · `no_le_interesa` · `otro`.

## Puerta de entrada (`apps/admin/app/api/chequeos/`)

Rutas públicas (sin `requirePlatformAdmin`), con CORS limitado a `CHEQUEOS_ORIGENES` (lista separada por comas en el
env; `OPTIONS` responde el preflight). Un origen fuera de la lista → `403`. Errores como resultados tipados
`{ ok: false, error: { code, ... } }`.

### Envío 1 · registro — `POST /api/chequeos`

```json
{
  "tipo": "negocio",
  "nombre": "Ana López",
  "negocio": "Boreal",
  "giro": "club de pádel",
  "correo": "ana@ejemplo.com",
  "telefono": "+52 444 123 4567",
  "ciudad": "San Luis Potosí",
  "canal": "reel",
  "canalDetalle": null,
  "utm": { "source": "instagram", "campaign": "lanzamiento" },
  "aceptaAviso": true,
  "aceptaCorreos": true,
  "sitio_web": ""
}
```

- `sitio_web` es la **trampa para bots**: campo invisible. Si llega con texto → `201` con un id falso y no se guarda
  nada.
- `tipo = emprendedor` → `negocio` opcional y la unicidad va solo por correo y teléfono.
- **201** `{ ok: true, data: { id, clave } }`. Guarda en `registrado` y escribe el evento `registro` (autor
  `prospecto`). La `clave` (32 bytes aleatorios en base64url) se devuelve una sola vez; en la base solo queda su hash.
- **400** `{ ok: false, error: { code: "DATOS_INVALIDOS", campos: { correo: "…" } } }`.
- **409** `{ ok: false, error: { code: "YA_EXISTE", mensaje: "Ya hay un chequeo gratis con estos datos. Si crees que es un error, escríbenos por WhatsApp." } }`.
  No dice qué dato coincidió. Sale tanto de la consulta previa como de una violación de unicidad (`23505`) en el
  insert, nunca como 500.

### Envío 2 · entrevista — `PATCH /api/chequeos/{id}`

```json
{
  "clave": "…",
  "enlaces": { "instagram": "https://instagram.com/boreal", "google": "https://maps.app.goo.gl/…" },
  "sinRedes": false,
  "respuestas": [
    { "pregunta": "texto de la pregunta 1", "respuesta": "tal como la escribió" },
    { "pregunta": "…", "respuesta": "…" },
    { "pregunta": "…", "respuesta": "…" }
  ],
  "entrevistaSegundos": 380
}
```

- Exige **mínimo un enlace o `sinRedes: true`**, y exactamente 3 respuestas no vacías. Las respuestas no se recortan
  ni se corrigen más allá de quitar espacios a los lados.
- **200** `{ ok: true }`. Pasa a `pedido`, llena `entrevista_at` y escribe los eventos `entrevista` y `etapa`.
- **404** si el id no existe o la clave no coincide (mismo error para los dos casos; comparación en tiempo constante).
- **409** `YA_ENVIADA` si la etapa ya no es `registrado`.
- **400** `DATOS_INVALIDOS` como en el envío 1.

Fuera de alcance por ahora: límite de envíos por minuto. Si llega basura en cantidad, se agrega Cloudflare Turnstile.

## Panel admin

### `/chequeos` (barra lateral, debajo de Planos)

- **Tablero:** total · **% que compró el Diagnóstico 360** (`ganado / total`) · registrados sin entrevista ·
  conteo por etapa · **por canal**: cuántos llegaron y cuántos compraron.
- **Lista** de tarjetas, del más nuevo al más viejo, filtro por etapa (`?etapa=`). Cada tarjeta: negocio o idea, giro,
  ciudad, persona, canal, etapa, próxima acción y **días sin movimiento** (desde el último evento).
- **+ Chequeo propio:** tipo, negocio, giro, ciudad, canal; persona, correo y teléfono opcionales; quién abre la
  puerta. Entra en etapa `pedido`, con evento `registro` de autor `jose_carlos`. Un `pedido` con PDF se muestra como
  "listo para entregar"; pasa a `entregado` cuando él lo entrega.

### `/chequeos/[id]`

- Todos sus datos; enlaces o "sin redes"; respuestas tal como las escribió.
- **Su tiempo:** "se registró el 2 de oct; contestó la entrevista 3 días después, en 6 min".
- **Bitácora** como línea de tiempo.
- Acciones (Server Actions con `requirePlatformAdmin()` y zod):
  - **Cambiar etapa** → evento `etapa`.
  - **Anotar contacto** (correo · mensaje · llamada + resultado + nota) → evento.
  - **Próxima acción y fecha.**
  - **Subir PDF** → bucket privado `chequeos` de Supabase Storage (se crea si no existe); "Ver PDF" genera un enlace
    firmado de pocos minutos al hacer clic.
- **Al marcar `ganado`:** exige correo y teléfono; crea `prospect_client` + `prospect_company` con
  `createProspectClient()` (ya existe en `app/prospects/actions.js`), guarda `prospect_client_id` y enlaza a su ficha.
  Idempotente: si `prospect_client_id` ya existe, no crea otro.

### Renombre "Prospectos" → "Clientes"

Ruta `/prospects` → `/clientes` (carpeta, enlaces, `revalidatePath`, import de los tests) y textos visibles
("Backlog de prospectos" → "Clientes"). **Las tablas no se renombran** (`prospect_client`, `prospect_company`): sería
una migración sin valor para el usuario.

### Boreal

Se da de alta desde "+ Chequeo propio" (negocio, club de pádel, San Luis Potosí, abre la puerta Ricardo, próxima
acción "mensaje a Ricardo") y se le sube `Chequeo-Boreal.pdf`. La fuente `chequeo-boreal.html` se queda en
`Improvement\jotapuntoce\chequeos\`.

## Archivos

| Archivo | Qué |
|---|---|
| `packages/db/src/schema.ts` | `chequeo`, `chequeo_evento` |
| `packages/db/migrations/*` | generadas con `pnpm db:generate` + una `--custom` con `enable row level security` |
| `apps/admin/lib/chequeos.js` | `normalizarChequeo`, esquemas zod, `registrarChequeo`, `guardarEntrevista`, `cambiarEtapa`, `anotarContacto`, `marcarGanado`, tablero |
| `apps/admin/app/api/chequeos/route.js` | `POST`, `OPTIONS` |
| `apps/admin/app/api/chequeos/[id]/route.js` | `PATCH`, `OPTIONS` |
| `apps/admin/app/chequeos/page.js`, `[id]/page.js`, `actions.js` | panel |
| `apps/admin/components/Sidebar.js`, `brand/NavIcons.js` | entrada "Chequeos" |
| `apps/admin/app/clientes/*` | renombre de `prospects` |
| `apps/admin/tests/chequeos.test.js` | ver Pruebas |
| `apps/admin/package.json` | `zod` |
| `.env.example` | `CHEQUEOS_ORIGENES` |
| `Improvement\jotapuntoce\landing\chequeo-api.md` | la hoja para el chat de la landing |

## Pruebas

Integración contra el Supabase de desarrollo, con limpieza en `afterEach` (patrón de `prospects.test.js`). Se prueba
la lógica de `lib/chequeos.js` y los handlers de ruta llamados con un `Request` construido a mano.

- Registro bueno → `registrado` + evento `registro`.
- Duplicados → `409`: mismo correo con otras mayúsculas; mismo teléfono con otro formato (`+52 444…` vs `444…`); mismo
  negocio en la misma ciudad con otra capitalización.
- Dos emprendedores con la misma idea y distinto correo → ambos pasan.
- Trampa llena → `201` y nada guardado. Origen fuera de la lista → `403`.
- Entrevista sin enlaces y sin `sinRedes` → `400`; clave equivocada → `404`; dos veces → `409`; buena → `pedido`.
- Cambio de etapa escribe evento; `ganado` sin correo → error; `ganado` dos veces → **un** `prospect_client`.
- `normalizarChequeo` y los esquemas zod con pruebas unitarias sin base de datos.

Gate: `pnpm lint && pnpm typecheck && pnpm test`. Sin `.env.test` las de integración no corren (esperado, ver
CLAUDE.md); las unitarias sí.

## Fuera de alcance

Las 3 preguntas (pieza 3) · el motor del chequeo (4) · el correo con video, regalo y PDF (5) · que Improvement mueva
etapas y analice conversiones (cadena que diagnostica) · correos de valor a la base · bonus sorpresa para clientes
nuevos · publicar el admin · límite de envíos por minuto.
