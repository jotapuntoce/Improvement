# Motor del Chequeo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Improvement arme solo el borrador del Chequeo (PDF con la marca) a partir de la entrevista y lo que se ve
libre desde afuera, y que el dueño lo revise, lo rehaga con una nota o lo apruebe desde el panel.

**Architecture:** Una llamada a Claude Opus 5.5 con `web_search`/`web_fetch` de servidor (`lib/ia.js`, único import del
SDK en admin) recibe el método (`lib/motor/metodo.js`) y los datos del chequeo, y devuelve JSON que valida zod
(`lib/motor/esquema.js`). `lib/motor/plantilla.js` lo vuelve HTML de marca y `lib/motor/pdf.js` lo imprime con Chromium.
`lib/motor/armar.js` orquesta estados, tope, bitácora, Storage y avisos. Se dispara con `after()` desde la API (detrás de
`CHEQUEOS_MOTOR_AUTO=1`) o con botones del panel.

**Tech Stack:** Next.js 16 App Router (JS), Drizzle 0.45 / Postgres (Supabase), zod 4.5.4, `@anthropic-ai/sdk` 0.122.0,
`playwright-core` 1.62.1, Supabase Storage, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-10-05-motor-chequeo-design.md` (más el del inventario,
`2026-10-02-inventario-chequeos-design.md`).

## Global Constraints

- Gate: `pnpm lint && pnpm typecheck && pnpm test` en verde antes de dar una tarea por hecha.
- Imports relativos con extensión explícita (`./armar.js`). El alias `@/` → `apps/admin/` solo en `app/**`.
- Nunca editar a mano una migración: `schema.ts` → `pnpm db:generate` → `pnpm db:migrate`.
- `@anthropic-ai/sdk` se importa **solo** en `apps/admin/lib/ia.js` (y en `apps/improvement/server/ai/gateway.ts`).
- Modelo `claude-opus-5-5` en la constante `MODELO` de `lib/ia.js`, nunca en otro lado. Precio: $4 / $20 por millón de
  tokens (entrada / salida), lectura de caché $0.20 y escritura $5. Confirmado con la skill `claude-api` el 2026-10-05.
- Herramientas: `web_search_20260209` (`max_uses: 5`) y `web_fetch_20260209` (`max_uses: 10`). `thinking: {type:
  "adaptive"}`, `output_config.effort: "high"` y streaming con `finalMessage()`.
- La respuesta del modelo se valida con zod: un reintento y luego `error`. Nunca un ciclo.
- Errores como resultados tipados `{ ok: true, data } | { ok: false, error: { code, mensaje? } }`. `armarChequeo` nunca
  lanza.
- Las pruebas **nunca** llaman a la API de Anthropic: `investigar` y `aPdf` se inyectan con `deps`.
- Plantilla del PDF: solo tokens de `packages/ui/src/tokens.css` (se incrustan en el HTML), ningún hex nuevo. Firma:
  monograma M2. Inter Tight para el texto, Bricolage Grotesque 800 en los títulos, Caveat 700 en ámbar para la frase a
  mano.
- Venta pull en todo texto: sin urgencia ni presión. Sin cifras inventadas.
- Las pruebas de integración corren contra el Supabase de desarrollo (`apps/admin/.env.test`) y limpian sus filas y sus
  archivos.
- Dependencia nueva solo con su razón en el mensaje del commit.

## Archivos

| Archivo | Responsabilidad |
|---|---|
| `packages/db/src/schema.ts` | columnas del motor en `chequeo` y evento `motor` |
| `apps/admin/lib/chequeoDatos.js` | `MOTOR_ESTADO_LABEL`, `ETAPAS_PROSPECTO`, `datosPropioSchema`, `etapaDe` nuevo |
| `apps/admin/lib/motor/esquema.js` | zod de la salida del modelo (`contenidoSchema`) |
| `apps/admin/lib/motor/muestra.js` | chequeo y contenido de muestra (pruebas y vista previa de portadas) |
| `apps/admin/lib/ia.js` | cliente Anthropic, `investigar`, `extraerJson`, `costoUsd`, `MODELO` |
| `apps/admin/lib/motor/metodo.js` | `METODO`, `METODO_VERSION`, `senales`, `mensajeDe` |
| `apps/admin/lib/motor/plantilla.js` | `htmlChequeo`, `PORTADAS` |
| `apps/admin/public/brand/monograma-m2-marino.svg` | firma del PDF (copiada del kit de marca) |
| `apps/admin/lib/motor/pdf.js` | `aPdf(html)` con Chromium |
| `apps/admin/lib/motor/armar.js` | `armarChequeo`, `aprobarChequeo`, `gastoDelMes` |
| `apps/admin/lib/chequeos.js` | exporta `panelUrl`, `quien`, `subirPdf`; `guardarDatosPropio` |
| `apps/admin/app/api/chequeos/[id]/route.js` | `after(() => armarChequeo(id))` |
| `apps/admin/app/chequeos/actions.js` | `armarAction`, `rehacerAction`, `aprobarAction`, `datosPropioAction` |
| `apps/admin/app/chequeos/[id]/page.js` | estado del motor, botones, fuentes, notas internas, datos del propio |
| `apps/admin/app/chequeos/page.js` | stat "Gastado en IA (mes)" |
| `apps/admin/app/chequeos/muestra/route.js` | vista previa HTML de las 4 portadas para que el dueño las apruebe |
| `.claude/rules/ia-gateway.md`, `CLAUDE.md` | la regla pasa a "un gateway por app" |

---

### Task 1: Datos del motor

**Files:**
- Modify: `packages/db/src/schema.ts` (tabla `chequeo` ~líneas 740-795, `chequeoEvento` ~811)
- Generate: `packages/db/migrations/0024_*.sql`
- Modify: `apps/admin/lib/chequeoDatos.js`
- Test: `apps/admin/tests/chequeoDatos.test.js`

**Interfaces:**
- Produces: columnas Drizzle `chequeo.motorEstado` (text, default `"sin_empezar"`), `motorError`, `contenido`,
  `notasInternas`, `etapaProspecto`, `fuentes`. Evento `tipo: "motor"`.
- Produces (`chequeoDatos.js`): `MOTOR_ESTADOS`, `MOTOR_ESTADO_LABEL`, `ETAPAS_PROSPECTO`, `ETAPA_PROSPECTO_LABEL`,
  `MOTOR_ACCION_LABEL`, `datosPropioSchema` (`{ enlaces, nota }`) y el `etapaDe(c)` nuevo.

- [ ] **Step 1: Write the failing tests** — al final de `apps/admin/tests/chequeoDatos.test.js` (agrega `etapaDe` y
  `datosPropioSchema` al import de `../lib/chequeoDatos.js`):

```js
describe("motor", () => {
  it("etapaDe distingue borrador, aprobado y PDF subido a mano", () => {
    expect(etapaDe({ etapa: "pedido", motorEstado: "borrador" })).toBe("Borrador listo");
    expect(etapaDe({ etapa: "pedido", motorEstado: "aprobado" })).toBe("Listo para entregar");
    expect(etapaDe({ etapa: "pedido", motorEstado: "sin_empezar", pdfPath: "x/1.pdf" })).toBe("Listo para entregar");
    expect(etapaDe({ etapa: "pedido", motorEstado: "armando" })).toBe("Pedido");
    expect(etapaDe({ etapa: "contacto", motorEstado: "aprobado" })).toBe("Contacto");
  });

  it("datosPropioSchema ignora enlaces vacíos y valida los llenos", () => {
    const r = datosPropioSchema.parse({ enlaces: { instagram: "", sitio: "https://borealslp.com" }, nota: "  " });
    expect(r).toEqual({ enlaces: { sitio: "https://borealslp.com" }, nota: null });
    expect(datosPropioSchema.safeParse({ enlaces: { sitio: "borealslp" } }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @jotapuntoce/admin exec vitest run tests/chequeoDatos.test.js`
Expected: FAIL (`datosPropioSchema` no existe, `etapaDe` devuelve "Pedido" con borrador).

- [ ] **Step 3: Schema.** En `packages/db/src/schema.ts`, dentro de `chequeo`, justo después de `pdfPath`:

```ts
    // Motor del Chequeo (spec 2026-10-05-motor-chequeo-design.md). `contenido` es lo que valida
    // apps/admin/lib/motor/esquema.js sin notas internas ni fuentes, que van aparte.
    motorEstado: text("motor_estado").notNull().default("sin_empezar"),
    motorError: text("motor_error"),
    contenido: jsonb("contenido"),
    notasInternas: jsonb("notas_internas"),
    etapaProspecto: text("etapa_prospecto"),
    fuentes: jsonb("fuentes"),
```

Y en la lista de checks de `chequeo`, después de `chequeo_etapa_check`:

```ts
    check(
      "chequeo_motor_estado_check",
      sql`${t.motorEstado} in ('sin_empezar','en_fila','armando','borrador','aprobado','error')`,
    ),
    check("chequeo_etapa_prospecto_check", sql`${t.etapaProspecto} in ('idea','arrancando','creciendo','consolidado')`),
```

En `chequeo_evento_tipo_check` agrega `'motor'`:

```ts
      sql`${t.tipo} in ('registro','entrevista','etapa','correo','mensaje','llamada','nota','compra','motor')`,
```

- [ ] **Step 4: Generate and apply the migration**

Run: `pnpm db:generate` → Expected: `migrations\0024_<nombre>.sql` con 6 `ADD COLUMN` y los checks.
Run: `pnpm db:migrate` → Expected: `migrations applied successfully!`

- [ ] **Step 5: `chequeoDatos.js`.** Después de `RESULTADO_LABEL`, agrega:

```js
export const MOTOR_ESTADOS = ["sin_empezar", "en_fila", "armando", "borrador", "aprobado", "error"];
export const MOTOR_ESTADO_LABEL = {
  sin_empezar: "Sin armar",
  en_fila: "En fila (tope del día)",
  armando: "Armando…",
  borrador: "Borrador listo",
  aprobado: "Aprobado",
  error: "Error",
};
export const MOTOR_ACCION_LABEL = {
  en_fila: "quedó en fila",
  armado: "armó el borrador",
  rehecho: "rehizo el borrador",
  aprobado: "aprobó el borrador",
  error: "falló al armar",
};
// La etapa del prospecto elige la portada del PDF (spec del motor, sección 4).
export const ETAPAS_PROSPECTO = ["idea", "arrancando", "creciendo", "consolidado"];
export const ETAPA_PROSPECTO_LABEL = {
  idea: "Con una idea",
  arrancando: "Arrancando",
  creciendo: "Creciendo",
  consolidado: "Consolidado",
};
```

Después de `contactoSchema`:

```js
/** Enlaces y nota de contexto que Jose Carlos le da a un chequeo propio antes de armarlo. */
export const datosPropioSchema = z.object({
  enlaces: z
    .record(z.string(), z.string().trim())
    .default({})
    .transform((e) => Object.fromEntries(Object.entries(e).filter(([, v]) => v)))
    .pipe(z.partialRecord(z.enum(ENLACES), z.url("Enlace inválido"))),
  nota: opcional,
});
```

Reemplaza `etapaDe`:

```js
/** Etapa visible: un `pedido` con borrador del motor, aprobado o con PDF subido a mano. */
export const etapaDe = (c) => {
  if (c.etapa !== "pedido") return ETAPA_LABEL[c.etapa];
  if (c.motorEstado === "borrador") return "Borrador listo";
  if (c.motorEstado === "aprobado" || (c.pdfPath && (c.motorEstado ?? "sin_empezar") === "sin_empezar")) {
    return "Listo para entregar";
  }
  return ETAPA_LABEL.pedido;
};
```

- [ ] **Step 6: Run the tests** — `pnpm --filter @jotapuntoce/admin exec vitest run tests/chequeoDatos.test.js` →
  PASS. Luego `pnpm --filter @jotapuntoce/admin test` → PASS (chequeos.test.js sigue verde con las columnas nuevas).

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/schema.ts packages/db/migrations apps/admin/lib/chequeoDatos.js apps/admin/tests/chequeoDatos.test.js
git commit -m "feat(db): columnas del motor del Chequeo y evento motor"
```

