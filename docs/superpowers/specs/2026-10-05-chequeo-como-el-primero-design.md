# Chequeo como el primero · diseño

**Fecha:** 2026-10-05 · **Estado:** aprobado en chat por el dueño (molde, conjugación, Instagram opción A).
**Extiende:** `2026-10-05-motor-chequeo-design.md`. Lo que aquí no se menciona sigue igual (estados, tope,
bitácora, botones, avisos).

## 1 · Por qué

El primer borrador que armó el motor (Boreal, 2026-10-05) salió "genérico, sin chiste, hecho sin amor" frente al
primer Chequeo hecho a mano (`Improvement\jotapuntoce\chequeos\chequeo-boreal.html`, 2026-09-28). Al revisar cómo
se hizo el primero, la diferencia no fue la redacción, sino la evidencia y el ejemplo:

| Pieza | Primer Chequeo | Motor v1 |
|---|---|---|
| Sitio | navegador real: cada enlace probado, vista de celular | solo texto (web_fetch) |
| Google | Maps cargado: 4.8 | la ficha no abre |
| Instagram | 32 posts con likes y comentarios (sesión del dueño) | sin cifras |
| Voz | escrita con toda la evidencia | método sin ejemplo |
| Molde | 6 páginas con línea guía, análisis y preguntas | piezas sueltas |

**Meta:** que cada Chequeo salga al nivel del primero, con datos reales, para cualquier prospecto.

## 2 · Flujo nuevo

```
armarChequeo
  1. recolectar(c)         → expediente (gratis: Chromium + API de Meta)
  2. investigar(METODO, mensajeDe(c, expediente))   → JSON (IA, con web_search para lo que falte)
  3. zod (un reintento) → plantilla → PDF → borrador
```

`chequeo.expediente` (jsonb nuevo) guarda lo recolectado con la fecha. "Rehacer con nota" reusa el expediente si
tiene menos de 7 días; si no, recolecta otra vez.

## 3 · El recolector (`apps/admin/lib/motor/recolector/`)

Código, no IA: lo que se puede medir se mide. Cada pieza devuelve `{ ok, data }` o `{ ok: false, motivo }`, y una
pieza que falla no detiene a las demás. El motivo llega a la IA, que lo anota en `notasInternas.sinConfirmar`.

**`sitio.js` — el sitio, como lo vería un cliente** (playwright-core, el Chromium que ya usa el PDF):
- Abre `enlaces.sitio` y las páginas internas del menú (máximo 12, mismo dominio).
- Por página: título, texto visible recortado (≤ 2,500 caracteres), precios encontrados (`$` + número) y frases de
  pendiente (`muy pronto`, `próximamente`, `pregunta en recepción`, `acércate a recepción`, `en construcción`).
- Por enlace del menú, del pie y de los íconos de redes: a dónde llega. Se marca **roto** si da error o 404, o si
  regresa al inicio cuando debería ir a otra página.
- **Celular:** abre el inicio a 390 × 844 y marca `seSaleDeLado` si `scrollWidth > innerWidth`.
- Tope de tiempo total: 60 s.

**`instagram.js` — sus publicaciones, por la API oficial de Meta (Business Discovery):**
- `GET graph.facebook.com/{META_IG_USER_ID}?fields=business_discovery.username(<usuario>){followers_count,media_count,biography,media.limit(50){caption,like_count,comments_count,timestamp,media_type,permalink}}`
  con `META_ACCESS_TOKEN`.
- El usuario sale de `enlaces.instagram`.
- Si la cuenta no es de negocio o de creador, o es privada, devuelve `{ ok: false, motivo }`.
- **Las cifras las calcula el código, no la IA:**
  - interacciones por post (likes + comentarios);
  - promedio e interacciones ÷ seguidores;
  - los 6 posts con más interacciones (texto recortado, fecha, tipo);
  - el promedio por mes;
  - el promedio por tipo (reel, carrusel o foto).
