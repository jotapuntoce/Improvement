# Motor del Chequeo · diseño

**Fecha:** 2026-10-05 · **Estado:** aprobado por partes en chat, falta la revisión del documento.
**Viene de:** `2026-10-02-inventario-chequeos-design.md`, pieza siguiente n.º 2 ("el motor que arma el chequeo").
**Ejemplo de calidad:** `Improvement\jotapuntoce\chequeos\chequeo-boreal.md`, `.html` y `.pdf`, hecho a mano el 2026-09-28.

## 1 · Qué hace

El motor toma un chequeo del inventario y lo estudia **desde afuera**, con lo que se lee libre: sitio, ficha de Google,
YouTube y las respuestas de la entrevista. Entrega los **patógenos visibles** y las **pastillas** para actuar ya, en la
plantilla de la marca. Deja un **borrador** que el dueño revisa y aprueba.

Lo que **no** hace (decisión del dueño, 2026-10-05):
- No usa un servicio de lectura de redes sociales (tipo Apify). Instagram, TikTok y Facebook piden sesión, y leer los
  posts a fondo es trabajo del **Diagnóstico 360**. Si el enlace no abre, eso mismo entra al análisis.
- No envía nada. El envío por Gmail con video, animación y página del regalo es la pieza n.º 3. Hasta entonces, todo
  pasa por la aprobación del dueño.
- No trae editor de texto. Para corregir: "Rehacer con esta nota", o subir un PDF propio (ya existe).

## 2 · Flujo

**Cuándo arranca:**
- **Landing:** al guardarse la entrevista (`PATCH /api/chequeos/[id]` con 200), el handler programa el armado con
  `after()` de `next/server`. La respuesta al prospecto no espera al motor.
- **Propio:** no tiene entrevista. En su página del panel, el dueño llena los enlaces que conozca (se guardan en
  `chequeo.enlaces`) y una nota de contexto (`chequeo.notas`), y luego pica **"Armar con Improvement"**.

**Estados** (`chequeo.motor_estado`):

| Estado | Qué significa | Siguiente |
|---|---|---|
| `sin_empezar` | Nunca se ha armado | `armando` o `en_fila` |
| `en_fila` | Llegó con el tope del día lleno; WhatsApp al dueño | el dueño pica "Armar" → `armando` |
| `armando` | Investigando y armando (minutos) | `borrador` o `error` |
| `borrador` | PDF listo; WhatsApp al dueño con el enlace | "Aprobar" → `aprobado` · "Rehacer con nota" → `armando` |
| `aprobado` | Listo para mandarse (pieza 3) | — |
| `error` | Motivo a la vista; WhatsApp al dueño | "Reintentar" → `armando` |

- **Un solo armado a la vez por chequeo:** el paso a `armando` es un `update … where motor_estado in (…)`. Si no cambia
  ninguna fila, otro armado ya está corriendo y este no arranca.
- **La etapa del embudo no cambia** con el motor: sigue en `pedido` hasta que se entregue. `etapaDe()` muestra
  "Borrador listo" con `pedido` + `borrador` y "Listo para entregar" con `pedido` + `aprobado`. Esto reemplaza la regla de
  hoy, que se basa en `pdfPath`.
- **Bitácora:** un evento nuevo, `tipo = 'motor'` y `autor = 'improvement'` (o `'jose_carlos'` al aprobar o rehacer),
  con `detalle.accion` ∈ `en_fila · armado · rehecho · aprobado · error`. El armado guarda en `detalle` el uso de
  tokens, `costoUsd`, el `pdfPath` de ese borrador y, si lo hay, la `nota` del dueño. Así Improvement aprende qué cambia el
  dueño.
- **Los borradores no se pisan:** cada armado guarda su PDF en `chequeos/{id}/borrador-{n}.pdf`, y `pdfPath` apunta al
  último. Los anteriores quedan referidos en la bitácora.

## 3 · El cerebro

**Método escrito**, versionado en `apps/admin/lib/motor/metodo.js`, que exporta el texto y `METODO_VERSION`. Sale del
Chequeo de Boreal y de `principio-de-relacion.md`. Reglas:
1. Primero vive el negocio como cliente: cómo se reserva o se compra, qué precios se ven, qué está roto. Luego lo
   analiza como dueño.
2. Arranca por lo bueno y por su historia (la respuesta a "¿por qué empezaste?").
3. Cada número lleva **[dato]** o **[estimación]** con su supuesto. Nunca inventa cifras, testimonios ni datos que no
   vio.
4. Usa la lógica de su tipo de negocio: con local, ocupación × precio por franja; creador o en línea, audiencia y
   conversión; servicios, agenda y ticket.
5. Venta pull: sin urgencia, sin presión, sin agitar el dolor. Nada privado que no nos haya contado.
6. El "¿Lo platicamos?" invita a la **Plática** (sección 7). No cotiza ni vende el 360 en el documento.