---

### Task 2: Esquema de la salida y la muestra

**Files:**
- Create: `apps/admin/lib/motor/esquema.js`
- Create: `apps/admin/lib/motor/muestra.js`
- Test: `apps/admin/tests/motor-esquema.test.js`

**Interfaces:**
- Produces: `contenidoSchema` (unión discriminada por `tipo`), `contenidoNegocio`, `contenidoEmprendedor`.
- Produces (`muestra.js`): `CHEQUEO_MUESTRA` (fila tipo `chequeo` de negocio), `EMPRENDEDOR_MUESTRA`,
  `contenidoMuestra(etapa)`, que devuelve contenido válido (negocio si `etapa !== "idea"`).

- [ ] **Step 1: Write the failing test** `apps/admin/tests/motor-esquema.test.js`:

```js
import { describe, expect, it } from "vitest";
import { contenidoSchema } from "../lib/motor/esquema.js";
import { contenidoMuestra } from "../lib/motor/muestra.js";

describe("contenidoSchema", () => {
  it("acepta la muestra de negocio y la de emprendedor", () => {
    expect(contenidoSchema.safeParse(contenidoMuestra("creciendo")).success).toBe(true);
    expect(contenidoSchema.safeParse(contenidoMuestra("idea")).success).toBe(true);
  });

  it("un emprendedor solo puede ser etapa idea; un negocio nunca", () => {
    expect(contenidoSchema.safeParse({ ...contenidoMuestra("idea"), etapaProspecto: "creciendo" }).success).toBe(false);
    expect(contenidoSchema.safeParse({ ...contenidoMuestra("creciendo"), etapaProspecto: "idea" }).success).toBe(false);
  });

  it("una estimación sin supuesto no pasa", () => {
    const k = contenidoMuestra("creciendo");
    k.patogenos[0] = { ...k.patogenos[0], marca: "estimacion", supuesto: undefined };
    expect(contenidoSchema.safeParse(k).success).toBe(false);
  });

  it("faltan piezas → no pasa", () => {
    const { pastillas, ...sinPastillas } = contenidoMuestra("creciendo");
    expect(pastillas.length).toBeGreaterThan(0);
    expect(contenidoSchema.safeParse(sinPastillas).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @jotapuntoce/admin exec vitest run tests/motor-esquema.test.js`
  → FAIL (no existen los módulos).

- [ ] **Step 3: `apps/admin/lib/motor/esquema.js`**

```js
// Lo que el modelo tiene que devolver para que exista un Chequeo. Si no pasa, el motor reintenta una vez y luego marca
// error (spec 2026-10-05-motor-chequeo-design.md, sección 3). Los textos se ven en el PDF tal cual.
import { z } from "zod";

const texto = z.string().trim().min(1);
const lista = z.array(texto).min(1).max(6);
const accion = z.object({ titulo: texto, como: texto });

const patogeno = z
  .object({
    titulo: texto,
    evidencia: texto,
    costo: texto,
    marca: z.enum(["dato", "estimacion"]),
    supuesto: z.string().trim().optional(),
  })
  .refine((p) => p.marca === "dato" || p.supuesto, { path: ["supuesto"], message: "Una estimación lleva su supuesto" });

const comun = {
  portada: z.object({ dedicatoria: texto }),
  porQue: texto,
  bueno: lista,
  cierre: texto,
  fuentes: z.array(z.object({ url: texto, que: texto })).default([]),
  notasInternas: z.object({
    comoEscribe: texto,
    tiempo: texto,
    sinConfirmar: z.array(texto).default([]),
    siguientePaso: texto,
  }),
};

export const contenidoNegocio = z.object({
  tipo: z.literal("negocio"),
  etapaProspecto: z.enum(["arrancando", "creciendo", "consolidado"]),
  ...comun,
  patogenos: z.array(patogeno).min(1).max(6),
  pastillas: z.array(accion).min(1).max(6),
  noSeVe: texto,
});

export const contenidoEmprendedor = z.object({
  tipo: z.literal("emprendedor"),
  etapaProspecto: z.literal("idea"),
  ...comun,
  idea: z.object({ viable: z.boolean(), porque: texto, leFalta: lista }),
  pasos: z.array(accion).min(1).max(7),
  siguienteNivel: texto,
});

export const contenidoSchema = z.discriminatedUnion("tipo", [contenidoNegocio, contenidoEmprendedor]);
```

- [ ] **Step 4: `apps/admin/lib/motor/muestra.js`**

```js
// Datos de muestra del motor: los usan las pruebas y la vista previa de portadas (app/chequeos/muestra). No es un
// cliente real: es un negocio inventado para ver la plantilla llena.
export const CHEQUEO_MUESTRA = {
  id: "00000000-0000-4000-8000-000000000000",
  origen: "landing",
  tipo: "negocio",
  nombre: "Ana López",
  negocio: "Café Ejemplo",
  giro: "cafetería de especialidad",
  ciudad: "San Luis Potosí",
  canal: "reel",
  canalDetalle: null,
  enlaces: { sitio: "https://ejemplo.com" },
  sinRedes: false,
  respuestas: [
    { pregunta: "¿Por qué empezaste tu negocio? Cuéntanos un poco de tu historia.", respuesta: "Por mi abuela, que tostaba café en casa." },
    { pregunta: "¿Qué parte de tu negocio te gustaría que caminara sin ti?", respuesta: "Los pedidos y el inventario." },
    { pregunta: "¿Qué quieres que tu negocio haga por tu vida?", respuesta: "Darme tiempo con mis hijos." },
  ],
  entrevistaSegundos: 420,
  createdAt: new Date("2026-10-05T15:00:00Z"),
  entrevistaAt: new Date("2026-10-05T15:20:00Z"),
  notas: null,
  abrePuerta: null,
};

export const EMPRENDEDOR_MUESTRA = {
  ...CHEQUEO_MUESTRA,
  id: "00000000-0000-4000-8000-000000000001",
  tipo: "emprendedor",
  negocio: null,
  giro: "repostería saludable",
  respuestas: [
    { pregunta: "¿A qué te gustaría dedicarte el resto de tu vida?", respuesta: "A hornear y enseñar a comer rico sin culpa." },
    { pregunta: "Cuéntanos tu idea", respuesta: "Pasteles sin azúcar para gente con diabetes, por pedido." },
    { pregunta: "¿Con qué cuentas hoy para arrancar?", respuesta: "Mis fines de semana y un horno." },
  ],
};

const comun = {
  portada: { dedicatoria: "Para Ana, que convirtió el café de su abuela en un lugar al que la gente quiere volver." },
  porQue: "Revisamos tu negocio como lo vería un cliente nuevo: tu sitio, tu ficha de Google y lo que contaste.",
  bueno: ["La historia de tu abuela le da alma a la marca.", "4.7 en Google [dato]."],
  cierre: "Si te late, platicamos de 20 a 60 minutos sobre ti: qué buscas y a dónde quieres llegar.",
  fuentes: [{ url: "https://ejemplo.com", que: "Sitio web" }],
  notasInternas: {
    comoEscribe: "Respuestas cortas pero cálidas.",
    tiempo: "Contestó el mismo día, en 7 minutos.",
    sinConfirmar: ["Ventas por día"],
    siguientePaso: "Mensaje mencionando a su abuela.",
  },
};

export function contenidoMuestra(etapa = "creciendo") {
  if (etapa === "idea") {
    return {
      tipo: "emprendedor",
      etapaProspecto: "idea",
      ...structuredClone(comun),
      idea: { viable: true, porque: "Hay demanda local de postres sin azúcar.", leFalta: ["Saber cuánto cobrar", "Un primer canal de pedidos"] },
      pasos: [{ titulo: "Hornea 3 recetas de prueba", como: "Regálalas a 10 personas y anota qué dicen." }],
      siguienteNivel: "El Kit Arranque te da las plantillas para ordenar pedidos y números desde el día uno.",
    };
  }
  return {
    tipo: "negocio",
    etapaProspecto: etapa,
    ...structuredClone(comun),
    patogenos: [
      { titulo: "El menú no tiene precios en línea", evidencia: "La página /menu solo dice 'Pregunta en barra' [dato].", costo: "Quien no ve precio se va.", marca: "dato" },
      { titulo: "Tardes vacías", evidencia: "Google marca poca afluencia de 16 a 18 h.", costo: "≈ $3,000 por semana.", marca: "estimacion", supuesto: "10 cafés de $60 por día hábil" },
    ],
    pastillas: [{ titulo: "Pon los precios en tu sitio", como: "Una foto del menú en la página de inicio." }],
    noSeVe: "Cuánto deja cada producto y cómo se reparten el trabajo: eso solo se ve por dentro.",
  };
}
```

- [ ] **Step 5: Run** — `pnpm --filter @jotapuntoce/admin exec vitest run tests/motor-esquema.test.js` → PASS (4).

- [ ] **Step 6: Commit**

```bash
git add apps/admin/lib/motor/esquema.js apps/admin/lib/motor/muestra.js apps/admin/tests/motor-esquema.test.js
git commit -m "feat(admin): esquema zod del Chequeo que arma el motor"
```

---

### Task 3: Gateway de IA del admin

**Files:**
- Modify: `apps/admin/package.json` (vía `pnpm add`)
- Create: `apps/admin/lib/ia.js`
- Modify: `.claude/rules/ia-gateway.md`, `CLAUDE.md:94`
- Test: `apps/admin/tests/ia.test.js`

**Interfaces:**
- Produces: `MODELO` (string), `costoUsd(uso) → number`, `extraerJson(texto) → object|null`,
  `investigar({ sistema, mensajes }, { anthropic }?) → Promise<{ ok: true, data: { texto, mensajes, modelo }, uso } |
  { ok: false, error: { code, mensaje }, uso }>`, con
  `uso = { input, output, cacheRead, cacheWrite, busquedas, paginas }`. `mensajes` es un arreglo de
  `{ role, content }` (formato de la API).

- [ ] **Step 1: Add the dependency**

Run: `pnpm --filter @jotapuntoce/admin add @anthropic-ai/sdk@0.122.0`
Expected: `apps/admin/package.json` lista `"@anthropic-ai/sdk": "0.122.0"` (la misma versión que ya usa improvement en
`pnpm-lock.yaml`).

- [ ] **Step 2: Write the failing test** `apps/admin/tests/ia.test.js`:

```js
import { describe, expect, it } from "vitest";
import { costoUsd, extraerJson, investigar } from "../lib/ia.js";

const respuesta = (stop_reason, content, extra = {}) => ({
  stop_reason,
  content,
  model: "claude-opus-5-5",
  usage: { input_tokens: 1000, output_tokens: 500, server_tool_use: { web_search_requests: 1, web_fetch_requests: 2 } },
  ...extra,
});
const falso = (...respuestas) => {
  const llamadas = [];
  return {
    llamadas,
    beta: {
      messages: {
        stream: (params) => {
          llamadas.push(structuredClone(params));
          const r = respuestas.shift();
          return { finalMessage: async () => r };
        },
      },
    },
  };
};

describe("ia", () => {
  it("extraerJson tolera cercas de código y texto alrededor", () => {
    expect(extraerJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extraerJson('Listo: {"a":{"b":2}} gracias')).toEqual({ a: { b: 2 } });
    expect(extraerJson("sin json")).toBeNull();
  });

  it("costoUsd usa el precio de Opus 5.5", () => {
    expect(costoUsd({ input: 1_000_000, output: 1_000_000, cacheRead: 0, cacheWrite: 0 })).toBe(24);
  });

  it("continúa en pause_turn y suma el uso de cada vuelta", async () => {
    const a = falso(
      respuesta("pause_turn", [{ type: "server_tool_use", id: "s1", name: "web_search", input: {} }]),
      respuesta("end_turn", [{ type: "text", text: "pensando" }, { type: "text", text: '{"ok":1}' }]),
    );
    const r = await investigar({ sistema: "S", mensajes: [{ role: "user", content: "hola" }] }, { anthropic: a });
    expect(r.ok).toBe(true);
    expect(r.data.texto).toBe('{"ok":1}');
    expect(r.uso).toMatchObject({ input: 2000, output: 1000, busquedas: 2, paginas: 4 });
    expect(a.llamadas[1].messages.at(-1).role).toBe("assistant"); // la vuelta 2 lleva lo que pausó
  });

  it("refusal y max_tokens son errores tipados", async () => {
    const r1 = await investigar({ sistema: "S", mensajes: [] }, { anthropic: falso(respuesta("refusal", [], { stop_details: { category: "cyber" } })) });
    expect(r1.error.code).toBe("RECHAZO");
    const r2 = await investigar({ sistema: "S", mensajes: [] }, { anthropic: falso(respuesta("max_tokens", [])) });
    expect(r2.error.code).toBe("MUY_LARGO");
  });

  it("una excepción del proveedor no se lanza", async () => {
    const a = { beta: { messages: { stream: () => ({ finalMessage: async () => { throw new Error("red"); } }) } } };
    const r = await investigar({ sistema: "S", mensajes: [] }, { anthropic: a });
    expect(r).toMatchObject({ ok: false, error: { code: "PROVEEDOR" } });
  });
});
```

- [ ] **Step 3: Run to verify it fails** — `pnpm --filter @jotapuntoce/admin exec vitest run tests/ia.test.js` → FAIL.

- [ ] **Step 4: `apps/admin/lib/ia.js`**

```js
// Único import de @anthropic-ai/sdk en apps/admin (regla .claude/rules/ia-gateway.md: un gateway por app; admin no
// puede importar de apps/improvement). Server-only. Spec: docs/superpowers/specs/2026-10-05-motor-chequeo-design.md.
import Anthropic from "@anthropic-ai/sdk";

// Confirmado con la skill claude-api el 2026-10-05: claude-opus-5-5, $4 / $20 por millón de tokens de entrada /
// salida, lectura de caché $0.20, escritura $5 (1.25× la entrada). Nunca escribir el id en otro lado.
export const MODELO = "claude-opus-5-5";
const PRECIO = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 };
const HERRAMIENTAS = [
  { type: "web_search_20260209", name: "web_search", max_uses: 5, user_location: { type: "approximate", country: "MX" } },
  { type: "web_fetch_20260209", name: "web_fetch", max_uses: 10 },
];
const MAX_CONTINUACIONES = 3;

let cliente;
const elCliente = () => (cliente ??= new Anthropic()); // ANTHROPIC_API_KEY del entorno

/** Dólares a partir del uso que reporta el proveedor (las búsquedas web se cobran aparte y solo se cuentan). */
export const costoUsd = (u) =>
  Math.round(((u.input * PRECIO.input + u.output * PRECIO.output + u.cacheRead * PRECIO.cacheRead + u.cacheWrite * PRECIO.cacheWrite) / 1e6) * 1e6) / 1e6;

function sumarUso(uso, u = {}) {
  uso.input += u.input_tokens ?? 0;
  uso.output += u.output_tokens ?? 0;
  uso.cacheRead += u.cache_read_input_tokens ?? 0;
  uso.cacheWrite += u.cache_creation_input_tokens ?? 0;
  uso.busquedas += u.server_tool_use?.web_search_requests ?? 0;
  uso.paginas += u.server_tool_use?.web_fetch_requests ?? 0;
}

/** El primer objeto JSON del texto, aunque venga entre cercas de código o con una frase alrededor. */
export function extraerJson(texto) {
  const ini = texto.indexOf("{");
  const fin = texto.lastIndexOf("}");
  if (ini < 0 || fin < ini) return null;
  try {
    return JSON.parse(texto.slice(ini, fin + 1));
  } catch {
    return null;
  }
}

function mensajeDeError(e) {
  if (e instanceof Anthropic.AuthenticationError) return "Falta o es inválida la ANTHROPIC_API_KEY del panel.";
  if (e instanceof Anthropic.RateLimitError) return "La IA está saturada; reintenta en unos minutos.";
  if (e instanceof Anthropic.APIError) return `La IA respondió ${e.status}: ${e.message}`;
  return `No se pudo llamar a la IA: ${e?.message ?? e}`;
}

/**
 * Una investigación con búsqueda y lectura web del lado de Anthropic. Sigue en `pause_turn` (hasta 3 veces) y devuelve
 * el último bloque de texto. Nunca lanza. `anthropic` se inyecta en pruebas.
 */
export async function investigar({ sistema, mensajes }, { anthropic } = {}) {
  const messages = [...mensajes];
  const uso = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, busquedas: 0, paginas: 0 };
  try {
    const api = anthropic ?? elCliente();
    for (let vuelta = 0; vuelta <= MAX_CONTINUACIONES; vuelta++) {
      const r = await api.beta.messages
        .stream({
          model: MODELO,
          max_tokens: 64000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          thinking: { type: "adaptive" },
          output_config: { effort: "high" },
          system: [{ type: "text", text: sistema, cache_control: { type: "ephemeral" } }],
          messages,
          tools: HERRAMIENTAS,
        })
        .finalMessage();
      sumarUso(uso, r.usage);
      messages.push({ role: "assistant", content: r.content });
      if (r.stop_reason === "pause_turn") continue;
      if (r.stop_reason === "refusal") {
        return { ok: false, error: { code: "RECHAZO", mensaje: `La IA no quiso armarlo (${r.stop_details?.category ?? "sin categoría"}).` }, uso };
      }
      if (r.stop_reason === "max_tokens") return { ok: false, error: { code: "MUY_LARGO", mensaje: "La respuesta se cortó por larga." }, uso };
      const texto = r.content.filter((b) => b.type === "text").at(-1)?.text ?? "";
      return { ok: true, data: { texto, mensajes: messages, modelo: r.model }, uso };
    }
    return { ok: false, error: { code: "SIN_TERMINAR", mensaje: "La investigación no terminó en 4 vueltas." }, uso };
  } catch (e) {
    return { ok: false, error: { code: "PROVEEDOR", mensaje: mensajeDeError(e) }, uso };
  }
}
```

- [ ] **Step 5: Run** — `pnpm --filter @jotapuntoce/admin exec vitest run tests/ia.test.js` → PASS (5).

- [ ] **Step 6: Update the rule.** En `.claude/rules/ia-gateway.md`, cambia los `paths` y el primer punto:

```md
---
description: Un gateway de IA por app, model id nunca hardcodeado
paths:
  - "apps/improvement/server/ai/**"
  - "apps/admin/lib/ia.js"
  - "apps/admin/lib/motor/**"
---

- `@anthropic-ai/sdk` se importa en exactamente un archivo por app: `apps/improvement/server/ai/gateway.ts` y
  `apps/admin/lib/ia.js` (admin no puede importar de apps/improvement). Ningún componente, ruta ni Server Action importa
  el SDK directo.
```

Deja los demás puntos y agrega uno al final de la lista:

```md
- Excepción documentada en admin: el motor del Chequeo guarda el uso y el costo en el evento `motor` de
  `chequeo_evento`, no en `llm_calls` (que exige `org_id`, y los prospectos no tienen organización). Su tope es
  `CHEQUEOS_MOTOR_TOPE_DIA` por día, no 10 por org por hora.
```

En `CLAUDE.md`, la fila de la tabla "Where things live":

```md
| Gateway de IA | `apps/improvement/server/ai/gateway.ts` y `apps/admin/lib/ia.js` — un único import de `@anthropic-ai/sdk` por app |
```

- [ ] **Step 7: Commit**

```bash
git add apps/admin/package.json pnpm-lock.yaml apps/admin/lib/ia.js apps/admin/tests/ia.test.js .claude/rules/ia-gateway.md CLAUDE.md
git commit -m "feat(admin): gateway de IA del panel para el motor del Chequeo

Dependencia nueva en apps/admin: @anthropic-ai/sdk 0.122.0 (la misma de improvement).
Razón: el motor del Chequeo vive en el panel y admin no puede importar el gateway
de apps/improvement; la regla pasa a un gateway por app."
```

---

### Task 4: El método y la entrada

**Files:**
- Create: `apps/admin/lib/motor/metodo.js`
- Test: `apps/admin/tests/motor-metodo.test.js`

**Interfaces:**
- Consumes: `CANAL_LABEL` de `../chequeoDatos.js`; las muestras de `./muestra.js` (en pruebas).
- Produces: `METODO_VERSION` (string), `METODO` (system prompt), `senales(c) → { minutosEntrevista, horasHastaEntrevista,
  palabras: number[] }` y `mensajeDe(c, { nota }?) → string`.

- [ ] **Step 1: Write the failing test** `apps/admin/tests/motor-metodo.test.js`:

```js
import { describe, expect, it } from "vitest";
import { METODO, mensajeDe, senales } from "../lib/motor/metodo.js";
import { CHEQUEO_MUESTRA, EMPRENDEDOR_MUESTRA } from "../lib/motor/muestra.js";

describe("método", () => {
  it("las señales salen de la fila, no de la IA", () => {
    expect(senales(CHEQUEO_MUESTRA)).toEqual({ minutosEntrevista: 7, horasHastaEntrevista: 0.3, palabras: [8, 5, 5] });
    expect(senales({ ...CHEQUEO_MUESTRA, entrevistaAt: null, entrevistaSegundos: null, respuestas: null })).toEqual({
      minutosEntrevista: null,
      horasHastaEntrevista: null,
      palabras: [],
    });
  });

  it("el mensaje lleva datos, respuestas tal cual, señales y la nota", () => {
    const m = mensajeDe({ ...CHEQUEO_MUESTRA, notas: "Lo conoce Ricardo" }, { nota: "No menciones precios" });
    expect(m).toContain("Café Ejemplo");
    expect(m).toContain("Por mi abuela, que tostaba café en casa.");
    expect(m).toContain("https://ejemplo.com");
    expect(m).toContain("Lo conoce Ricardo");
    expect(m).toContain("No menciones precios");
  });

  it("sin redes y emprendedor se dicen explícito", () => {
    const m = mensajeDe({ ...EMPRENDEDOR_MUESTRA, enlaces: {}, sinRedes: true });
    expect(m).toContain("Tipo: emprendedor");
    expect(m).toContain("no tiene redes sociales");
  });

  it("el método trae las reglas que no se rompen", () => {
    for (const regla of ["dato", "estimacion", "Plática", "Kit Arranque", "ÚNICAMENTE un objeto JSON"]) expect(METODO).toContain(regla);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @jotapuntoce/admin exec vitest run tests/motor-metodo.test.js`
  → FAIL.

- [ ] **Step 3: `apps/admin/lib/motor/metodo.js`**