- Así cada número del Chequeo sobre Instagram es un **dato** con su fuente.

**Google:** sin recolector propio (scrapear Maps va contra sus reglas). La IA busca la calificación con
web_search; si no la ve, va a `sinConfirmar` y el dueño puede anotarla en la nota del propio. *Si hace falta
siempre, siguiente paso: Google Places API.*

## 4 · El método (`lib/motor/metodo.js`, `METODO_VERSION` sube a `2026-10-05.2`)

- Se agrega el **primer Chequeo de Boreal como ejemplo de forma** (`lib/motor/ejemplo-boreal.md`, el texto del PDF
  original). Instrucción: "copia la forma, el tono y el nivel de análisis; nunca sus datos". Va en el system
  prompt, que ya se manda con caché.
- Reglas nuevas de voz, tomadas del primero:
  - **lo bueno abre felicitando con datos** ("llegar a 4.8 en cinco meses no es suerte");
  - analiza lo que más conecta con su gente;
  - **amarra el patrón a sus propias palabras** (bio, valores, textos del sitio);
  - cada síntoma lleva **lo que vimos** y **por qué importa**;
  - "ninguno es grave, pero juntos cuestan";
  - las recetas son una por síntoma, sin costo, y "la mayoría en una tarde".
- `trato`: "tu" si es una persona y "ustedes" si son socios o un equipo.
- El mensaje del usuario lleva el **expediente** completo y marca qué piezas fallaron.

## 5 · El esquema (`lib/motor/esquema.js`)

`guia = { texto, mano }` es la línea con la que abre cada sección; `mano` es la frase en letra a mano, y se pinta
como `texto <mano>`.

Común a los dos tipos:

```
trato: "tu" | "ustedes"
portada: { dedicatoria }                        (solo en la portada; ya no se repite)
cierre                                          (texto de "¿Lo platicamos?")
fuentes: [{ url (http/https), que }]
notasInternas: { comoEscribe, tiempo, sinConfirmar[], siguientePaso }
```

Negocio:

```
bueno:    { guia, felicitacion: [texto] (1–3, con datos),
            conecta?: { titulo, items: [{ que, valor }] (≤ 6) },   ← solo con cifras reales
            patron }
sintomas: { guia, items: [{ titulo, vimos, importa, marca: dato|estimacion, supuesto? }] (1–5) }
recetas:  { guia, items: [{ titulo, como }] (1–5), dimensionar?: { texto, supuesto } }
noSeVe:   { guia, intro, preguntas: [texto] (3–5) }
```

Emprendedor (misma forma, otras piezas):

```
bueno: { guia, felicitacion[], patron }         ("lo que te mueve")
idea:  { guia, viable, porque, leFalta[] }
pasos: { guia, items: [{ titulo, como }] (1–7) }
siguienteNivel: { guia, texto }                 (Kit Arranque)
```

`porQue` desaparece: la página 2 es texto fijo del dueño (sección 6).

## 6 · La plantilla (`lib/motor/plantilla.js`), página por página

1. **Portada** (aprobada en `e42bd81`): boceto, frase a mano señalándolo y bloque amarillo con título, "Preparado
   para" y dedicatoria.
2. **¿Por qué hice esto?** El texto fijo del dueño, conjugado por `trato` y por tipo:

   > Revisé **{Negocio}** porque mi objetivo es ayudar a los dueños y emprendedores a que la visión que tuvieron se
   > cumpla. Ayudar está en mi gen: es mi propósito y lo que me gusta hacer.
   >
   > Primero vi **{Negocio}** como lo vería un prospecto que los descubre hoy, analizando todo lo que se ve desde
   > afuera, y me encantaría verlo desde adentro. **Tu negocio tiene el potencial que le viste** al inicio. Yo
   > también lo veo, y quiero que ese potencial de verdad explote, porque me reflejo en **tu negocio**.

   - Con `ustedes`: "Su negocio tiene el potencial que le vieron… me reflejo en su negocio."
   - Emprendedor: "tu idea" en lugar del nombre y de "tu negocio".
   - Firma: "Con gusto, / **Jose Carlos Salinas** · JotaPuntoCe".