**Entrada que arma el código** (no la IA):
- Datos del chequeo: tipo, negocio, giro, ciudad, canal, enlaces, `sinRedes`, respuestas y la nota del dueño si es
  propio.
- Señales de comportamiento ya calculadas: `entrevistaSegundos`, minutos entre el registro y la entrevista, y largo en
  palabras de cada respuesta.

**Salida** (validada con zod en `apps/admin/lib/motor/esquema.js`):

| Campo | Negocio | Emprendedor |
|---|---|---|
| `etapaProspecto` | `arrancando · creciendo · consolidado` | `idea` |
| `portada.dedicatoria` | Una o dos líneas para esa persona | igual |
| `porQue` | Por qué hicimos esto, con su historia | igual |
| `bueno` | Primero, lo bueno (lista) | Lo que te mueve (pregunta 1) |
| `patogenos` / `idea` | Lo que se ve desde afuera: `[{titulo, evidencia, costo, marca: dato\|estimacion, supuesto?}]` | Tu idea: viable o no, y qué le falta |
| `pastillas` / `pasos` | Lo que pueden hacer desde mañana | Tus primeros pasos, a tu medida (pregunta 3) |
| `noSeVe` / `siguienteNivel` | La parte que no se ve (lo que solo sale en un 360) | El siguiente nivel: Kit Arranque |
| `cierre` | ¿Lo platicamos? → la Plática | igual |
| `fuentes` | `[{url, que}]` de lo que leyó | igual |
| `notasInternas` | Cómo escribe, cuánto tardó, qué no pudo confirmar, el siguiente paso sugerido. **Solo en el panel, nunca en el PDF** | igual |

`etapaProspecto` elige la portada (sección 4). Si un emprendedor llega con algo distinto de `idea`, el esquema lo
rechaza.

**Llamada al modelo** (confirmado con la skill `claude-api` el 2026-10-05):
- Modelo `claude-opus-5-5` ($4 / $20 por millón de tokens), en una constante de configuración, nunca en el punto de
  llamada.
- `thinking: {type: "adaptive"}` y `output_config.effort: "high"`.
- Streaming con `finalMessage()` y `max_tokens: 64000`.
- Herramientas de servidor: `web_search_20260209` con `max_uses: 5` y `web_fetch_20260209` con `max_uses: 10`. Web
  fetch solo abre URLs que ya están en la conversación, es decir los enlaces y los resultados de búsqueda.
- `stop_reason: "pause_turn"`: se continúa la misma conversación, con un máximo de 3 continuaciones.
- `stop_reason: "refusal"`: termina en Error con el motivo. Se activa el `fallbacks: "default"` del servidor (beta
  `server-side-fallback-2026-07-01`), como recomienda la skill.
- **Riesgo a verificar en la tarea 1 del plan:** si `output_config.format` (salida estructurada) se puede combinar con
  las herramientas de servidor. Si no se puede, el modelo responde con JSON en texto y se valida igual con zod.
- La respuesta se valida con zod: **un reintento** si falla, luego Error. Nunca un ciclo.

## 4 · Plantilla y PDF

- **Una plantilla** (`apps/admin/lib/motor/plantilla.js`) hecha a partir de `chequeo-boreal.html`, con la skill
  marca-jotapuntoce:
  - monograma M2 en el encabezado;
  - Inter Tight para el texto y Bricolage Grotesque 800 en los títulos;
  - el hilo de 6 colores en los detalles.
  La IA solo llena el contenido; todo texto entra escapado.
- **4 portadas por etapa:** idea, arrancando, creciendo y consolidado. Cada una lleva el nombre de la persona y del
  negocio y la `dedicatoria`. Los 4 bocetos los diseña Claude con la skill de marca y **el dueño los aprueba antes de
  encender el motor**.
- **El PDF** sale de la plantilla con Chromium sin pantalla (`page.setContent` → `page.pdf`, A4, con fondos), la misma
  impresión del navegador con la que se hizo el de Boreal. Se sube al bucket privado `chequeos`, y el visor del panel lo
  muestra sin cambios.
- **Al publicar el admin:** el hosting debe poder correr Chromium. Se resuelve en la pieza "publicar el admin".

## 5 · Protección, errores y costo

- **Tope diario de armados automáticos:** `CHEQUEOS_MOTOR_TOPE_DIA`, por defecto 20. Se cuentan los eventos
  `motor/armado` de las últimas 24 horas. Si está lleno, el chequeo queda `en_fila` y llega un WhatsApp. Los armados que
  dispara el dueño a mano no cuentan para el tope.
- **Errores:** de red, del proveedor, de validación o del PDF. En todos los casos el estado pasa a `error`, se guarda
  `motor_error` en palabras simples, se escribe el evento `motor/error` y llega un WhatsApp. Nunca se lanza el error
  hacia el prospecto.