```js
// El método del Chequeo: cómo piensa Improvement al armarlo. Sale del Chequeo de Boreal (hecho a mano, 2026-09-28) y de
// Improvement/jotapuntoce/principio-de-relacion.md. Cambiar el texto = subir METODO_VERSION (queda en la bitácora).
import { CANAL_LABEL } from "../chequeoDatos.js";

export const METODO_VERSION = "2026-10-05.1";

export const METODO = `Eres Improvement, el director digital de JotaPuntoCe. Armas el Chequeo de regalo de un negocio, o
de la idea de un emprendedor: una revisión desde afuera con los patógenos que se ven y las pastillas para actuar desde
mañana. Lo firma Jose Carlos Salinas.

# Cómo trabajas
1. Primero vive el negocio como cliente. Abre con web_fetch cada enlace que te dieron. Busca con web_search el negocio y
   su ciudad: ficha de Google, reseñas públicas, notas, su sitio si no te lo dieron. Fíjate en cómo se reserva o se
   compra, qué precios se ven y qué está roto o falta (enlaces que no abren, precios escondidos, horarios, páginas vacías).
2. Luego analízalo como si fueras el dueño: qué le deja dinero, qué se le escapa, qué le quita el sueño.
3. Si un enlace no abre o pide sesión (Instagram, TikTok y Facebook casi siempre), no lo inventes: anótalo en
   notasInternas.sinConfirmar. Si marcó que no tiene redes, eso mismo es un hallazgo.
4. Usa la lógica de su tipo de negocio: con local, ocupación × precio por franja; creador o en línea, audiencia y
   conversión; servicios, agenda y ticket promedio.

# Reglas que no se rompen
- Cada número lleva marca "dato" (lo viste; di dónde) o "estimacion" (lo calculaste; con su supuesto). Nunca inventes
  cifras, reseñas, testimonios, clientes ni datos que no viste.
- Arranca por lo bueno y por su historia (su respuesta a "¿Por qué empezaste?"). Habla en su idioma y con sus ejemplos.
- Venta pull: sin urgencia, sin presión, sin agitar el dolor. Nada privado que no nos haya contado.
- Voz de JotaPuntoCe: casual-formal, directa ("esto funciona, esto no y esto se mejora así"), ingeniosa sin que el chiste
  tape el dato. Español de México. Tutea a la persona, o "ustedes" si son socios.
- Las pastillas son acciones que el dueño puede hacer solo, desde mañana, sin pagarle a nadie.
- noSeVe: lo que solo se sabe por dentro (números reales, cómo se reparten el trabajo, procesos). Es lo que se ve en un
  Diagnóstico 360; menciónalo sin venderlo.
- cierre: invita a la Plática, de 20 a 60 minutos, para conocer a la persona: qué busca, a qué aspira y qué quiere para
  su negocio y su vida. Una invitación, nunca una venta. No pongas precios en el Chequeo.
- Emprendedor: dile con honestidad si la idea es viable hoy y qué le falta. Los pasos son babysteps a su medida, según
  su respuesta "¿Con qué cuentas hoy para arrancar?". siguienteNivel presenta el Kit Arranque como la puerta siguiente,
  sin empujar. Buscamos que se dedique a algo que disfrute en el proceso, no solo en el resultado.

# notasInternas (solo las ve Jose Carlos, nunca van al PDF)
comoEscribe: largo, tono y si se abrió o contestó por cumplir (usa las señales que te paso). tiempo: qué dicen sus
tiempos. sinConfirmar: lo que no pudiste ver o confirmar. siguientePaso: qué haría Jose Carlos ahora con esta persona.

# Respuesta
Al terminar de investigar, responde ÚNICAMENTE un objeto JSON, sin texto antes ni después.
Negocio:
{"tipo":"negocio","etapaProspecto":"arrancando|creciendo|consolidado","portada":{"dedicatoria":""},"porQue":"",
"bueno":[""],"patogenos":[{"titulo":"","evidencia":"","costo":"","marca":"dato|estimacion","supuesto":""}],
"pastillas":[{"titulo":"","como":""}],"noSeVe":"","cierre":"","fuentes":[{"url":"","que":""}],
"notasInternas":{"comoEscribe":"","tiempo":"","sinConfirmar":[""],"siguientePaso":""}}
Emprendedor:
{"tipo":"emprendedor","etapaProspecto":"idea","portada":{"dedicatoria":""},"porQue":"","bueno":[""],
"idea":{"viable":true,"porque":"","leFalta":[""]},"pasos":[{"titulo":"","como":""}],"siguienteNivel":"","cierre":"",
"fuentes":[{"url":"","que":""}],"notasInternas":{"comoEscribe":"","tiempo":"","sinConfirmar":[""],"siguientePaso":""}}
etapaProspecto del negocio: "arrancando" (primeros clientes), "creciendo" (ya vende y todo pasa por el dueño) o
"consolidado" (estable, busca escalar). En el emprendedor, siempre "idea". bueno, en el emprendedor, es "lo que te
mueve" (su pregunta 1). Máximo 5 patógenos, 5 pastillas o 6 pasos. supuesto es obligatorio en cada estimacion. Textos
cortos: cada sección cabe en una página A4.`;

const palabras = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);

/** Señales de comportamiento calculadas aquí, no por la IA: cuánto tardó y cuánto escribió. */
export function senales(c) {
  return {
    minutosEntrevista: c.entrevistaSegundos ? Math.round(c.entrevistaSegundos / 60) : null,
    horasHastaEntrevista: c.entrevistaAt ? Math.round(((c.entrevistaAt - c.createdAt) / 3_600_000) * 10) / 10 : null,
    palabras: (c.respuestas ?? []).map((r) => palabras(r.respuesta)),
  };
}

/** El mensaje del usuario para la IA: los datos del chequeo, tal cual. */
export function mensajeDe(c, { nota } = {}) {
  const s = senales(c);
  const enlaces = Object.entries(c.enlaces ?? {});
  const lineas = [
    "# El chequeo",
    `Tipo: ${c.tipo}`,
    `Persona: ${c.nombre ?? "(sin nombre)"}`,
    c.tipo === "negocio" ? `Negocio: ${c.negocio}` : `Su idea: ${c.negocio ?? "(sin nombre)"}`,
    `Giro${c.tipo === "emprendedor" ? " (lo que quiere emprender)" : ""}: ${c.giro}`,
    `Ciudad: ${c.ciudad}`,
    `Llegó por: ${CANAL_LABEL[c.canal] ?? c.canal}${c.canalDetalle ? ` (${c.canalDetalle})` : ""}`,
    c.sinRedes
      ? "Enlaces: marcó que su negocio no tiene redes sociales."
      : enlaces.length
        ? `Enlaces:\n${enlaces.map(([red, url]) => `- ${red}: ${url}`).join("\n")}`
        : "Enlaces: no dio ninguno.",
  ];
  if (c.respuestas?.length) {
    lineas.push("", "## Lo que contestó (tal como lo escribió)");
    for (const r of c.respuestas) lineas.push(`**${r.pregunta}**`, r.respuesta, "");
  }
  lineas.push(
    "## Señales",
    `- Minutos en la entrevista: ${s.minutosEntrevista ?? "sin dato"}`,
    `- Horas del registro a la entrevista: ${s.horasHastaEntrevista ?? "sin dato"}`,
    `- Palabras por respuesta: ${s.palabras.join(", ") || "sin respuestas"}`,
  );
  if (c.abrePuerta) lineas.push("", `Quien abre la puerta: ${c.abrePuerta}`);
  if (c.notas) lineas.push("", "## Nota de Jose Carlos", c.notas);
  if (nota) lineas.push("", "## Rehazlo tomando en cuenta esta nota de Jose Carlos", nota);
  return lineas.join("\n");
}
```

- [ ] **Step 4: Run** — `pnpm --filter @jotapuntoce/admin exec vitest run tests/motor-metodo.test.js` → PASS (4).
  Si la cuenta de palabras difiere, corrige el valor esperado del test contando a mano las respuestas de la muestra, no
  el código.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/lib/motor/metodo.js apps/admin/tests/motor-metodo.test.js
git commit -m "feat(admin): método del Chequeo y entrada del motor"
```

---

### Task 5: La plantilla con las 4 portadas

**Files:**
- Copy: `JotaPuntoCe\Branding\jotapuntoce\assets\monograma-m2-marino.svg` → `apps/admin/public/brand/monograma-m2-marino.svg`
- Create: `apps/admin/lib/motor/plantilla.js`
- Test: `apps/admin/tests/motor-plantilla.test.js`

**Interfaces:**
- Consumes: el contenido validado (Task 2); la fila `chequeo`.
- Produces: `PORTADAS` (`{ idea|arrancando|creciendo|consolidado: { frase, trazo } }`) y
  `htmlChequeo(c, contenido, { fecha = new Date() }?) → string` (documento HTML completo, A4).

- [ ] **Step 1: Copy the monogram** (desde la raíz del repo):

```bash
cp "../../Branding/jotapuntoce/assets/monograma-m2-marino.svg" apps/admin/public/brand/monograma-m2-marino.svg
```

- [ ] **Step 2: Write the failing test** `apps/admin/tests/motor-plantilla.test.js`:

```js
import { describe, expect, it } from "vitest";
import { PORTADAS, htmlChequeo } from "../lib/motor/plantilla.js";
import { CHEQUEO_MUESTRA, EMPRENDEDOR_MUESTRA, contenidoMuestra } from "../lib/motor/muestra.js";