3. **Primero, lo bueno:** guía, felicitación, "Lo que más conecta con su gente" (lista con cifra a la derecha, si
   hay `conecta`) y el patrón.
4. **Lo que se ve desde afuera:** guía y síntomas numerados con "Lo que vimos" / "Por qué importa" y la marca
   (dato o estimación, con su supuesto).
5. **Lo que pueden hacer desde mañana:** guía, recetas numeradas y "Para dimensionar" al pie.
6. **La parte que no se ve:** guía, intro, las preguntas y el bloque amarillo "¿Lo platicamos?" con `cierre` y la
   línea de contacto (WhatsApp 444 849 6561 · salinas@jotapuntoce.com).

En el emprendedor, las páginas 3 a 6 son: lo que te mueve, tu idea, tus primeros pasos y el siguiente nivel.

## 7 · Datos y variables

- Columna `chequeo.expediente` (jsonb), con migración generada.
- Variables nuevas que agrega el dueño en `.env.local` y en `.env.example`:
  - `META_IG_USER_ID`: id de la cuenta de Instagram de negocio de JotaPuntoCe;
  - `META_ACCESS_TOKEN`: token de larga duración.
- Sin `META_*`, el recolector salta Instagram (`motivo: "sin configurar"`) y todo lo demás funciona.

## 8 · Pruebas

- `recolector/sitio`: una página local de prueba, servida desde un HTML en la prueba con `page.route`, con
  - un enlace roto,
  - un enlace que regresa al inicio,
  - un "muy pronto",
  - un precio,
  - un ancho que se sale en celular.

  Se verifica que todo eso aparezca en el expediente. No sale a internet.
- `recolector/instagram`: `fetch` inyectado con una respuesta de muestra de Business Discovery, para verificar los
  cálculos (promedio, tasa, top 6, por mes, por tipo) y los errores (cuenta personal, sin configurar).
- Esquema y plantilla: las muestras nuevas pasan, `trato` conjuga la página 2, no se repite la dedicatoria y se
  pinta la guía con su frase a mano.
- Orquestador: el expediente se guarda y se reusa al rehacer.

## 9 · Validación con Boreal (sin API)

1. Corre el recolector real sobre Boreal (gratis).
2. Con ese expediente, Claude en esta sesión escribe el contenido con el método nuevo, sin mirar el original, y
   pasa por el motor real.
3. Se compara página por página contra `Chequeo-Boreal.pdf`. Sin Meta configurado todavía, Instagram queda "sin
   confirmar" en esta pasada; se repite cuando el dueño tenga el token.

## 10 · Lo que hace el dueño en Meta (una tarde)

1. Instagram de JotaPuntoCe como cuenta **profesional** (negocio o creador), vinculada a una **página de Facebook**
   de la que él es administrador.
2. En developers.facebook.com: crear una app de tipo "Business" con el producto **Instagram (con inicio de sesión
   de Facebook)**.
3. En el Explorador de la API Graph: token con `instagram_basic`, `pages_show_list`, `pages_read_engagement` y
   `business_management`. Cambiarlo por uno de larga duración.
4. Obtener el id de su cuenta de Instagram: `GET /me/accounts` → página → `instagram_business_account`.
5. Pegar `META_IG_USER_ID` y `META_ACCESS_TOKEN` en `apps/admin/.env.local`.

En modo desarrollo, con su propia cuenta como administrador, normalmente no hace falta la revisión de Meta. Si Meta
la pidiera, se ve en ese momento.

## Fuera de este diseño

Google Places API, TikTok y YouTube, y renovar el token de Meta en automático (dura unos 60 días; por ahora el
panel avisa cuando falla).