- **Un sitio que no abre o un negocio sin redes no es error:** es parte del análisis.
- **Costo:** cada armado guarda el uso que reporta el proveedor (input, output, caché y costo en USD) en el evento
  `motor/armado`. El tablero de Chequeos muestra **"Gastado en IA este mes"**.
  - **Desviación documentada:** no se usa la tabla `llm_calls`, porque su `org_id` es obligatorio y los prospectos no
    tienen organización.

## 6 · Código y datos

**Archivos nuevos en `apps/admin`:**

| Archivo | Para qué |
|---|---|
| `lib/ia.js` | **Único import de `@anthropic-ai/sdk` en `apps/admin`**: cliente, modelo, precios y la función `investigar()`, que hace la llamada con herramientas y el ciclo de `pause_turn` |
| `lib/motor/metodo.js` | El método (system prompt) versionado |
| `lib/motor/esquema.js` | El esquema zod de la salida |
| `lib/motor/plantilla.js` | El HTML del Chequeo y sus 4 portadas |
| `lib/motor/pdf.js` | HTML → PDF con Chromium |
| `lib/motor/armar.js` | `armarChequeo(id, {manual, nota})`: tope → `armando` → entrada → `investigar` → validar → plantilla → PDF → guardar → evento → aviso. También `aprobarChequeo(id)` |

- **Panel:** acciones en `app/chequeos/actions.js` (`armarAction`, `rehacerAction`, `aprobarAction`, `datosPropioAction`
  para enlaces y nota). La página del chequeo muestra estado, borrador, fuentes y notas internas.
- **API:** `app/api/chequeos/[id]/route.js` agrega el `after(() => armarChequeo(id))`.

**Esquema** (`packages/db/src/schema.ts`, luego `pnpm db:generate`):
- `chequeo`, columnas nuevas:
  - `motor_estado` (text, por defecto `sin_empezar`, con check);
  - `motor_error`;
  - `contenido` (jsonb);
  - `notas_internas` (jsonb);
  - `etapa_prospecto` (text, con check `idea, arrancando, creciendo, consolidado`);
  - `fuentes` (jsonb).
- `chequeo_evento_tipo_check` agrega `'motor'`.
- No hay tablas nuevas, así que la RLS sigue como está.

**Reglas del repo que se tocan:**
- `.claude/rules/ia-gateway.md` y la tabla del `CLAUDE.md` pasan de "un archivo en todo el repo" a **uno por app**:
  `apps/improvement/server/ai/gateway.ts` y `apps/admin/lib/ia.js`. El admin no puede importar de `apps/improvement`.
- **Dependencias nuevas en `apps/admin`:**
  - `@anthropic-ai/sdk`, la misma versión que ya usa improvement según `pnpm-lock.yaml`;
  - `playwright-core` + Chromium, para el PDF; ya está en el repo como herramienta de pruebas.
  La razón va en el commit.
- **Variables en `.env.example`:** `ANTHROPIC_API_KEY` (admin) y `CHEQUEOS_MOTOR_TOPE_DIA`.

## 7 · Decisiones del dueño que salieron aquí

- **Revisión:** el dueño aprueba al inicio; "mandar solo" se enciende cuando confíe en la calidad (pieza 3).
- **Lectura de redes a fondo:** va en el Diagnóstico 360, no en el Chequeo.
- **4 portadas por etapa** del prospecto, con el mensaje totalmente personalizado.
- **La Plática** (nivel 0.5 de la escalera): 20 a 60 minutos, presencial o en línea, **$20 USD**, solo sobre la
  persona, con un cuestionario empático. **Quien la paga es cliente.**
  - **Los $20 se abonan al Diagnóstico 360** (dueño, 2026-10-05): cumple la regla 2 de la escalera. Sigue las reglas
    de abono: sin caducidad, personal y congelado.
  - La Plática es una pieza propia, por diseñar: cuestionario, agenda, cobro y dónde se anotan las respuestas.

## 8 · Pruebas

- **Unitarias, sin red:**
  - el esquema acepta y rechaza bien (por ejemplo, emprendedor con etapa ≠ `idea`);
  - la plantilla escapa el texto y elige la portada correcta;
  - la entrada calcula bien las señales de comportamiento.
- **Integración contra el Supabase de desarrollo, con proveedor simulado:**
  - el ciclo completo `sin_empezar → armando → borrador → aprobado`;
  - error de validación → un reintento → `error`;
  - tope lleno → `en_fila`;
  - dos armados simultáneos → solo uno corre;
  - los borradores no se pisan.
  `investigar()` recibe el proveedor por parámetro, como el `SuggestionProvider` de improvement.
- **Prueba real manual, fuera del gate:** `pnpm --filter @jotapuntoce/admin motor:prueba <id>` arma el chequeo de
  Boreal con la API de verdad. Se compara contra el Chequeo hecho a mano. Si no llega a ese nivel, se ajusta el método
  antes de encender el disparo automático.

## 9 · Fuera de esta pieza

Envío por Gmail, página del regalo e interruptor "mandar solo" (pieza 3) · la Plática · lectura de redes con servicio
(Diagnóstico 360) · editor de texto del borrador · publicar el admin.