describe("plantilla", () => {
  it("cada etapa usa su portada", () => {
    for (const etapa of ["arrancando", "creciendo", "consolidado"]) {
      expect(htmlChequeo(CHEQUEO_MUESTRA, contenidoMuestra(etapa))).toContain(PORTADAS[etapa].frase);
    }
    expect(htmlChequeo(EMPRENDEDOR_MUESTRA, contenidoMuestra("idea"))).toContain(PORTADAS.idea.frase);
  });

  it("escapa el texto de la IA", () => {
    const k = { ...contenidoMuestra("creciendo"), porQue: '<script>alert("x")</script>' };
    const html = htmlChequeo(CHEQUEO_MUESTRA, k);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("las notas internas y las fuentes nunca van al PDF", () => {
    const html = htmlChequeo(CHEQUEO_MUESTRA, contenidoMuestra("creciendo"));
    expect(html).not.toContain("Respuestas cortas pero cálidas.");
    expect(html).not.toContain("Mensaje mencionando a su abuela.");
  });

  it("marca dato y estimación con su supuesto", () => {
    const html = htmlChequeo(CHEQUEO_MUESTRA, contenidoMuestra("creciendo"));
    expect(html).toContain("Estimación");
    expect(html).toContain("10 cafés de $60 por día hábil");
  });

  it("el emprendedor ve su idea, sus pasos y el siguiente nivel", () => {
    const html = htmlChequeo(EMPRENDEDOR_MUESTRA, contenidoMuestra("idea"));
    expect(html).toContain("Tus primeros pasos");
    expect(html).toContain("El Kit Arranque");
  });

  it("incrusta los tokens y el monograma, sin depender de archivos externos salvo las fuentes", () => {
    const html = htmlChequeo(CHEQUEO_MUESTRA, contenidoMuestra("creciendo"));
    expect(html).toContain("--brand-navy");
    expect(html).toContain("data:image/svg+xml;base64,");
  });
});
```

- [ ] **Step 3: Run to verify it fails** — `pnpm --filter @jotapuntoce/admin exec vitest run tests/motor-plantilla.test.js`
  → FAIL.

- [ ] **Step 4: `apps/admin/lib/motor/plantilla.js`**

```js
// La plantilla del Chequeo: el diseño es fijo y la IA solo llena el texto (escapado). Parte de
// Improvement/jotapuntoce/chequeos/chequeo-boreal.html y del manual de marca v1 (monograma M2, Inter Tight, Bricolage,
// hilo de 6 colores). Las 4 portadas cambian según la etapa del prospecto; sus bocetos los aprueba el dueño
// (app/chequeos/muestra) antes de encender el motor.
import { readFileSync } from "node:fs";
import path from "node:path";

// ponytail: lee los archivos relativos a apps/admin (cwd de next y de vitest); al publicar el admin, revisar que el
// hosting conserve el monorepo o copiarlos al build.
const leer = (rel) => readFileSync(path.join(process.cwd(), rel), "utf8");
let recursos;
const losRecursos = () =>
  (recursos ??= {
    tokens: leer("../../packages/ui/src/tokens.css"),
    monograma: `data:image/svg+xml;base64,${Buffer.from(leer("public/brand/monograma-m2-marino.svg")).toString("base64")}`,
  });

const e = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

const linea = (d) =>
  `<svg viewBox="0 0 170 90" class="trazo" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}" style="stroke:var(--brand-navy)" stroke-width=".7"/></svg>`;

/** Una portada por etapa: la frase a mano y el trazo de la ilustración. */
export const PORTADAS = {
  idea: { frase: "puede ser a lo que te dediques toda la vida.", trazo: linea("M20 70 C40 70 50 40 85 40 C120 40 130 20 150 18 M150 18 l-6 -2 M150 18 l-3 5") },
  arrancando: { frase: "los primeros pasos ya se ven.", trazo: linea("M10 70 H50 L60 60 H90 L100 50 H130 L140 40 H165") },
  creciendo: { frase: "da para más.", trazo: linea("M0 62 H34 L38 56 L42 62 H50 L54 70 L59 30 L64 72 L68 62 H102 L114 54 L124 57 L136 40 L148 43 L166 16") },
  consolidado: { frase: "está listo para el siguiente piso.", trazo: linea("M30 80 V40 H70 V80 M70 80 V25 H110 V80 M110 80 V10 H150 V80 M20 80 H160") },
};

const ESTILOS = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; }
  body { font-family: "Inter Tight", system-ui, sans-serif; color: var(--brand-navy); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { width: 210mm; height: 297mm; background: var(--brand-ivory); position: relative; overflow: hidden; padding: 18mm 20mm 24mm; display: flex; flex-direction: column; page-break-after: always; }
  .head { display: flex; justify-content: space-between; align-items: center; font-size: 8.5pt; letter-spacing: .12em; text-transform: uppercase; color: color-mix(in srgb, var(--brand-navy) 72%, var(--brand-ivory)); }
  .head img { height: 9mm; }
  .foot { position: absolute; left: 20mm; right: 20mm; bottom: 12mm; display: flex; justify-content: space-between; font-size: 8pt; color: color-mix(in srgb, var(--brand-navy) 72%, var(--brand-ivory)); }
  .foot::before { content: ""; position: absolute; left: 0; right: 0; top: -4mm; height: .6mm; border-radius: 1mm; background: var(--brand-thread); }
  .trazo { width: 100%; margin-top: 14mm; }
  .cover .block { margin-top: auto; background: var(--dept-imaginacion); border-radius: 4mm; padding: 14mm 12mm; }
  .cover h1 { font-family: "Bricolage Grotesque"; font-weight: 800; font-size: 46pt; line-height: .92; letter-spacing: -.045em; }
  .cover .for { margin-top: 6mm; font-size: 12.5pt; line-height: 1.4; }
  .cover .meta { margin: 10mm 0 8mm; display: grid; grid-template-columns: repeat(3, 1fr); gap: 6mm; font-size: 9.5pt; }
  .cover .meta b { display: block; font-weight: 600; font-size: 10.5pt; }
  h2 { font-family: "Bricolage Grotesque"; font-weight: 800; font-size: 26pt; line-height: .95; letter-spacing: -.04em; margin: 12mm 0 6mm; }
  .hand { font-family: Caveat; font-weight: 700; color: var(--brand-amber-paper); font-size: 1.18em; }
  p, li { font-size: 10.3pt; line-height: 1.55; }
  p + p { margin-top: 3mm; }
  ul { padding-left: 5mm; }
  li + li { margin-top: 2mm; }
  h3 { font-size: 11.5pt; font-weight: 600; margin: 0 0 1.5mm; }
  .card { border: .3mm solid color-mix(in srgb, var(--brand-navy) 18%, transparent); border-radius: 3mm; padding: 3.2mm 5mm; }
  .card + .card { margin-top: 2.6mm; }
  .tag { display: inline-block; font-size: 7.5pt; letter-spacing: .1em; text-transform: uppercase; border: .3mm solid color-mix(in srgb, var(--brand-navy) 25%, transparent); border-radius: 10mm; padding: .6mm 2.4mm; margin-left: 2mm; }
  .pill { background: var(--brand-navy); color: var(--brand-ivory); border-radius: 3mm; padding: 4.5mm 5mm; }
  .pill + .pill { margin-top: 3mm; }
  .yellow { background: var(--dept-imaginacion); border-radius: 4mm; padding: 10mm; margin-top: auto; margin-bottom: 4mm; }
  .yellow h2 { margin-top: 0; }
`;

const mes = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" });
const dia = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });

export function htmlChequeo(c, k, { fecha = new Date() } = {}) {
  const { tokens, monograma } = losRecursos();
  const nombre = c.tipo === "negocio" ? c.negocio : "tu idea";
  const para = c.nombre ?? (c.tipo === "negocio" ? `el equipo de ${c.negocio}` : "ti");
  const portada = PORTADAS[k.etapaProspecto];
  let n = 0;
  const pagina = (titulo, cuerpo) => {
    n += 1;
    return `<section class="page"><div class="head"><img src="${monograma}" alt="J·C"><span>${e(titulo)}</span></div>${cuerpo}<div class="foot"><span>Hecho solo para ${e(c.negocio ?? para)}</span><span>${n}</span></div></section>`;
  };
  const lista = (xs) => `<ul>${xs.map((x) => `<li>${e(x)}</li>`).join("")}</ul>`;
  const acciones = (xs) => xs.map((a, i) => `<div class="pill"><h3>${i + 1}. ${e(a.titulo)}</h3><p>${e(a.como)}</p></div>`).join("");

  const paginas = [
    pagina(
      `Chequeo · ${mes.format(fecha)}`,
      `${portada.trazo}<div class="block"><h1>Chequeo de ${e(nombre)}</h1><p class="hand" style="font-size:22pt;margin-top:3mm">${e(portada.frase)}</p><div class="for">Preparado para <b>${e(para)}</b><br>${e(k.portada.dedicatoria)}</div></div><div class="meta"><div><b>Jose Carlos Salinas</b>Preparado por</div><div><b>${dia.format(fecha)}</b>Fecha</div><div><b>Un regalo</b>No cuesta nada</div></div>`,
    ).replace('class="page"', 'class="page cover"'),
    pagina("Antes de empezar", `<h2>Por qué hicimos esto</h2><p>${e(k.porQue)}</p><div class="card" style="margin-top:8mm"><p>${e(k.portada.dedicatoria)}</p></div><p style="margin-top:6mm"><span class="hand">Con gusto,</span></p><p><b>Jose Carlos Salinas</b> · JotaPuntoCe</p>`),
  ];

  if (k.tipo === "negocio") {
    paginas.push(
      pagina("Lo que ya funciona", `<h2>Primero, lo bueno</h2>${lista(k.bueno)}`),
      pagina(
        "Lo que se ve desde afuera",
        `<h2>Lo que se ve desde afuera</h2>${k.patogenos
          .map(
            (p) =>
              `<div class="card"><h3>${e(p.titulo)}<span class="tag">${p.marca === "dato" ? "Dato" : "Estimación"}</span></h3><p>${e(p.evidencia)}</p><p><b>Lo que cuesta:</b> ${e(p.costo)}${p.supuesto ? ` <i>(supuesto: ${e(p.supuesto)})</i>` : ""}</p></div>`,
          )
          .join("")}`,
      ),
      pagina("Desde mañana", `<h2>Lo que pueden hacer desde mañana</h2>${acciones(k.pastillas)}`),
      pagina("Lo que sigue", `<h2>La parte que no se ve</h2><p>${e(k.noSeVe)}</p><div class="yellow"><h2>¿Lo platicamos?</h2><p>${e(k.cierre)}</p></div>`),
    );
  } else {
    paginas.push(
      pagina("Lo que te mueve", `<h2>Lo que te mueve</h2>${lista(k.bueno)}`),
      pagina(
        "Tu idea",
        `<h2>Tu idea</h2><p class="hand" style="font-size:18pt">${k.idea.viable ? "Sí tiene con qué." : "Todavía le falta."}</p><p>${e(k.idea.porque)}</p><h3 style="margin-top:6mm">Lo que le falta</h3>${lista(k.idea.leFalta)}`,
      ),
      pagina("Tus primeros pasos", `<h2>Tus primeros pasos</h2>${acciones(k.pasos)}`),
      pagina("Lo que sigue", `<h2>El siguiente nivel</h2><p>${e(k.siguienteNivel)}</p><div class="yellow"><h2>¿Lo platicamos?</h2><p>${e(k.cierre)}</p></div>`),
    );
  }

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Chequeo de ${e(nombre)}</title>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&family=Caveat:wght@700&family=Inter+Tight:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>${tokens}${ESTILOS}</style></head><body>${paginas.join("")}</body></html>`;
}
```

- [ ] **Step 5: Run** — `pnpm --filter @jotapuntoce/admin exec vitest run tests/motor-plantilla.test.js` → PASS (6).
  El test de emprendedor busca "El Kit Arranque", que sale de `siguienteNivel` en la muestra.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/public/brand/monograma-m2-marino.svg apps/admin/lib/motor/plantilla.js apps/admin/tests/motor-plantilla.test.js
git commit -m "feat(admin): plantilla de marca del Chequeo con 4 portadas por etapa"
```

---

### Task 6: HTML → PDF

**Files:**
- Modify: `apps/admin/package.json` (vía `pnpm add`)
- Create: `apps/admin/lib/motor/pdf.js`
- Test: `apps/admin/tests/motor-pdf.test.js`

**Interfaces:**
- Produces: `aPdf(html) → Promise<Buffer>` (PDF A4 con fondos).

- [ ] **Step 1: Add the dependency and the browser**

Run: `pnpm --filter @jotapuntoce/admin add playwright-core@1.62.1`
Run: `pnpm --filter improvement exec playwright install chromium` (la caché de navegadores es compartida; misma versión
1.62.1).

- [ ] **Step 2: Write the failing test** `apps/admin/tests/motor-pdf.test.js`:

```js
import { describe, expect, it } from "vitest";
import { aPdf } from "../lib/motor/pdf.js";
import { htmlChequeo } from "../lib/motor/plantilla.js";
import { CHEQUEO_MUESTRA, contenidoMuestra } from "../lib/motor/muestra.js";

describe("pdf", () => {
  it("imprime la plantilla a un PDF de varias páginas", async () => {
    const pdf = await aPdf(htmlChequeo(CHEQUEO_MUESTRA, contenidoMuestra("creciendo")));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect((pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(6);
  }, 60_000); // abre Chromium y descarga las fuentes de Google
});
```

- [ ] **Step 3: Run to verify it fails** — `pnpm --filter @jotapuntoce/admin exec vitest run tests/motor-pdf.test.js` → FAIL.

- [ ] **Step 4: `apps/admin/lib/motor/pdf.js`**

```js
// HTML → PDF con Chromium sin pantalla: la misma impresión del navegador con la que se hizo el Chequeo de Boreal.
// ponytail: un Chromium por PDF; si llegan muchos a la vez, reusar un navegador abierto.
import { chromium } from "playwright-core";

export async function aPdf(html) {
  const navegador = await chromium.launch();
  try {
    const pagina = await navegador.newPage();
    await pagina.setContent(html, { waitUntil: "networkidle" });
    return await pagina.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  } finally {
    await navegador.close();
  }
}
```

- [ ] **Step 5: Run** — mismo comando → PASS. Si el conteo de páginas falla por cómo Chromium escribe el PDF, cambia la
  segunda aserción a `expect(pdf.length).toBeGreaterThan(10_000)` y anota por qué en el commit.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/package.json pnpm-lock.yaml apps/admin/lib/motor/pdf.js apps/admin/tests/motor-pdf.test.js
git commit -m "feat(admin): PDF del Chequeo con Chromium

Dependencia nueva en apps/admin: playwright-core 1.62.1 (ya está en el repo como
herramienta de pruebas de improvement). Razón: imprimir la plantilla de marca a PDF
igual que el Chequeo de Boreal; no hay otra forma sin una librería de PDF aparte."
```

---

### Task 7: El orquestador

**Files:**
- Modify: `apps/admin/lib/chequeos.js` (exportar `panelUrl`, `quien`; extraer `subirPdf`)
- Create: `apps/admin/lib/motor/armar.js`
- Test: `apps/admin/tests/motor-armar.test.js`

**Interfaces:**
- Consumes: `investigar`, `extraerJson`, `costoUsd`, `MODELO` (Task 3); `METODO`, `METODO_VERSION`, `mensajeDe`
  (Task 4); `contenidoSchema` (Task 2); `htmlChequeo` (Task 5); `aPdf` (Task 6); `avisar`, `panelUrl`, `quien`,
  `subirPdf` de `../chequeos.js`.
- Produces:
  - `armarChequeo(id, { manual = false, nota = null }?, deps?) → Promise<{ ok: true, data: { pdfPath } } | { ok: false,
    error: { code: "NO_ENCONTRADO" | "EN_FILA" | "YA_ARMANDO" | "MOTOR", mensaje? } }>`, con
    `deps = { investigar?, aPdf? }`. Nunca lanza.
  - `aprobarChequeo(id) → { ok: true, data: null } | { ok: false, error: { code: "SIN_BORRADOR", mensaje } }`.
  - `gastoDelMes() → Promise<number>` (USD).
  - En `chequeos.js`: `subirPdf(ruta, buffer) → { ok: true } | { ok: false, error: { code: "STORAGE", mensaje } }`.

- [ ] **Step 1: Refactor `chequeos.js`.** Cambia `const panelUrl` y `const quien` a `export const`. Reemplaza el cuerpo de
  `guardarPdf` para usar un `subirPdf` exportado:

```js
/** Sube un PDF al bucket privado. La crea la primera vez. */
export async function subirPdf(ruta, buffer) {
  await supabaseAdmin.storage.createBucket(BUCKET, { public: false }).catch(() => {}); // ya existe → se ignora
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(ruta, buffer, { contentType: "application/pdf", upsert: true });
  return error ? { ok: false, error: { code: "STORAGE", mensaje: error.message } } : { ok: true };
}

export async function guardarPdf(id, archivo) {
  if (!archivo || archivo.type !== "application/pdf") return { ok: false, error: { code: "NO_ES_PDF", mensaje: "Sube un PDF." } };
  const ruta = `${id}/${Date.now()}.pdf`;
  const r = await subirPdf(ruta, Buffer.from(await archivo.arrayBuffer()));
  if (!r.ok) return r;
  await db.update(chequeo).set({ pdfPath: ruta, updatedAt: new Date() }).where(eq(chequeo.id, id));
  return { ok: true, data: { ruta } };
}
```

Corre `pnpm --filter @jotapuntoce/admin exec vitest run tests/chequeos.test.js` → PASS (sin cambios de comportamiento).

- [ ] **Step 2: Write the failing test** `apps/admin/tests/motor-armar.test.js`:

```js
// Integración contra el Supabase de desarrollo con la IA y el PDF simulados: nunca llama a Anthropic.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db, supabaseAdmin } from "../lib/db.js";
import { chequeo, chequeoEvento } from "@jotapuntoce/db/schema";
import { crearChequeoPropio } from "../lib/chequeos.js";
import { aprobarChequeo, armarChequeo, gastoDelMes } from "../lib/motor/armar.js";
import { contenidoMuestra } from "../lib/motor/muestra.js";

const ids = [];
const marca = `m${Date.now()}`;
const USO = { input: 1000, output: 500, cacheRead: 0, cacheWrite: 0, busquedas: 1, paginas: 2 };
const responde = (...textos) => {
  const llamadas = [];
  const fn = async (params) => {
    llamadas.push(params);
    return { ok: true, data: { texto: textos.shift(), mensajes: [...params.mensajes, { role: "assistant", content: [] }], modelo: "claude-opus-5-5" }, uso: USO };
  };
  fn.llamadas = llamadas;
  return fn;
};
const pdfFalso = async () => Buffer.from("%PDF-1.4 prueba");
const valido = () => JSON.stringify(contenidoMuestra("creciendo"));

beforeAll(() => {
  process.env.AVISOS_WHATSAPP_A = "";
  process.env.CHEQUEOS_MOTOR_TOPE_DIA = "1000";
});

afterEach(async () => {
  for (const id of ids) {
    const { data } = await supabaseAdmin.storage.from("chequeos").list(id);
    if (data?.length) await supabaseAdmin.storage.from("chequeos").remove(data.map((f) => `${id}/${f.name}`));
  }
  if (ids.length) await db.delete(chequeo).where(inArray(chequeo.id, ids.splice(0)));
});

let n = 0;
async function propio() {
  n += 1;
  const r = await crearChequeoPropio({ tipo: "negocio", negocio: `Motor ${marca} ${n}`, giro: "café", ciudad: "SLP", canal: "directo" });
  ids.push(r.data.id);
  return r.data.id;
}
const fila = async (id) => (await db.select().from(chequeo).where(eq(chequeo.id, id)))[0];
const motor = async (id) =>
  (await db.select().from(chequeoEvento).where(eq(chequeoEvento.chequeoId, id))).filter((e) => e.tipo === "motor").map((e) => e.detalle.accion);

describe("armarChequeo", () => {
  it("sin_empezar → borrador → aprobado, con costo en la bitácora", async () => {
    const id = await propio();
    const r = await armarChequeo(id, { manual: true }, { investigar: responde(valido()), aPdf: pdfFalso });
    expect(r.ok).toBe(true);
    const f = await fila(id);
    expect(f).toMatchObject({ motorEstado: "borrador", etapaProspecto: "creciendo", pdfPath: `${id}/borrador-1.pdf` });
    expect(f.notasInternas.siguientePaso).toBeTruthy();
    expect(f.contenido.notasInternas).toBeUndefined();
    const [ev] = (await db.select().from(chequeoEvento).where(eq(chequeoEvento.chequeoId, id))).filter((e) => e.tipo === "motor");
    expect(ev.detalle).toMatchObject({ accion: "armado", automatico: false, modelo: "claude-opus-5-5" });
    expect(ev.detalle.costoUsd).toBeGreaterThan(0);
    expect(await gastoDelMes()).toBeGreaterThan(0);
    expect((await aprobarChequeo(id)).ok).toBe(true);
    expect((await fila(id)).motorEstado).toBe("aprobado");
    expect((await aprobarChequeo(id)).error.code).toBe("SIN_BORRADOR");
  }, 20_000);

  it("JSON inválido → un reintento con la corrección → borrador", async () => {
    const id = await propio();
    const inv = responde("{}", valido());
    expect((await armarChequeo(id, { manual: true }, { investigar: inv, aPdf: pdfFalso })).ok).toBe(true);
    expect(inv.llamadas).toHaveLength(2);
    expect(inv.llamadas[1].mensajes.at(-1).content).toContain("no pasó la validación");
  }, 20_000);

  it("inválido dos veces → error con motivo, sin PDF", async () => {
    const id = await propio();
    const r = await armarChequeo(id, { manual: true }, { investigar: responde("{}", "nada"), aPdf: pdfFalso });
    expect(r.error.code).toBe("MOTOR");
    const f = await fila(id);
    expect(f.motorEstado).toBe("error");
    expect(f.motorError).toMatch(/piezas del Chequeo/);
    expect(f.pdfPath).toBeNull();
    expect(await motor(id)).toEqual(["error"]);
  }, 20_000);

  it("rehacer con nota crea borrador-2 y no pisa el 1", async () => {
    const id = await propio();
    await armarChequeo(id, { manual: true }, { investigar: responde(valido()), aPdf: pdfFalso });
    const inv = responde(valido());
    await armarChequeo(id, { manual: true, nota: "Sin precios" }, { investigar: inv, aPdf: pdfFalso });
    expect(inv.llamadas[0].mensajes[0].content).toContain("Sin precios");
    expect((await fila(id)).pdfPath).toBe(`${id}/borrador-2.pdf`);
    expect(await motor(id)).toEqual(expect.arrayContaining(["armado", "rehecho"]));
  }, 20_000);

  it("tope lleno → en_fila; el manual sí pasa", async () => {
    process.env.CHEQUEOS_MOTOR_TOPE_DIA = "0";
    try {
      const id = await propio();
      expect((await armarChequeo(id, {}, { investigar: responde(valido()), aPdf: pdfFalso })).error.code).toBe("EN_FILA");
      expect((await fila(id)).motorEstado).toBe("en_fila");
      expect((await armarChequeo(id, { manual: true }, { investigar: responde(valido()), aPdf: pdfFalso })).ok).toBe(true);
    } finally {
      process.env.CHEQUEOS_MOTOR_TOPE_DIA = "1000";
    }
  }, 20_000);

  it("dos armados a la vez: solo uno corre", async () => {
    const id = await propio();
    const [a, b] = await Promise.all([
      armarChequeo(id, { manual: true }, { investigar: responde(valido()), aPdf: pdfFalso }),
      armarChequeo(id, { manual: true }, { investigar: responde(valido()), aPdf: pdfFalso }),
    ]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect([a, b].find((r) => !r.ok).error.code).toBe("YA_ARMANDO");
  }, 20_000);

  it("un tipo distinto al del chequeo es error", async () => {
    const id = await propio();
    const r = await armarChequeo(id, { manual: true }, { investigar: responde(JSON.stringify(contenidoMuestra("idea"))), aPdf: pdfFalso });
    expect(r.error.code).toBe("MOTOR");
  }, 20_000);
});
```

- [ ] **Step 3: Run to verify it fails** — `pnpm --filter @jotapuntoce/admin exec vitest run tests/motor-armar.test.js`
  → FAIL (no existe `armar.js`).

- [ ] **Step 4: `apps/admin/lib/motor/armar.js`**

```js
// El motor del Chequeo: estados, tope, investigación, validación, plantilla, PDF, bitácora y avisos. Nunca lanza: todo
// termina en borrador, en_fila o error, con su evento `motor`. Sin guard adentro (el guard vive en
// app/chequeos/actions.js; la API lo llama tras validar la clave). Spec: 2026-10-05-motor-chequeo-design.md.
import { and, count, eq, gte, inArray, sql } from "drizzle-orm";
import { chequeo, chequeoEvento } from "@jotapuntoce/db/schema";
import { db } from "../db.js";
import { avisar, panelUrl, quien, subirPdf } from "../chequeos.js";
import { MODELO, costoUsd, extraerJson, investigar } from "../ia.js";
import { contenidoSchema } from "./esquema.js";
import { METODO, METODO_VERSION, mensajeDe } from "./metodo.js";
import { aPdf } from "./pdf.js";
import { htmlChequeo } from "./plantilla.js";

const TOMABLES = ["sin_empezar", "en_fila", "borrador", "error"];
const tope = () => Number(process.env.CHEQUEOS_MOTOR_TOPE_DIA ?? 20);
const accion = (a) => sql`${chequeoEvento.detalle}->>'accion' = ${a}`;

const evento = (chequeoId, autor, detalle) => db.insert(chequeoEvento).values({ chequeoId, tipo: "motor", autor, detalle });

// ponytail: cuenta los armados ya terminados; una ráfaga simultánea puede pasarse del tope por unos cuantos.
async function automaticosUltimoDia() {
  const desde = new Date(Date.now() - 86_400_000);
  const [r] = await db
    .select({ n: count() })
    .from(chequeoEvento)
    .where(and(eq(chequeoEvento.tipo, "motor"), accion("armado"), sql`${chequeoEvento.detalle}->>'automatico' = 'true'`, gte(chequeoEvento.createdAt, desde)));
  return r.n;
}

async function borradoresHechos(id) {
  const [r] = await db
    .select({ n: count() })
    .from(chequeoEvento)
    .where(and(eq(chequeoEvento.chequeoId, id), eq(chequeoEvento.tipo, "motor"), sql`${chequeoEvento.detalle}->>'accion' in ('armado','rehecho')`));
  return r.n;
}

async function fallar(c, mensaje, uso) {
  await db.update(chequeo).set({ motorEstado: "error", motorError: mensaje, updatedAt: new Date() }).where(eq(chequeo.id, c.id));
  await evento(c.id, "improvement", { accion: "error", mensaje, ...(uso && { uso, costoUsd: costoUsd(uso) }) });
  await avisar(`⚠️ El motor no pudo armar el Chequeo de ${quien(c)}: ${mensaje} · ${panelUrl(c.id)}`);
  return { ok: false, error: { code: "MOTOR", mensaje } };
}

const correccion = (error) =>
  `Tu respuesta no pasó la validación. Corrige esto y responde ÚNICAMENTE el objeto JSON completo:\n${error.issues
    .map((i) => `- ${i.path.join(".") || "(raíz)"}: ${i.message}`)
    .join("\n")}`;

export async function armarChequeo(id, { manual = false, nota = null } = {}, deps = {}) {
  const inv = deps.investigar ?? investigar;
  const pdf = deps.aPdf ?? aPdf;
  try {
    const [c] = await db.select().from(chequeo).where(eq(chequeo.id, id)).limit(1);
    if (!c) return { ok: false, error: { code: "NO_ENCONTRADO" } };

    if (!manual && (await automaticosUltimoDia()) >= tope()) {
      await db.update(chequeo).set({ motorEstado: "en_fila", updatedAt: new Date() }).where(and(eq(chequeo.id, id), eq(chequeo.motorEstado, "sin_empezar")));
      await evento(id, "improvement", { accion: "en_fila" });
      await avisar(`⏸️ Tope del día lleno: el Chequeo de ${quien(c)} quedó en fila; ármalo tú desde el panel · ${panelUrl(id)}`);
      return { ok: false, error: { code: "EN_FILA" } };
    }

    const tomado = await db
      .update(chequeo)
      .set({ motorEstado: "armando", motorError: null, updatedAt: new Date() })
      .where(and(eq(chequeo.id, id), inArray(chequeo.motorEstado, TOMABLES)))
      .returning({ id: chequeo.id });
    if (!tomado.length) return { ok: false, error: { code: "YA_ARMANDO" } };

    const uso = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, busquedas: 0, paginas: 0 };
    const sumar = (u) => {
      for (const k of Object.keys(uso)) uso[k] += u?.[k] ?? 0;
    };

    let r = await inv({ sistema: METODO, mensajes: [{ role: "user", content: mensajeDe(c, { nota }) }] });
    sumar(r.uso);
    if (!r.ok) return fallar(c, r.error.mensaje, uso);
    let p = contenidoSchema.safeParse(extraerJson(r.data.texto) ?? {});
    if (!p.success) {
      r = await inv({ sistema: METODO, mensajes: [...r.data.mensajes, { role: "user", content: correccion(p.error) }] });
      sumar(r.uso);
      if (!r.ok) return fallar(c, r.error.mensaje, uso);
      p = contenidoSchema.safeParse(extraerJson(r.data.texto) ?? {});
      if (!p.success) return fallar(c, "La respuesta de la IA no tenía todas las piezas del Chequeo, ni al segundo intento.", uso);
    }
    const k = p.data;
    if (k.tipo !== c.tipo) return fallar(c, `La IA armó un Chequeo de ${k.tipo} y este es de ${c.tipo}.`, uso);

    const ruta = `${id}/borrador-${(await borradoresHechos(id)) + 1}.pdf`;
    const subido = await subirPdf(ruta, await pdf(htmlChequeo(c, k)));
    if (!subido.ok) return fallar(c, `No se pudo guardar el PDF: ${subido.error.mensaje}`, uso);

    const { notasInternas, fuentes, ...contenido } = k;
    await db.transaction(async (tx) => {
      await tx
        .update(chequeo)
        .set({ motorEstado: "borrador", motorError: null, contenido, notasInternas, fuentes, etapaProspecto: k.etapaProspecto, pdfPath: ruta, updatedAt: new Date() })
        .where(eq(chequeo.id, id));
      await tx.insert(chequeoEvento).values({
        chequeoId: id,
        tipo: "motor",
        autor: "improvement",
        detalle: { accion: nota ? "rehecho" : "armado", automatico: !manual, nota, pdfPath: ruta, uso, costoUsd: costoUsd(uso), modelo: MODELO, metodo: METODO_VERSION },
      });
    });
    await avisar(`📝 Borrador listo: Chequeo de ${quien(c)}. Revísalo y apruébalo · ${panelUrl(id)}`);
    return { ok: true, data: { pdfPath: ruta } };
  } catch (e) {
    const [c] = await db.select().from(chequeo).where(eq(chequeo.id, id)).limit(1).catch(() => []);
    if (c) return fallar(c, `Falla inesperada: ${e?.message ?? e}`);
    return { ok: false, error: { code: "MOTOR", mensaje: String(e?.message ?? e) } };
  }
}

export async function aprobarChequeo(id) {
  const r = await db
    .update(chequeo)
    .set({ motorEstado: "aprobado", updatedAt: new Date() })
    .where(and(eq(chequeo.id, id), eq(chequeo.motorEstado, "borrador")))
    .returning({ id: chequeo.id });
  if (!r.length) return { ok: false, error: { code: "SIN_BORRADOR", mensaje: "No hay un borrador por aprobar." } };
  await evento(id, "jose_carlos", { accion: "aprobado" });
  return { ok: true, data: null };
}

/** Dólares gastados en IA desde el día 1 del mes. */
export async function gastoDelMes() {
  const inicio = new Date();
  inicio.setDate(1);
  inicio.setHours(0, 0, 0, 0);
  const [r] = await db
    .select({ total: sql`coalesce(sum((${chequeoEvento.detalle}->>'costoUsd')::numeric), 0)` })
    .from(chequeoEvento)
    .where(and(eq(chequeoEvento.tipo, "motor"), gte(chequeoEvento.createdAt, inicio)));
  return Number(r.total);
}
```

Nota: en el test "rehacer", el primer armado no lleva nota (`armado`) y el segundo sí (`rehecho`).

- [ ] **Step 5: Run** — `pnpm --filter @jotapuntoce/admin exec vitest run tests/motor-armar.test.js` → PASS (7). Luego
  `pnpm --filter @jotapuntoce/admin test` → PASS completo.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/lib/chequeos.js apps/admin/lib/motor/armar.js apps/admin/tests/motor-armar.test.js
git commit -m "feat(admin): orquestador del motor del Chequeo (estados, tope, bitácora y costo)"
```

---

### Task 8: Disparo y panel

**Files:**
- Modify: `apps/admin/app/api/chequeos/[id]/route.js`
- Modify: `apps/admin/lib/chequeos.js` (`guardarDatosPropio`)
- Modify: `apps/admin/app/chequeos/actions.js`
- Modify: `apps/admin/app/chequeos/[id]/page.js`
- Modify: `apps/admin/app/chequeos/page.js`
- Create: `apps/admin/app/chequeos/muestra/route.js`
- Test: `apps/admin/tests/chequeos.test.js` (agregar)

**Interfaces:**
- Consumes: `armarChequeo`, `aprobarChequeo`, `gastoDelMes` (Task 7); `htmlChequeo` (Task 5); `contenidoMuestra`,
  `CHEQUEO_MUESTRA`, `EMPRENDEDOR_MUESTRA` (Task 2); `datosPropioSchema`, `MOTOR_ESTADO_LABEL`, `MOTOR_ACCION_LABEL`,
  `ETAPA_PROSPECTO_LABEL`, `ENLACES` (Task 1).
- Produces: `guardarDatosPropio(id, { enlaces, nota }) → { ok, data: null } | DATOS_INVALIDOS`; las acciones
  `armarAction(id, _prev, fd)`, `rehacerAction(id, _prev, fd)`, `aprobarAction(id, _prev, fd)` y
  `datosPropioAction(id, _prev, fd)`.

- [ ] **Step 1: Write the failing test** — en `apps/admin/tests/chequeos.test.js`, agrega `guardarDatosPropio` al import
  de `../lib/chequeos.js` y este bloque dentro de `describe("panel", ...)`:

```js
  it("datos de un propio: guarda enlaces válidos y la nota", async () => {
    const r = await crearChequeoPropio({ tipo: "negocio", negocio: `Datos ${marca}`, giro: "pádel", ciudad: "SLP", canal: "directo" });
    ids.push(r.data.id);
    expect((await guardarDatosPropio(r.data.id, { enlaces: { sitio: "https://borealslp.com", instagram: "" }, nota: "Socias" })).ok).toBe(true);
    const [f] = await db.select().from(chequeo).where(eq(chequeo.id, r.data.id));
    expect(f).toMatchObject({ enlaces: { sitio: "https://borealslp.com" }, notas: "Socias" });
    expect((await guardarDatosPropio(r.data.id, { enlaces: { sitio: "x" } })).error.code).toBe("DATOS_INVALIDOS");
  });
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @jotapuntoce/admin exec vitest run tests/chequeos.test.js` →
  FAIL.

- [ ] **Step 3: `guardarDatosPropio` en `lib/chequeos.js`** (agrega `datosPropioSchema` al import de `./chequeoDatos.js`),
  después de `fijarProximaAccion`:

```js
/** Enlaces y nota de contexto de un chequeo propio, para que el motor tenga de dónde leer. */
export async function guardarDatosPropio(id, input) {
  const p = datosPropioSchema.safeParse(input);
  if (!p.success) return invalido(p.error);
  await db.update(chequeo).set({ enlaces: p.data.enlaces, notas: p.data.nota, updatedAt: new Date() }).where(eq(chequeo.id, id));
  return { ok: true, data: null };
}
```

Run: mismo comando → PASS.

- [ ] **Step 4: Disparo en la API.** `apps/admin/app/api/chequeos/[id]/route.js` queda:

```js
// Envío 2 de la landing: la entrevista, con la clave que devolvió el envío 1. Si el motor está encendido
// (CHEQUEOS_MOTOR_AUTO=1, solo tras aprobar portadas y la prueba con Boreal), arma el Chequeo después de responder.
import { after } from "next/server";
import { leer, preflight, responder } from "@/lib/cors.js";
import { guardarEntrevista } from "@/lib/chequeos.js";
import { armarChequeo } from "@/lib/motor/armar.js";

const STATUS = { DATOS_INVALIDOS: 400, NO_ENCONTRADO: 404, YA_ENVIADA: 409 };

export const OPTIONS = preflight;

export async function PATCH(request, { params }) {
  const { origin, body, error } = await leer(request);
  if (error) return error;
  const { id } = await params;
  const r = await guardarEntrevista(id, body);
  if (r.ok && process.env.CHEQUEOS_MOTOR_AUTO === "1") after(() => armarChequeo(id));
  return responder(origin, r.ok ? 200 : (STATUS[r.error.code] ?? 400), r);
}
```

Las pruebas existentes no definen `CHEQUEOS_MOTOR_AUTO`, así que `after` no corre fuera de una request.

- [ ] **Step 5: Acciones.** En `apps/admin/app/chequeos/actions.js`, agrega a los imports:

```js
import { after } from "next/server";
import { aprobarChequeo, armarChequeo } from "@/lib/motor/armar.js";
```

(y `guardarDatosPropio` al import de `@/lib/chequeos.js`). Al final:

```js
// El armado tarda minutos: corre después de responder y avisa por WhatsApp. La página muestra "Armando…".
export async function armarAction(id) {
  await requirePlatformAdmin();
  after(() => armarChequeo(id, { manual: true }));
  return { ok: true, data: null };
}
export async function rehacerAction(id, _prev, fd) {
  await requirePlatformAdmin();
  const nota = String(fd.get("nota") ?? "").trim();
  if (!nota) return { ok: false, error: { code: "DATOS_INVALIDOS", mensaje: "Escribe qué cambiar." } };
  after(() => armarChequeo(id, { manual: true, nota }));
  return { ok: true, data: null };
}
export async function aprobarAction(id) {
  return enChequeo(id, () => aprobarChequeo(id));
}
export async function datosPropioAction(id, _prev, fd) {
  const enlaces = Object.fromEntries([...fd.entries()].filter(([k]) => k.startsWith("enlace_")).map(([k, v]) => [k.slice(7), String(v)]));
  return enChequeo(id, () => guardarDatosPropio(id, { enlaces, nota: fd.get("nota") }));
}
```

- [ ] **Step 6: Página del chequeo.** En `apps/admin/app/chequeos/[id]/page.js`:
  - Imports: agrega `ENLACES`, `ETAPA_PROSPECTO_LABEL`, `MOTOR_ACCION_LABEL` y `MOTOR_ESTADO_LABEL` a `@/lib/chequeoDatos.js`,
    y `aprobarAction`, `armarAction`, `datosPropioAction` y `rehacerAction` a `../actions.js`.
  - `TIPO_EVENTO`: agrega `motor: "Motor"`.
  - En `detalleDe`, antes del `return` final:

```js
  if (e.tipo === "motor") {
    const costo = d.costoUsd ? ` · US$${Number(d.costoUsd).toFixed(2)}` : "";
    return [MOTOR_ACCION_LABEL[d.accion], d.nota && `"${d.nota}"`, d.mensaje].filter(Boolean).join(" · ") + costo;
  }
```

  - Reemplaza la sección `<section className="chq-section"><h3>El chequeo</h3>…</section>` por:

```jsx
      {c.origen === "propio" && (
        <section className="chq-section">
          <h3>Para que Improvement lo arme</h3>
          <Formulario action={datosPropioAction.bind(null, c.id)} boton="Guardar enlaces y nota">
            {ENLACES.map((red) => (
              <input key={red} className="input" name={`enlace_${red}`} type="url" placeholder={red} defaultValue={c.enlaces?.[red] ?? ""} />
            ))}
            <textarea className="input" name="nota" rows={3} placeholder="Lo que sabes del negocio y de la persona" defaultValue={c.notas ?? ""} />
          </Formulario>
        </section>
      )}

      <section className="chq-section">
        <h3>El chequeo · {MOTOR_ESTADO_LABEL[c.motorEstado]}</h3>
        {c.motorEstado === "armando" && <p className="chq-muted">Improvement lo está armando. Te llega un WhatsApp cuando esté; recarga en unos minutos.</p>}
        {c.motorEstado === "error" && <p className="form-error">{c.motorError}</p>}
        {c.etapaProspecto && <p className="chq-muted">Portada: {ETAPA_PROSPECTO_LABEL[c.etapaProspecto]}</p>}
        {pdf ? <iframe src={pdf} title={`Chequeo de ${nombreDe(c)}`} className="chq-pdf" /> : <p className="chq-muted">Todavía sin PDF.</p>}
        {["sin_empezar", "en_fila", "error"].includes(c.motorEstado) && (
          <Formulario action={armarAction.bind(null, c.id)} boton={c.motorEstado === "error" ? "Reintentar" : "Armar con Improvement"} />
        )}
        {c.motorEstado === "borrador" && (
          <>
            <Formulario action={aprobarAction.bind(null, c.id)} boton="Aprobar" />
            <Formulario action={rehacerAction.bind(null, c.id)} boton="Rehacer con esta nota">
              <input className="input" name="nota" placeholder="Qué cambiar (ej. no menciones precios)" required />
            </Formulario>
          </>
        )}
        <Formulario action={pdfAction.bind(null, c.id)} boton={pdf ? "Reemplazar PDF" : "Subir PDF"}>
          <input className="input" type="file" name="pdf" accept="application/pdf" required />
        </Formulario>
      </section>

      {c.notasInternas && (
        <section className="chq-section">
          <h3>Notas internas (solo tú)</h3>
          <p><strong>Cómo escribe:</strong> {c.notasInternas.comoEscribe}</p>
          <p><strong>Su tiempo:</strong> {c.notasInternas.tiempo}</p>
          {c.notasInternas.sinConfirmar?.length > 0 && <p><strong>Sin confirmar:</strong> {c.notasInternas.sinConfirmar.join(" · ")}</p>}
          <p><strong>Siguiente paso:</strong> {c.notasInternas.siguientePaso}</p>
          {c.fuentes?.length > 0 && (
            <p className="chq-muted">
              Fuentes:{" "}
              {c.fuentes.map((f) => (
                <a key={f.url} href={f.url} target="_blank" rel="noreferrer" style={{ marginRight: 12 }}>
                  {f.que}
                </a>
              ))}
            </p>
          )}
        </section>
      )}
```

  `Formulario` sin `children` solo muestra su botón; ya funciona así.

- [ ] **Step 7: Tablero.** En `apps/admin/app/chequeos/page.js`: `import { gastoDelMes } from "@/lib/motor/armar.js";`. Cambia
  la carga a `const [t, lista, gasto] = await Promise.all([tablero(), listarChequeos({ etapa: filtro }), gastoDelMes()]);`
  y agrega en `chq-stats`, después del de Improvement Completo:

```jsx
        <Stat valor={`US$${gasto.toFixed(2)}`} label="Gastado en IA (mes)" />
```

- [ ] **Step 8: Vista previa de portadas** `apps/admin/app/chequeos/muestra/route.js`:

```js
// Vista previa de la plantilla con datos de muestra, para que el dueño apruebe las 4 portadas antes de encender el
// motor: /chequeos/muestra?etapa=idea|arrancando|creciendo|consolidado. No toca la base ni la IA.
import { requirePlatformAdmin } from "@/lib/auth.js";
import { htmlChequeo } from "@/lib/motor/plantilla.js";
import { CHEQUEO_MUESTRA, EMPRENDEDOR_MUESTRA, contenidoMuestra } from "@/lib/motor/muestra.js";
import { ETAPAS_PROSPECTO } from "@/lib/chequeoDatos.js";

export async function GET(request) {
  await requirePlatformAdmin();
  const pedida = new URL(request.url).searchParams.get("etapa");
  const etapa = ETAPAS_PROSPECTO.includes(pedida) ? pedida : "creciendo";
  const c = etapa === "idea" ? EMPRENDEDOR_MUESTRA : CHEQUEO_MUESTRA;
  return new Response(htmlChequeo(c, contenidoMuestra(etapa)), { headers: { "content-type": "text/html; charset=utf-8" } });
}
```

- [ ] **Step 9: Gate** — `pnpm lint && pnpm typecheck && pnpm test` → todo en verde.

- [ ] **Step 10: Verify in the browser** (preview `admin`, el dueño ya tiene sesión):
  1. `http://localhost:3100/chequeos`: el stat "Gastado en IA (mes)" aparece y la consola no tiene errores.
  2. Página de Boreal: la sección "Para que Improvement lo arme" muestra los 7 campos de enlace y la nota. "El
     chequeo · Sin armar" muestra "Armar con Improvement". **No lo pulses**: sin `ANTHROPIC_API_KEY` terminaría en
     Error, y es gasto real.
  3. `http://localhost:3100/chequeos/muestra?etapa=idea` (y `arrancando`, `creciendo`, `consolidado`): las 6 páginas
     se ven con la marca, sin texto encimado. Toma una captura de cada portada.

- [ ] **Step 11: Commit**

```bash
git add apps/admin/app apps/admin/lib/chequeos.js apps/admin/tests/chequeos.test.js
git commit -m "feat(admin): armar, rehacer y aprobar el Chequeo desde el panel; disparo tras la entrevista"
```

---

### Task 9: Bocetos aprobados y prueba real con Boreal

Esta tarea la hace el ejecutor **con el dueño**. Nada se enciende sin su OK.

- [ ] **Step 1: Bocetos.** Con la skill `marca-jotapuntoce`, revisa las 4 portadas de `/chequeos/muestra` contra el
  checklist del manual (una sola firma, área de protección, proporción de color, tipografías, voz). Ajusta `PORTADAS` y
  `ESTILOS` en `plantilla.js` hasta que pasen. Enséñale las 4 capturas al dueño; lo que cambie se ajusta y vuelve a
  enseñarse. Commit: `feat(admin): portadas del Chequeo aprobadas por el dueño`.
- [ ] **Step 2: Variables.** El dueño agrega a `apps/admin/.env.local` su `ANTHROPIC_API_KEY` y, a `.env.example`
  (sin valores), estas tres líneas con su comentario:
  - `ANTHROPIC_API_KEY=`: motor del Chequeo en el panel;
  - `CHEQUEOS_MOTOR_TOPE_DIA=20`: armados automáticos por día;
  - `CHEQUEOS_MOTOR_AUTO=0`: 1 = armar solo tras la entrevista.

  Claude no lee ni edita archivos `.env*`. Luego reinicia el preview `admin`. Si el proveedor responde que web fetch no
  está habilitado, el dueño lo activa en la consola de Anthropic (configuración de la organización).
- [ ] **Step 3: Prueba real.** Con el OK explícito del dueño (cuesta dinero): en la página de Boreal, llena los enlaces
  (`https://borealslp.com`, su Instagram y su ficha de Google) y la nota de contexto de
  `Improvement\jotapuntoce\chequeos\chequeo-boreal.md` (notas internas). Luego pulsa "Armar con Improvement".
- [ ] **Step 4: Comparar.** Lee el borrador contra `Chequeo-Boreal.pdf` con el dueño: ¿encontró los mismos patógenos
  visibles (links rotos, precios ocultos, torneo sin repetir)? ¿Cada número trae su marca? ¿La voz es pull? Anota en
  la bitácora el costo real que salió. Lo que falle se corrige en `metodo.js` (subiendo `METODO_VERSION`) y se rehace,
  hasta que el dueño diga que llega al nivel.
- [ ] **Step 5: Encender.** Solo con el OK del dueño, él cambia `CHEQUEOS_MOTOR_AUTO=1` en `.env.local`.
- [ ] **Step 6: Cierre.** Actualiza el spec del motor:
  - sección 3: "salida JSON en texto validada con zod" (no `output_config.format`);
  - sección 8: la prueba real es el botón del panel sobre Boreal, no el script `motor:prueba`;
  - el interruptor `CHEQUEOS_MOTOR_AUTO`.

  Luego corre el gate y haz commit: `docs(chequeos): el spec del motor refleja lo construido`. Documenta el proceso con
  la skill `documentar-proceso`.
