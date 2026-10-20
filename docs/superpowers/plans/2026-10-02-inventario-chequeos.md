# Inventario de chequeos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inventario de chequeos en `apps/admin` (tablas, panel, compras, avisos por WhatsApp) y la puerta pública `/api/chequeos` para la landing.

**Architecture:** Dos tablas admin-only (`chequeo`, `chequeo_evento`) con RLS deny-all. Lógica pura (normalización y zod) en `lib/chequeoDatos.js`; lógica con base de datos en `lib/chequeos.js`, llamada por las rutas públicas (`app/api/chequeos/**`) y por Server Actions del panel (`app/chequeos/actions.js`, con `requirePlatformAdmin()`). Toda acción escribe un evento en la bitácora.

**Tech Stack:** Next.js 16 App Router (JS), Drizzle 0.45 + Postgres (Supabase), zod 4.5.4, Supabase Storage, Twilio REST (`lib/whatsapp.js`), Vitest 4.

**Spec:** `docs/superpowers/specs/2026-10-02-inventario-chequeos-design.md`

## Global Constraints

- Gate: `pnpm lint && pnpm typecheck && pnpm test` en verde antes de dar una tarea por hecha.
- Imports relativos con extensión explícita (`./chequeos.js`); alias `@/` → `apps/admin/`.
- Nunca editar a mano una migración generada; la de RLS se crea con `drizzle-kit generate --custom`.
- `SUPABASE_SERVICE_ROLE_KEY` solo vía `lib/db.js`, nunca en un archivo `"use client"`.
- Errores como resultados tipados: `{ ok: true, data } | { ok: false, error: { code, ... } }`.
- Tokens de diseño: solo `var(--…)` existentes, ningún hex nuevo.
- Números de teléfono y orígenes van en env (`AVISOS_WHATSAPP_A`, `CHEQUEOS_ORIGENES`), nunca en código.
- Las pruebas de integración corren contra el Supabase de desarrollo (`apps/admin/.env.test`) y limpian sus filas.

## Archivos

| Archivo | Responsabilidad |
|---|---|
| `packages/db/src/schema.ts` | tablas `chequeo`, `chequeoEvento` |
| `packages/db/migrations/0021_*.sql` (generada), `0022_chequeo_rls.sql` (custom) | esquema + RLS |
| `apps/admin/lib/chequeoDatos.js` | constantes, normalización, esquemas zod (sin DB) |
| `apps/admin/lib/chequeos.js` | todas las operaciones con DB, avisos, PDF, tablero |
| `apps/admin/app/api/chequeos/route.js` | `POST` registro, `OPTIONS` |
| `apps/admin/app/api/chequeos/[id]/route.js` | `PATCH` entrevista, `OPTIONS` |
| `apps/admin/lib/cors.js` | cabeceras CORS por `CHEQUEOS_ORIGENES` |
| `apps/admin/app/chequeos/page.js`, `[id]/page.js`, `actions.js` | panel |
| `apps/admin/components/brand/NavIcons.js`, `components/Sidebar.js` | entrada "Chequeos" |
| `apps/admin/app/clientes/*` | renombre de `app/prospects/*` |
| `apps/admin/tests/chequeoDatos.test.js`, `tests/chequeos.test.js` | pruebas |

---

### Task 1: Esquema y migraciones

**Files:** Modify `packages/db/src/schema.ts` (al final, después de `orgKpi`). Create migraciones con drizzle-kit.

**Produces:** `chequeo`, `chequeoEvento` exportados desde `@jotapuntoce/db/schema`.

- [ ] **Step 1: Agregar las tablas al esquema**

```ts
// Inventario de chequeos (etapa 0 del CRM de JotaPuntoCe): llegan desde la landing o los crea Jose Carlos. FUERA del
// alcance de RLS multi-tenant, igual que prospect_company: solo apps/admin con la service-role key. RLS activado sin
// políticas (migración 0022) para cerrar PostgREST. Spec: docs/superpowers/specs/2026-10-02-inventario-chequeos-design.md
export const chequeo = pgTable(
  "chequeo",
  {
    id: id(),
    origen: text("origen").notNull(),
    tipo: text("tipo").notNull(),
    nombre: text("nombre"),
    negocio: text("negocio"),
    // slug(negocio)|slug(ciudad) — la unicidad "un chequeo por negocio"; null para emprendedores.
    negocioClave: text("negocio_clave"),
    giro: text("giro").notNull(),
    ciudad: text("ciudad").notNull(),
    correo: text("correo"),
    telefono: text("telefono"),
    canal: text("canal").notNull(),
    canalDetalle: text("canal_detalle"),
    utm: jsonb("utm"),
    enlaces: jsonb("enlaces"),
    sinRedes: boolean("sin_redes").notNull().default(false),
    // [{pregunta, respuesta}] — la pregunta viaja con la respuesta para que cambiar las preguntas no rompa el pasado.
    respuestas: jsonb("respuestas"),
    entrevistaSegundos: integer("entrevista_segundos"),
    entrevistaAt: timestamp("entrevista_at", { withTimezone: true }),
    claveHash: text("clave_hash"),
    etapa: text("etapa").notNull().default("registrado"),
    abrePuerta: text("abre_puerta"),
    proximaAccion: text("proxima_accion"),
    proximaFecha: text("proxima_fecha"),
    notas: text("notas"),
    pdfPath: text("pdf_path"),
    aceptaAvisoAt: timestamp("acepta_aviso_at", { withTimezone: true }),
    aceptaCorreos: boolean("acepta_correos").notNull().default(false),
    aceptaCorreosAt: timestamp("acepta_correos_at", { withTimezone: true }),
    prospectClientId: uuid("prospect_client_id").references(() => prospectClient.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uq_chequeo_correo").on(t.correo).where(sql`${t.correo} is not null`),
    uniqueIndex("uq_chequeo_telefono").on(t.telefono).where(sql`${t.telefono} is not null`),
    uniqueIndex("uq_chequeo_negocio_clave").on(t.negocioClave).where(sql`${t.negocioClave} is not null`),
    check("chequeo_origen_check", sql`${t.origen} in ('landing','propio')`),
    check("chequeo_tipo_check", sql`${t.tipo} in ('negocio','emprendedor')`),
    check(
      "chequeo_canal_check",
      sql`${t.canal} in ('anuncio_meta','referido','summum','tiktok','youtube','anuncio_google','conferencia','webinar','live','reel','otro')`,
    ),
    check(
      "chequeo_etapa_check",
      sql`${t.etapa} in ('registrado','pedido','entregado','contacto','conversacion','diagnostico','propuesta','cliente','perdido')`,
    ),
  ],
);

// Bitácora append-only de cada chequeo: la materia prima de la cadena que diagnostica. Nunca se edita ni se borra.
export const chequeoEvento = pgTable(
  "chequeo_evento",
  {
    id: id(),
    chequeoId: uuid("chequeo_id")
      .notNull()
      .references(() => chequeo.id, { onDelete: "cascade" }),
    tipo: text("tipo").notNull(),
    autor: text("autor").notNull(),
    detalle: jsonb("detalle"),
    createdAt: createdAt(),
  },
  (t) => [
    index("idx_chequeo_evento_chequeo_id").on(t.chequeoId),
    check(
      "chequeo_evento_tipo_check",
      sql`${t.tipo} in ('registro','entrevista','etapa','correo','mensaje','llamada','nota','compra')`,
    ),
    check("chequeo_evento_autor_check", sql`${t.autor} in ('prospecto','jose_carlos','improvement')`),
  ],
);
```

(`proxima_fecha` como `text` ISO `YYYY-MM-DD`: evita el corrimiento de zona horaria documentado en `organizations/[orgId]/page.js`.)

- [ ] **Step 2: Generar la migración** — `pnpm db:generate`. Expected: nace `packages/db/migrations/0021_*.sql` con `CREATE TABLE "chequeo"` y `"chequeo_evento"`.
- [ ] **Step 3: Migración custom de RLS** — `pnpm --filter @jotapuntoce/db exec drizzle-kit generate --custom --name chequeo_rls`, y llenar el archivo vacío que crea:

```sql
-- chequeo y chequeo_evento son admin-only (service-role / rol dueño). RLS sin políticas = deny-all para anon y
-- authenticated: la anon key del navegador no puede leer ni escribir el inventario por PostgREST.
alter table chequeo enable row level security;
alter table chequeo_evento enable row level security;
```

- [ ] **Step 4: Aplicar** — `pnpm db:migrate`. Expected: sin errores.
- [ ] **Step 5: Typecheck** — `pnpm --filter @jotapuntoce/db typecheck`. Expected: PASS.
- [ ] **Step 6: Commit** — `git add packages/db && git commit -m "feat(db): tablas chequeo y chequeo_evento con RLS deny-all"`.

---

### Task 2: Datos puros — normalización y validación

**Files:** Create `apps/admin/lib/chequeoDatos.js`, `apps/admin/tests/chequeoDatos.test.js`. Modify `apps/admin/package.json` (`"zod": "^4.5.4"`), luego `pnpm install`.

**Produces:**
- `ETAPAS`, `ETAPA_LABEL`, `CANALES`, `CANAL_LABEL`, `PRODUCTOS`, `PRODUCTO_LABEL`, `ENLACES`, `RESULTADOS`
- `normalizarCorreo(s) -> string`, `normalizarTelefono(s) -> string`, `negocioClave({tipo, negocio, ciudad}) -> string|null`
- `registroSchema`, `entrevistaSchema`, `propioSchema`, `compraSchema`, `contactoSchema` (zod)
- `camposInvalidos(zodError) -> { [campo]: mensaje }`

- [ ] **Step 1: Prueba que falla**

```js
import { describe, expect, it } from "vitest";
import {
  normalizarCorreo,
  normalizarTelefono,
  negocioClave,
  registroSchema,
  entrevistaSchema,
  camposInvalidos,
} from "../lib/chequeoDatos.js";

const registro = {
  tipo: "negocio",
  nombre: "Ana López",
  negocio: "Boreal",
  giro: "club de pádel",
  correo: "Ana@Ejemplo.com ",
  telefono: "+52 444 123 4567",
  ciudad: "San Luis Potosí",
  canal: "reel",
  aceptaAviso: true,
  aceptaCorreos: true,
};

describe("normalización", () => {
  it("correo en minúsculas y sin espacios", () => {
    expect(normalizarCorreo("  Ana@Ejemplo.COM ")).toBe("ana@ejemplo.com");
  });
  it("teléfono: mismos 10 dígitos con o sin código de país", () => {
    expect(normalizarTelefono("+52 444 123 4567")).toBe("4441234567");
    expect(normalizarTelefono("521 444 123 4567")).toBe("4441234567");
    expect(normalizarTelefono("(444) 123-4567")).toBe("4441234567");
  });
  it("negocioClave ignora mayúsculas y acentos; null para emprendedor", () => {
    expect(negocioClave({ tipo: "negocio", negocio: "BOREAL", ciudad: "San Luis Potosí" })).toBe(
      negocioClave({ tipo: "negocio", negocio: "boreal", ciudad: "san luis potosi" }),
    );
    expect(negocioClave({ tipo: "emprendedor", negocio: "Mi idea", ciudad: "SLP" })).toBeNull();
  });
});

describe("registroSchema", () => {
  it("acepta un registro completo y normaliza", () => {
    const r = registroSchema.parse(registro);
    expect(r.correo).toBe("ana@ejemplo.com");
    expect(r.telefono).toBe("4441234567");
  });
  it("exige aceptar el aviso y el giro", () => {
    const r = registroSchema.safeParse({ ...registro, aceptaAviso: false, giro: "" });
    expect(r.success).toBe(false);
    expect(Object.keys(camposInvalidos(r.error)).sort()).toEqual(["aceptaAviso", "giro"]);
  });
  it("negocio obligatorio solo para tipo negocio", () => {
    expect(registroSchema.safeParse({ ...registro, negocio: "" }).success).toBe(false);
    expect(registroSchema.safeParse({ ...registro, tipo: "emprendedor", negocio: "" }).success).toBe(true);
  });
  it("rechaza un canal que no existe", () => {
    expect(registroSchema.safeParse({ ...registro, canal: "radio" }).success).toBe(false);
  });
});

describe("entrevistaSchema", () => {
  const base = {
    clave: "x".repeat(43),
    enlaces: {},
    sinRedes: false,
    respuestas: [1, 2, 3].map((n) => ({ pregunta: `P${n}`, respuesta: `R${n}` })),
  };
  it("exige un enlace o la casilla sin redes", () => {
    expect(entrevistaSchema.safeParse(base).success).toBe(false);
    expect(entrevistaSchema.safeParse({ ...base, sinRedes: true }).success).toBe(true);
    expect(entrevistaSchema.safeParse({ ...base, enlaces: { google: "https://g.co/x" } }).success).toBe(true);
  });
  it("exige exactamente 3 respuestas no vacías y las guarda como se escribieron", () => {
    const dos = { ...base, sinRedes: true, respuestas: base.respuestas.slice(0, 2) };
    expect(entrevistaSchema.safeParse(dos).success).toBe(false);
    const r = entrevistaSchema.parse({
      ...base,
      sinRedes: true,
      respuestas: [{ pregunta: "P", respuesta: "  hola K tal  " }, ...base.respuestas.slice(1)],
    });
    expect(r.respuestas[0].respuesta).toBe("hola K tal");
  });
  it("rechaza un enlace que no es URL", () => {
    expect(entrevistaSchema.safeParse({ ...base, enlaces: { instagram: "boreal" } }).success).toBe(false);
  });
});
```

- [ ] **Step 2:** `pnpm --filter @jotapuntoce/admin test tests/chequeoDatos.test.js` → FAIL (módulo no existe).
- [ ] **Step 3: Implementación**

```js
// Datos del inventario de chequeos sin base de datos: catálogos, normalización y validación (zod) del borde.
// Lo comparten la puerta pública (app/api/chequeos) y el panel (app/chequeos). Spec 2026-10-02.
import { z } from "zod";
import { slugify } from "./slugify.js";

export const ETAPAS = ["registrado", "pedido", "entregado", "contacto", "conversacion", "diagnostico", "propuesta", "cliente", "perdido"];
export const ETAPA_LABEL = {
  registrado: "Registrado",
  pedido: "Pedido",
  entregado: "Entregado",
  contacto: "Contacto",
  conversacion: "Conversación",
  diagnostico: "Diagnóstico",
  propuesta: "Propuesta",
  cliente: "Cliente",
  perdido: "Perdido",
};
export const CANALES = ["anuncio_meta", "referido", "summum", "tiktok", "youtube", "anuncio_google", "conferencia", "webinar", "live", "reel", "otro"];
export const CANAL_LABEL = {
  anuncio_meta: "Anuncio de Meta",
  referido: "Me recomendó un amigo",
  summum: "Summum System",
  tiktok: "TikTok",
  youtube: "YouTube",
  anuncio_google: "Anuncio de Google",
  conferencia: "Conferencia presencial",
  webinar: "Webinar",
  live: "Live",
  reel: "Reel",
  otro: "Otro",
};
export const PRODUCTOS = ["kit", "base", "diagnostico_360", "completo", "director", "acabados", "become", "otro"];
export const PRODUCTO_LABEL = {
  kit: "Kit Arranque",
  base: "Improvement Base",
  diagnostico_360: "Diagnóstico 360",
  completo: "Improvement Completo",
  director: "Improvement Director",
  acabados: "Acabados de lujo",
  become: "BECOME",
  otro: "Otro",
};
export const ENLACES = ["instagram", "youtube", "linkedin", "facebook", "tiktok", "sitio", "google"];
export const RESULTADOS = ["respondio", "sin_respuesta", "agendo", "no_le_interesa", "otro"];

export const normalizarCorreo = (s) => s.trim().toLowerCase();

/** Solo dígitos; quita el 52 (o 521) de México para que "+52 444…" y "444…" sean el mismo número. */
export function normalizarTelefono(s) {
  const d = s.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("521")) return d.slice(3);
  if (d.length === 12 && d.startsWith("52")) return d.slice(2);
  return d;
}

export function negocioClave({ tipo, negocio, ciudad }) {
  if (tipo !== "negocio" || !negocio) return null;
  return `${slugify(negocio)}|${slugify(ciudad)}`;
}

const texto = z.string().trim().min(1, "Obligatorio");
const opcional = z.string().trim().optional().transform((s) => s || null);

const base = {
  tipo: z.enum(["negocio", "emprendedor"]),
  negocio: opcional,
  giro: texto,
  ciudad: texto,
  canal: z.enum(CANALES),
  canalDetalle: opcional,
};

const conNegocio = (s) =>
  s.refine((d) => d.tipo !== "negocio" || d.negocio, { path: ["negocio"], message: "Obligatorio" });

export const registroSchema = conNegocio(
  z.object({
    ...base,
    nombre: texto,
    correo: z.string().trim().pipe(z.email("Correo inválido")).transform(normalizarCorreo),
    telefono: texto
      .transform(normalizarTelefono)
      .refine((t) => t.length >= 10 && t.length <= 15, "Teléfono inválido"),
    utm: z.record(z.string(), z.string()).optional(),
    aceptaAviso: z.literal(true, { message: "Hay que aceptar el aviso de privacidad" }),
    aceptaCorreos: z.boolean().default(false),
  }),
);

/** Chequeo creado por Jose Carlos: persona, correo y teléfono opcionales. */
export const propioSchema = conNegocio(
  z.object({
    ...base,
    nombre: opcional,
    correo: opcional.pipe(z.union([z.null(), z.email("Correo inválido")])).transform((c) => (c ? normalizarCorreo(c) : null)),
    telefono: opcional.transform((t) => (t ? normalizarTelefono(t) : null)),
    abrePuerta: opcional,
  }),
);

export const entrevistaSchema = z
  .object({
    clave: z.string().min(20),
    enlaces: z.partialRecord(z.enum(ENLACES), z.url("Enlace inválido")).default({}),
    sinRedes: z.boolean().default(false),
    respuestas: z.array(z.object({ pregunta: texto, respuesta: texto })).length(3, "Faltan respuestas"),
    entrevistaSegundos: z.number().int().nonnegative().optional(),
  })
  .refine((d) => d.sinRedes || Object.keys(d.enlaces).length > 0, {
    path: ["enlaces"],
    message: "Pon al menos un enlace o marca que tu negocio no tiene redes",
  });

export const compraSchema = z.object({
  producto: z.enum(PRODUCTOS),
  monto: z.coerce.number().int().nonnegative(),
});

export const contactoSchema = z.object({
  tipo: z.enum(["correo", "mensaje", "llamada", "nota"]),
  resultado: z.enum(RESULTADOS).optional(),
  nota: opcional,
});

/** { campo: mensaje } a partir de un ZodError — lo que la landing usa para marcar cada campo. */
export function camposInvalidos(error) {
  const campos = {};
  for (const issue of error.issues) {
    const campo = issue.path[0] ?? "_";
    campos[campo] ??= issue.message;
  }
  return campos;
}
```

- [ ] **Step 4:** correr la prueba → PASS. Si `z.partialRecord`/`z.literal(..., {message})` difieren en zod 4.5.4, ajustar contra `node_modules/zod` (no adivinar).
- [ ] **Step 5: Commit** — `git add apps/admin/lib/chequeoDatos.js apps/admin/tests/chequeoDatos.test.js apps/admin/package.json pnpm-lock.yaml && git commit -m "feat(admin): normalización y validación de chequeos" -m "Dependencia: zod, la misma versión que ya usa apps/improvement, para validar en el borde (regla 5 de CLAUDE.md)."`

---

### Task 3: Operaciones del inventario (DB)

**Files:** Create `apps/admin/lib/chequeos.js`, `apps/admin/tests/chequeos.test.js`.

**Consumes:** Task 1 (tablas), Task 2 (esquemas y catálogos).

**Produces (todas devuelven `{ok:true,data}|{ok:false,error:{code,...}}` salvo donde se indica):**
- `registrarChequeo(input) -> {ok, data:{id, clave}}` · errores `DATOS_INVALIDOS {campos}`, `YA_EXISTE {mensaje}`
- `guardarEntrevista(id, input) -> {ok}` · errores `DATOS_INVALIDOS`, `NO_ENCONTRADO`, `YA_ENVIADA`
- `crearChequeoPropio(input) -> {ok, data:{id}}`
- `cambiarEtapa(id, etapa, autor = "jose_carlos")`
- `anotarContacto(id, input)`
- `fijarProximaAccion(id, {accion, fecha})`
- `registrarCompra(id, input) -> {ok, data:{prospectClientId}}` · error `FALTAN_DATOS`
- `avisar(texto) -> Promise<{ok, reason?}>` (nunca lanza)
- `MENSAJE_YA_EXISTE` (string)

- [ ] **Step 1: Prueba que falla**

```js
// Integración contra el Supabase de desarrollo. Cada prueba borra lo que crea (cascade borra la bitácora).
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../lib/db.js";
import { chequeo, chequeoEvento, prospectClient } from "@jotapuntoce/db/schema";
import {
  registrarChequeo,
  guardarEntrevista,
  crearChequeoPropio,
  cambiarEtapa,
  registrarCompra,
  avisar,
} from "../lib/chequeos.js";

const marca = `t${Date.now()}`;
const ids = [];
const clientes = [];

beforeAll(() => {
  process.env.AVISOS_WHATSAPP_A = ""; // ninguna prueba manda WhatsApp de verdad
});

afterEach(async () => {
  if (ids.length) await db.delete(chequeo).where(inArray(chequeo.id, ids.splice(0)));
  if (clientes.length) await db.delete(prospectClient).where(inArray(prospectClient.id, clientes.splice(0)));
});

let n = 0;
function registro(extra = {}) {
  n += 1;
  return {
    tipo: "negocio",
    nombre: "Ana López",
    negocio: `Negocio ${marca} ${n}`,
    giro: "club de pádel",
    correo: `ana.${marca}.${n}@ejemplo.com`,
    telefono: `+52 ${String(1000000000 + Date.now() % 1e9 + n).slice(0, 10)}`,
    ciudad: "San Luis Potosí",
    canal: "reel",
    aceptaAviso: true,
    aceptaCorreos: true,
    ...extra,
  };
}

async function registrar(extra) {
  const r = await registrarChequeo(registro(extra));
  if (r.ok) ids.push(r.data.id);
  return r;
}

const entrevista = (clave, extra = {}) => ({
  clave,
  enlaces: { instagram: "https://instagram.com/boreal" },
  respuestas: [1, 2, 3].map((i) => ({ pregunta: `P${i}`, respuesta: `R${i}` })),
  entrevistaSegundos: 360,
  ...extra,
});

describe("registro", () => {
  it("guarda en registrado con su evento", async () => {
    const r = await registrar();
    expect(r.ok).toBe(true);
    const [fila] = await db.select().from(chequeo).where(eq(chequeo.id, r.data.id));
    expect(fila.etapa).toBe("registrado");
    expect(fila.claveHash).not.toBe(r.data.clave);
    const eventos = await db.select().from(chequeoEvento).where(eq(chequeoEvento.chequeoId, r.data.id));
    expect(eventos.map((e) => e.tipo)).toEqual(["registro"]);
  });

  it("un chequeo por correo, por teléfono y por negocio", async () => {
    const a = registro();
    const r1 = await registrarChequeo(a);
    ids.push(r1.data.id);
    const otro = registro();
    for (const dup of [
      { ...otro, correo: a.correo.toUpperCase() },
      { ...otro, telefono: a.telefono.replace("+52 ", "") },
      { ...otro, negocio: a.negocio.toUpperCase(), ciudad: "san luis potosi" },
    ]) {
      const r = await registrarChequeo(dup);
      expect(r.ok).toBe(false);
      expect(r.error.code).toBe("YA_EXISTE");
    }
  });

  it("dos emprendedores con la misma idea y distinto correo pasan", async () => {
    expect((await registrar({ tipo: "emprendedor", negocio: "La misma idea" })).ok).toBe(true);
    expect((await registrar({ tipo: "emprendedor", negocio: "La misma idea" })).ok).toBe(true);
  });

  it("datos inválidos dicen qué campo", async () => {
    const r = await registrarChequeo(registro({ correo: "no-es-correo" }));
    expect(r.error.code).toBe("DATOS_INVALIDOS");
    expect(r.error.campos.correo).toBeTruthy();
  });
});

describe("entrevista", () => {
  it("pasa a pedido con sus eventos", async () => {
    const { data } = await registrar();
    expect((await guardarEntrevista(data.id, entrevista(data.clave))).ok).toBe(true);
    const [fila] = await db.select().from(chequeo).where(eq(chequeo.id, data.id));
    expect(fila.etapa).toBe("pedido");
    expect(fila.entrevistaAt).toBeTruthy();
  });

  it("clave equivocada → NO_ENCONTRADO; dos veces → YA_ENVIADA", async () => {
    const { data } = await registrar();
    expect((await guardarEntrevista(data.id, entrevista("y".repeat(43)))).error.code).toBe("NO_ENCONTRADO");
    await guardarEntrevista(data.id, entrevista(data.clave));
    expect((await guardarEntrevista(data.id, entrevista(data.clave))).error.code).toBe("YA_ENVIADA");
  });

  it("sin enlaces ni casilla → DATOS_INVALIDOS", async () => {
    const { data } = await registrar();
    const r = await guardarEntrevista(data.id, entrevista(data.clave, { enlaces: {} }));
    expect(r.error.code).toBe("DATOS_INVALIDOS");
  });
});

describe("panel", () => {
  it("cambiar etapa escribe la bitácora", async () => {
    const { data } = await registrar();
    await cambiarEtapa(data.id, "contacto");
    const eventos = await db.select().from(chequeoEvento).where(eq(chequeoEvento.chequeoId, data.id));
    expect(eventos.find((e) => e.tipo === "etapa").detalle).toEqual({ de: "registrado", a: "contacto" });
  });

  it("compra sin correo falla; primera compra crea un cliente, la segunda no", async () => {
    const propio = await crearChequeoPropio({
      tipo: "negocio",
      negocio: `Propio ${marca}`,
      giro: "club de pádel",
      ciudad: "SLP",
      canal: "referido",
    });
    ids.push(propio.data.id);
    expect((await registrarCompra(propio.data.id, { producto: "diagnostico_360", monto: 7500 })).error.code).toBe(
      "FALTAN_DATOS",
    );

    const { data } = await registrar();
    const c1 = await registrarCompra(data.id, { producto: "diagnostico_360", monto: 7500 });
    clientes.push(c1.data.prospectClientId);
    const c2 = await registrarCompra(data.id, { producto: "completo", monto: 28000 });
    expect(c2.data.prospectClientId).toBe(c1.data.prospectClientId);
    const [fila] = await db.select().from(chequeo).where(eq(chequeo.id, data.id));
    expect(fila.etapa).toBe("cliente");
    const compras = (await db.select().from(chequeoEvento).where(eq(chequeoEvento.chequeoId, data.id))).filter(
      (e) => e.tipo === "compra",
    );
    expect(compras).toHaveLength(2);
  });

  it("avisar sin destino no lanza", async () => {
    await expect(avisar("hola")).resolves.toMatchObject({ ok: false });
  });
});
```

- [ ] **Step 2:** `pnpm --filter @jotapuntoce/admin test tests/chequeos.test.js` → FAIL (módulo no existe).
- [ ] **Step 3: Implementación**

```js
// Operaciones del inventario de chequeos. Sin guard adentro (mismo patrón que app/prospects/actions.js): el guard vive
// en el borde — requirePlatformAdmin() en app/chequeos/actions.js; la puerta pública (app/api/chequeos) no lleva sesión
// y se protege con CORS, trampa para bots y la clave del envío 2. Spec 2026-10-02.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { chequeo, chequeoEvento, prospectClient, prospectCompany } from "@jotapuntoce/db/schema";
import { db, supabaseAdmin } from "./db.js";
import { sendWhatsAppMessage } from "./whatsapp.js";
import {
  CANAL_LABEL,
  PRODUCTO_LABEL,
  camposInvalidos,
  compraSchema,
  contactoSchema,
  entrevistaSchema,
  negocioClave,
  propioSchema,
  registroSchema,
} from "./chequeoDatos.js";

export const MENSAJE_YA_EXISTE =
  "Ya hay un chequeo gratis con estos datos. Si crees que es un error, escríbenos por WhatsApp.";

const hash = (s) => createHash("sha256").update(s).digest("hex");
const invalido = (error) => ({ ok: false, error: { code: "DATOS_INVALIDOS", campos: camposInvalidos(error) } });
const yaExiste = { ok: false, error: { code: "YA_EXISTE", mensaje: MENSAJE_YA_EXISTE } };
const noEncontrado = { ok: false, error: { code: "NO_ENCONTRADO" } };
// drizzle envuelve el error de postgres-js en `cause`.
const esDuplicado = (e) => (e?.code ?? e?.cause?.code) === "23505";
const panelUrl = (id) => `${process.env.ADMIN_URL ?? "http://localhost:3100"}/chequeos/${id}`;

/** WhatsApp al dueño. Nunca lanza ni frena al que llama: el aviso también vive en la bitácora del panel. */
export async function avisar(texto) {
  const to = process.env.AVISOS_WHATSAPP_A;
  if (!to) return { ok: false, reason: "sin_destino" };
  try {
    return await sendWhatsAppMessage({ to, body: texto });
  } catch (e) {
    return { ok: false, reason: "error", detail: String(e) };
  }
}

const quien = (c) => [c.nombre, c.negocio].filter(Boolean).join(" · ") || "Sin nombre";

async function insertarChequeo(valores, autor) {
  try {
    return await db.transaction(async (tx) => {
      const [fila] = await tx.insert(chequeo).values(valores).returning();
      await tx.insert(chequeoEvento).values({ chequeoId: fila.id, tipo: "registro", autor });
      return { ok: true, fila };
    });
  } catch (e) {
    if (esDuplicado(e)) return yaExiste;
    throw e;
  }
}

/** Envío 1 de la landing. Devuelve la clave del envío 2 una sola vez; en la base solo queda su hash. */
export async function registrarChequeo(input) {
  const p = registroSchema.safeParse(input);
  if (!p.success) return invalido(p.error);
  const d = p.data;
  const clave = randomBytes(32).toString("base64url");
  const ahora = new Date();
  const r = await insertarChequeo(
    {
      origen: "landing",
      tipo: d.tipo,
      nombre: d.nombre,
      negocio: d.negocio,
      negocioClave: negocioClave(d),
      giro: d.giro,
      ciudad: d.ciudad,
      correo: d.correo,
      telefono: d.telefono,
      canal: d.canal,
      canalDetalle: d.canalDetalle,
      utm: d.utm ?? null,
      claveHash: hash(clave),
      aceptaAvisoAt: ahora,
      aceptaCorreos: d.aceptaCorreos,
      aceptaCorreosAt: d.aceptaCorreos ? ahora : null,
    },
    "prospecto",
  );
  if (!r.ok) return r;
  await avisar(
    `🧠 Chequeo nuevo: ${quien(d)} (${d.giro}, ${d.ciudad}) · llegó por ${CANAL_LABEL[d.canal]} · ${panelUrl(r.fila.id)}`,
  );
  return { ok: true, data: { id: r.fila.id, clave } };
}

/** Envío 2 de la landing: la entrevista. Id inexistente y clave equivocada dan el mismo error. */
export async function guardarEntrevista(id, input) {
  const p = entrevistaSchema.safeParse(input);
  if (!p.success) return invalido(p.error);
  const d = p.data;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return noEncontrado;

  const [fila] = await db.select().from(chequeo).where(eq(chequeo.id, id)).limit(1);
  const a = Buffer.from(fila?.claveHash ?? "");
  const b = Buffer.from(hash(d.clave));
  if (!fila || a.length !== b.length || !timingSafeEqual(a, b)) return noEncontrado;
  if (fila.etapa !== "registrado") return { ok: false, error: { code: "YA_ENVIADA" } };

  const ahora = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(chequeo)
      .set({
        enlaces: d.enlaces,
        sinRedes: d.sinRedes,
        respuestas: d.respuestas,
        entrevistaSegundos: d.entrevistaSegundos ?? null,
        entrevistaAt: ahora,
        etapa: "pedido",
        updatedAt: ahora,
      })
      .where(and(eq(chequeo.id, id), eq(chequeo.etapa, "registrado")));
    await tx.insert(chequeoEvento).values([
      { chequeoId: id, tipo: "entrevista", autor: "prospecto", detalle: { segundos: d.entrevistaSegundos ?? null } },
      { chequeoId: id, tipo: "etapa", autor: "prospecto", detalle: { de: "registrado", a: "pedido" } },
    ]);
  });

  const dias = Math.floor((ahora - fila.createdAt) / 86_400_000);
  const cuando = dias === 0 ? "el mismo día" : `${dias} día(s) después del registro`;
  const minutos = d.entrevistaSegundos ? `, en ${Math.max(1, Math.round(d.entrevistaSegundos / 60))} min` : "";
  await avisar(`✅ ${quien(fila)} contestó la entrevista (${cuando}${minutos}) · ${panelUrl(id)}`);
  return { ok: true, data: null };
}

/** Chequeo que hace Jose Carlos (o que le pide a Improvement). Entra en `pedido`. */
export async function crearChequeoPropio(input) {
  const p = propioSchema.safeParse(input);
  if (!p.success) return invalido(p.error);
  const d = p.data;
  const r = await insertarChequeo(
    {
      origen: "propio",
      tipo: d.tipo,
      nombre: d.nombre,
      negocio: d.negocio,
      negocioClave: negocioClave(d),
      giro: d.giro,
      ciudad: d.ciudad,
      correo: d.correo,
      telefono: d.telefono,
      canal: d.canal,
      canalDetalle: d.canalDetalle,
      abrePuerta: d.abrePuerta,
      etapa: "pedido",
    },
    "jose_carlos",
  );
  return r.ok ? { ok: true, data: { id: r.fila.id } } : r;
}

/** `cliente` no se pone a mano: sale de registrarCompra. */
export async function cambiarEtapa(id, etapa, autor = "jose_carlos") {
  if (etapa === "cliente") return { ok: false, error: { code: "USA_COMPRA" } };
  const [fila] = await db.select().from(chequeo).where(eq(chequeo.id, id)).limit(1);
  if (!fila) return noEncontrado;
  if (fila.etapa === etapa) return { ok: true, data: null };
  await db.transaction(async (tx) => {
    await tx.update(chequeo).set({ etapa, updatedAt: new Date() }).where(eq(chequeo.id, id));
    await tx.insert(chequeoEvento).values({ chequeoId: id, tipo: "etapa", autor, detalle: { de: fila.etapa, a: etapa } });
  });
  return { ok: true, data: null };
}

export async function anotarContacto(id, input) {
  const p = contactoSchema.safeParse(input);
  if (!p.success) return invalido(p.error);
  const { tipo, resultado, nota } = p.data;
  await db.insert(chequeoEvento).values({
    chequeoId: id,
    tipo,
    autor: "jose_carlos",
    detalle: { resultado: resultado ?? null, nota },
  });
  return { ok: true, data: null };
}

export async function fijarProximaAccion(id, { accion, fecha }) {
  await db
    .update(chequeo)
    .set({ proximaAccion: accion || null, proximaFecha: fecha || null, updatedAt: new Date() })
    .where(eq(chequeo.id, id));
  return { ok: true, data: null };
}

const e164 = (tel) => (tel.length === 10 ? `+52${tel}` : `+${tel}`);

/**
 * Registra una compra. La primera vuelve al prospecto cliente: etapa `cliente` y su ficha en Clientes (una sola vez,
 * en la misma transacción). Inserta directo en prospect_client/prospect_company en vez de llamar createProspectClient()
 * para que la ficha y el chequeo queden en una sola transacción.
 */
export async function registrarCompra(id, input) {
  const p = compraSchema.safeParse(input);
  if (!p.success) return invalido(p.error);
  const { producto, monto } = p.data;
  const [fila] = await db.select().from(chequeo).where(eq(chequeo.id, id)).limit(1);
  if (!fila) return noEncontrado;
  if (!fila.correo || !fila.telefono || !fila.nombre) {
    return { ok: false, error: { code: "FALTAN_DATOS", mensaje: "Para volverlo cliente faltan nombre, correo o teléfono." } };
  }

  const prospectClientId = await db.transaction(async (tx) => {
    let clienteId = fila.prospectClientId;
    if (!clienteId) {
      const [cliente] = await tx
        .insert(prospectClient)
        .values({ fullName: fila.nombre, email: fila.correo, whatsappPhone: e164(fila.telefono) })
        .returning();
      await tx.insert(prospectCompany).values({
        prospectClientId: cliente.id,
        name: fila.negocio ?? fila.giro,
        industry: fila.giro,
        notes: `Llegó por el chequeo (${CANAL_LABEL[fila.canal]}).`,
      });
      clienteId = cliente.id;
    }
    await tx
      .update(chequeo)
      .set({ etapa: "cliente", prospectClientId: clienteId, updatedAt: new Date() })
      .where(eq(chequeo.id, id));
    await tx.insert(chequeoEvento).values({ chequeoId: id, tipo: "compra", autor: "jose_carlos", detalle: { producto, monto } });
    if (fila.etapa !== "cliente") {
      await tx
        .insert(chequeoEvento)
        .values({ chequeoId: id, tipo: "etapa", autor: "jose_carlos", detalle: { de: fila.etapa, a: "cliente" } });
    }
    return clienteId;
  });

  const pesos = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(monto);
  await avisar(`💰 Compra: ${quien(fila)} · ${PRODUCTO_LABEL[producto]} · ${pesos} · ${panelUrl(id)}`);
  return { ok: true, data: { prospectClientId } };
}

// ---- PDF (bucket privado de Supabase Storage) ----

const BUCKET = "chequeos";

export async function guardarPdf(id, archivo) {
  if (archivo.type !== "application/pdf") return { ok: false, error: { code: "NO_ES_PDF" } };
  await supabaseAdmin.storage.createBucket(BUCKET, { public: false }).catch(() => {}); // ya existe → ignora
  const ruta = `${id}/${Date.now()}.pdf`;
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(ruta, Buffer.from(await archivo.arrayBuffer()), { contentType: "application/pdf" });
  if (error) return { ok: false, error: { code: "STORAGE", mensaje: error.message } };
  await db.update(chequeo).set({ pdfPath: ruta, updatedAt: new Date() }).where(eq(chequeo.id, id));
  return { ok: true, data: { ruta } };
}

/** Enlace firmado de 10 minutos, generado al abrir la página del chequeo. */
export async function urlPdf(ruta) {
  if (!ruta) return null;
  const { data } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(ruta, 600);
  return data?.signedUrl ?? null;
}

// ---- Lecturas del panel ----

export async function getChequeo(id) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [fila] = await db.select().from(chequeo).where(eq(chequeo.id, id)).limit(1);
  if (!fila) return null;
  const eventos = await db
    .select()
    .from(chequeoEvento)
    .where(eq(chequeoEvento.chequeoId, id))
    .orderBy(desc(chequeoEvento.createdAt));
  return { ...fila, eventos };
}
```

- [ ] **Step 4:** correr la prueba → PASS.
- [ ] **Step 5: Commit** — `git add apps/admin/lib/chequeos.js apps/admin/tests/chequeos.test.js && git commit -m "feat(admin): registro, entrevista, compras y avisos de chequeos"`.

---

### Task 4: Tablero y lista

**Files:** Modify `apps/admin/lib/chequeos.js` (agregar `listarChequeos`, `tablero`), `apps/admin/tests/chequeos.test.js`.

**Produces:**
- `listarChequeos({ etapa }?) -> Array<chequeo & { ultimoMovimiento: Date }>` (más nuevo primero)
- `tablero() -> { total, sinEntrevista, porEtapa: {etapa: n}, escalera: { algo, diagnostico, completo } (conteos), porCanal: Array<{canal, total, compraron, completo}>, avisos: Array<evento & {chequeo}> }`

- [ ] **Step 1: Prueba**

```js
import { listarChequeos, tablero } from "../lib/chequeos.js";

describe("tablero", () => {
  it("cuenta la escalera de compras y por canal", async () => {
    const { data } = await registrar({ canal: "tiktok" });
    const c = await registrarCompra(data.id, { producto: "completo", monto: 28000 });
    clientes.push(c.data.prospectClientId);
    const t = await tablero();
    expect(t.total).toBeGreaterThanOrEqual(1);
    expect(t.escalera.completo).toBeGreaterThanOrEqual(1);
    expect(t.porCanal.find((x) => x.canal === "tiktok").completo).toBeGreaterThanOrEqual(1);
    const lista = await listarChequeos({ etapa: "cliente" });
    expect(lista.find((x) => x.id === data.id).ultimoMovimiento).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 2:** correr → FAIL.
- [ ] **Step 3: Implementación** (agregar a `lib/chequeos.js`; dos lecturas completas y agrupado en memoria, mismo criterio que `app/planos/page.js`)

```js
// ponytail: lee las dos tablas completas; con miles de chequeos pasar a group by en SQL.
async function todo() {
  const [chequeos, eventos] = await Promise.all([
    db.select().from(chequeo).orderBy(desc(chequeo.createdAt)),
    db.select().from(chequeoEvento).orderBy(desc(chequeoEvento.createdAt)),
  ]);
  return { chequeos, eventos };
}

export async function listarChequeos({ etapa } = {}) {
  const { chequeos, eventos } = await todo();
  const ultimo = new Map();
  for (const e of eventos) if (!ultimo.has(e.chequeoId)) ultimo.set(e.chequeoId, e.createdAt);
  return chequeos
    .filter((c) => !etapa || c.etapa === etapa)
    .map((c) => ({ ...c, ultimoMovimiento: ultimo.get(c.id) ?? c.createdAt }));
}

export async function tablero() {
  const { chequeos, eventos } = await todo();
  const compras = new Map(); // chequeoId → Set(producto)
  for (const e of eventos) {
    if (e.tipo !== "compra") continue;
    if (!compras.has(e.chequeoId)) compras.set(e.chequeoId, new Set());
    compras.get(e.chequeoId).add(e.detalle?.producto);
  }
  const compro = (c, producto) => compras.get(c.id)?.has(producto) ?? false;
  const porEtapa = {};
  const canales = new Map();
  for (const c of chequeos) {
    porEtapa[c.etapa] = (porEtapa[c.etapa] ?? 0) + 1;
    const k = canales.get(c.canal) ?? { canal: c.canal, total: 0, compraron: 0, completo: 0 };
    k.total += 1;
    if (compras.has(c.id)) k.compraron += 1;
    if (compro(c, "completo")) k.completo += 1;
    canales.set(c.canal, k);
  }
  const porId = new Map(chequeos.map((c) => [c.id, c]));
  return {
    total: chequeos.length,
    sinEntrevista: porEtapa.registrado ?? 0,
    porEtapa,
    escalera: {
      algo: compras.size,
      diagnostico: chequeos.filter((c) => compro(c, "diagnostico_360")).length,
      completo: chequeos.filter((c) => compro(c, "completo")).length,
    },
    porCanal: [...canales.values()].sort((a, b) => b.total - a.total),
    avisos: eventos
      .filter((e) => ["registro", "entrevista", "compra"].includes(e.tipo))
      .slice(0, 8)
      .map((e) => ({ ...e, chequeo: porId.get(e.chequeoId) })),
  };
}
```

- [ ] **Step 4:** correr → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(admin): tablero y lista de chequeos"`.

---

### Task 5: Puerta pública `/api/chequeos`

**Files:** Create `apps/admin/lib/cors.js`, `apps/admin/app/api/chequeos/route.js`, `apps/admin/app/api/chequeos/[id]/route.js`. Test: `apps/admin/tests/chequeos.test.js`.

**Consumes:** `registrarChequeo`, `guardarEntrevista` (Task 3).

- [ ] **Step 1: Prueba**

```js
import { POST } from "../app/api/chequeos/route.js";
import { PATCH } from "../app/api/chequeos/[id]/route.js";

const ORIGEN = "https://www.jotapuntoce.com";
const pedir = (body, origin = ORIGEN, method = "POST") =>
  new Request("http://localhost/api/chequeos", {
    method,
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });

describe("api", () => {
  beforeAll(() => {
    process.env.CHEQUEOS_ORIGENES = `${ORIGEN},http://localhost:4400`;
  });

  it("registro 201, duplicado 409, origen ajeno 403", async () => {
    const body = registro();
    const r = await POST(pedir(body));
    expect(r.status).toBe(201);
    expect(r.headers.get("access-control-allow-origin")).toBe(ORIGEN);
    const { data } = await r.json();
    ids.push(data.id);
    expect((await POST(pedir(body))).status).toBe(409);
    expect((await POST(pedir(registro(), "https://malo.com"))).status).toBe(403);
    expect((await POST(pedir(registro({ correo: "x" })))).status).toBe(400);
  });

  it("trampa llena → 201 y nada guardado", async () => {
    const body = registro({ sitio_web: "http://spam" });
    const r = await POST(pedir(body));
    expect(r.status).toBe(201);
    const filas = await db.select().from(chequeo).where(eq(chequeo.correo, body.correo));
    expect(filas).toHaveLength(0);
  });

  it("entrevista 200 y luego 409", async () => {
    const { data } = await registrar();
    const ctx = { params: Promise.resolve({ id: data.id }) };
    expect((await PATCH(pedir(entrevista(data.clave), ORIGEN, "PATCH"), ctx)).status).toBe(200);
    expect((await PATCH(pedir(entrevista(data.clave), ORIGEN, "PATCH"), ctx)).status).toBe(409);
  });
});
```

- [ ] **Step 2:** correr → FAIL.
- [ ] **Step 3: Implementación**

`apps/admin/lib/cors.js`:

```js
// CORS de la puerta pública de chequeos: solo los orígenes de CHEQUEOS_ORIGENES (coma-separados) — la landing.
// Se lee en cada llamada para que el cambio de env (y las pruebas) no dependan del momento del import.
export function origenPermitido(request) {
  const origin = request.headers.get("origin");
  const permitidos = (process.env.CHEQUEOS_ORIGENES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return origin && permitidos.includes(origin) ? origin : null;
}

export function responder(origin, status, body, metodos = "POST, PATCH, OPTIONS") {
  const headers = { "content-type": "application/json", vary: "Origin" };
  if (origin) {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-methods"] = metodos;
    headers["access-control-allow-headers"] = "content-type";
  }
  return new Response(body === null ? null : JSON.stringify(body), { status, headers });
}

export function preflight(request) {
  const origin = origenPermitido(request);
  return responder(origin, origin ? 204 : 403, null);
}

/** Origen + JSON, o la respuesta de error ya armada. */
export async function leer(request) {
  const origin = origenPermitido(request);
  if (!origin) return { error: responder(null, 403, { ok: false, error: { code: "ORIGEN" } }) };
  try {
    return { origin, body: await request.json() };
  } catch {
    return { error: responder(origin, 400, { ok: false, error: { code: "DATOS_INVALIDOS", campos: {} } }) };
  }
}
```

`apps/admin/app/api/chequeos/route.js`:

```js
// Envío 1 de la landing: registro del chequeo gratis. Ruta pública (sin requirePlatformAdmin): la protegen CORS,
// la trampa `sitio_web` y la unicidad de la base. Contrato: Improvement\jotapuntoce\landing\chequeo-api.md.
import { randomUUID } from "node:crypto";
import { leer, preflight, responder } from "@/lib/cors.js";
import { registrarChequeo } from "@/lib/chequeos.js";

const STATUS = { DATOS_INVALIDOS: 400, YA_EXISTE: 409 };

export const OPTIONS = preflight;

export async function POST(request) {
  const { origin, body, error } = await leer(request);
  if (error) return error;
  // Un bot llenó el campo invisible: se le contesta "listo" y no se guarda nada.
  if (body?.sitio_web) return responder(origin, 201, { ok: true, data: { id: randomUUID(), clave: randomUUID() } });
  const r = await registrarChequeo(body);
  return responder(origin, r.ok ? 201 : STATUS[r.error.code] ?? 400, r);
}
```

`apps/admin/app/api/chequeos/[id]/route.js`:

```js
// Envío 2 de la landing: la entrevista, con la clave que devolvió el envío 1.
import { leer, preflight, responder } from "@/lib/cors.js";
import { guardarEntrevista } from "@/lib/chequeos.js";

const STATUS = { DATOS_INVALIDOS: 400, NO_ENCONTRADO: 404, YA_ENVIADA: 409 };

export const OPTIONS = preflight;

export async function PATCH(request, { params }) {
  const { origin, body, error } = await leer(request);
  if (error) return error;
  const { id } = await params;
  const r = await guardarEntrevista(id, body);
  return responder(origin, r.ok ? 200 : STATUS[r.error.code] ?? 400, r);
}
```

- [ ] **Step 4:** correr → PASS.
- [ ] **Step 5: Commit** — `git add apps/admin/lib/cors.js apps/admin/app/api apps/admin/tests && git commit -m "feat(admin): puerta pública /api/chequeos para la landing"`.

---

### Task 6: Panel — acciones, lista y detalle

**Files:** Create `apps/admin/app/chequeos/actions.js`, `apps/admin/app/chequeos/page.js`, `apps/admin/app/chequeos/[id]/page.js`. Modify `apps/admin/components/brand/NavIcons.js` (`ChequeosIcon`), `apps/admin/components/Sidebar.js`.

**Consumes:** todo `lib/chequeos.js` y catálogos de `lib/chequeoDatos.js`.

- [ ] **Step 1: Server Actions**

```js
"use server";
// Borde del panel de chequeos: guard + FormData → lib/chequeos.js.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth.js";
import {
  anotarContacto,
  cambiarEtapa,
  crearChequeoPropio,
  fijarProximaAccion,
  guardarPdf,
  registrarCompra,
} from "@/lib/chequeos.js";

const campos = (fd) => Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string"));

export async function crearPropioAction(_prev, fd) {
  await requirePlatformAdmin();
  const r = await crearChequeoPropio(campos(fd));
  if (!r.ok) return r;
  revalidatePath("/chequeos");
  redirect(`/chequeos/${r.data.id}`);
}

async function enChequeo(id, fn) {
  await requirePlatformAdmin();
  const r = await fn();
  revalidatePath(`/chequeos/${id}`);
  revalidatePath("/chequeos");
  return r;
}

export const cambiarEtapaAction = async (id, _prev, fd) => enChequeo(id, () => cambiarEtapa(id, fd.get("etapa")));
export const anotarContactoAction = async (id, _prev, fd) => enChequeo(id, () => anotarContacto(id, campos(fd)));
export const proximaAccionAction = async (id, _prev, fd) =>
  enChequeo(id, () => fijarProximaAccion(id, { accion: fd.get("accion"), fecha: fd.get("fecha") }));
export const compraAction = async (id, _prev, fd) => enChequeo(id, () => registrarCompra(id, campos(fd)));
export const pdfAction = async (id, _prev, fd) => enChequeo(id, () => guardarPdf(id, fd.get("pdf")));
```

Los formularios usan `useActionState` en un componente cliente pequeño para mostrar el error (`r.error.mensaje` o los `campos`). Crear `apps/admin/components/chequeos/Formulario.js`:

```js
"use client";
import { useActionState } from "react";

// Formulario con mensaje de error del resultado tipado ({ok:false, error}) — la única pieza cliente del panel de chequeos.
export default function Formulario({ action, children, className, style }) {
  const [estado, enviar, enviando] = useActionState(action, null);
  const error = estado && !estado.ok ? estado.error : null;
  return (
    <form action={enviar} className={className} style={style}>
      {children}
      {error && (
        <p className="empty-hint" style={{ color: "var(--danger)", margin: 0 }}>
          {error.mensaje ?? Object.entries(error.campos ?? {}).map(([c, m]) => `${c}: ${m}`).join(" · ") ?? error.code}
        </p>
      )}
      {enviando && <p className="topbar-subtitle" style={{ margin: 0 }}>Guardando…</p>}
    </form>
  );
}
```

(Actualizar `Files` de esta tarea con `components/chequeos/Formulario.js`.)

- [ ] **Step 2: `/chequeos/page.js`** — Server Component: `requirePlatformAdmin()`, `tablero()` y `listarChequeos({ etapa })` desde `await searchParams`. Estructura (clases existentes: `page-stack`, `toolbar`, `page-back-link`, `product-card`, `category-chip`, `wall-label`, `input`, `btn btn-primary`, `empty-hint`):
  - Toolbar "← Recepción", `<h2>Chequeos</h2>`, subtítulo "El embudo de JotaPuntoCe: del chequeo gratis a Improvement Completo."
  - **Avisos** (`t.avisos`): una línea por evento: "🧠 Chequeo nuevo / ✅ Entrevista / 💰 Compra · {quien} · {fecha}" con `<Link href={/chequeos/id}>`.
  - **Tablero:** fila de tarjetas: Total `t.total` · Sin entrevista `t.sinEntrevista` · Compraron algo `pct(algo)` · Diagnóstico 360 `pct(diagnostico)` · **Improvement Completo `pct(completo)`** (la tarjeta grande). `pct = (n) => t.total ? Math.round((n / t.total) * 100) + "%" : "—"`, con el conteo debajo.
  - **Por etapa:** chips-enlace `?etapa=x` con `ETAPA_LABEL[x]` y el conteo; "Todas" limpia el filtro.
  - **Por canal:** tabla canal · llegaron · compraron · Completo.
  - **+ Chequeo propio:** `<details>` con `Formulario action={crearPropioAction}`: select tipo (negocio/emprendedor), negocio, giro*, ciudad*, select canal (de `CANALES`), canalDetalle, nombre, correo, teléfono, abrePuerta.
  - **Lista:** una `product-card` por chequeo con enlace al detalle: `negocio ?? "Idea: " + giro`, `giro · ciudad`, nombre, `CANAL_LABEL`, chip de etapa (si `pedido` y `pdfPath` → "Listo para entregar"), próxima acción + fecha, "N días sin movimiento" (`Math.floor((Date.now() - ultimoMovimiento) / 86400000)`).

- [ ] **Step 3: `/chequeos/[id]/page.js`** — `requirePlatformAdmin()`, `getChequeo(id)` (`notFound()` si null), `urlPdf(c.pdfPath)`. Secciones:
  - Encabezado: negocio/idea, giro · ciudad, origen, chip de etapa, enlace "Ver en Clientes" si `prospectClientId` (`/clientes`).
  - **Datos:** nombre, correo, teléfono, canal (+detalle), UTM, quién abre la puerta, acepta correos.
  - **Su tiempo:** "Se registró el {fecha}" + si `entrevistaAt`: "contestó la entrevista {N días después | el mismo día}, en {min} min".
  - **Enlaces** (`a target="_blank" rel="noreferrer"`) o "Marcó que su negocio no tiene redes".
  - **Respuestas:** pregunta en negritas, respuesta en `<p style={{whiteSpace:"pre-wrap"}}>` tal cual.
  - **El chequeo:** si hay URL → `<iframe src={url} title="Chequeo" style={{width:"100%",height:"80vh",border:"1px solid var(--border)",borderRadius:"var(--radius-md)"}} />`; si no, "Todavía sin PDF". Formulario `pdfAction.bind(null, id)` con `<input type="file" name="pdf" accept="application/pdf" required>`.
  - **Acciones:** formularios con `.bind(null, id)`: etapa (select de `ETAPAS` sin `cliente`), contacto (tipo, resultado de `RESULTADOS`, nota), próxima acción (texto + `<input type="date">`), compra (select `PRODUCTOS` con `PRODUCTO_LABEL`, monto number).
  - **Bitácora:** lista de `c.eventos`: fecha · tipo · autor · detalle legible (`etapa`: "de X a Y"; `compra`: producto y monto; contacto: resultado y nota).

- [ ] **Step 4: Menú** — en `NavIcons.js` agregar `ChequeosIcon` (sobre de regalo en trazo fino con el hilo en el moño):

```js
// Chequeos: el regalo (el chequeo gratis); el moño lleva el hilo.
export function ChequeosIcon(props) {
  return (
    <Icono {...props}>
      <defs>
        <Hilo id="jc-hilo-chequeos" x1="8" x2="16" />
      </defs>
      <g {...trazo}>
        <rect x="3.5" y="9" width="17" height="11.5" rx="1.4" />
        <path d="M2.8 9h18.4M12 9v11.5" />
      </g>
      <path d="M12 8.6c-1.2-2.6-4.4-3.4-4.4-1.4 0 1.3 2.4 1.4 4.4 1.4 2-.0 4.4-.1 4.4-1.4 0-2-3.2-1.2-4.4 1.4" stroke="url(#jc-hilo-chequeos)" strokeWidth="1.4" strokeLinecap="round" fill="none" />
    </Icono>
  );
}
```

y en `Sidebar.js`, después de Planos: `{ href: "/chequeos", label: "Chequeos", sub: "Del chequeo al cliente", Icon: ChequeosIcon }`.

- [ ] **Step 5: Verificar en el navegador** — `preview_start` del admin (agregar a `.claude/launch.json` si no existe: `pnpm dev:admin`, puerto 3100). El dueño inicia sesión él mismo. Revisar `/chequeos` y un detalle; consola sin errores; captura.
- [ ] **Step 6:** `pnpm lint` → PASS. **Commit** — `git add apps/admin && git commit -m "feat(admin): apartado Chequeos con tablero, detalle, bitácora y compras"`.

---

### Task 7: Renombre Prospectos → Clientes

**Files:** Move `apps/admin/app/prospects/` → `apps/admin/app/clientes/`. Modify `apps/admin/app/improvement/page.js:70`, `apps/admin/tests/prospects.test.js` (import), y los `revalidatePath("/prospects")`.

- [ ] **Step 1:** `git mv apps/admin/app/prospects apps/admin/app/clientes`
- [ ] **Step 2:** reemplazar `"/prospects"` → `"/clientes"` en `app/clientes/page.js`, `app/improvement/page.js`; en `tests/prospects.test.js` el import `../app/prospects/actions.js` → `../app/clientes/actions.js`.
- [ ] **Step 3:** textos visibles: `<h2>Backlog de prospectos</h2>` → `<h2>Clientes</h2>`; subtítulo → "Quien ya compró algo: cliente → empresa(s) → en construcción → live."; el texto del enlace en `improvement/page.js` que diga "prospectos" → "Clientes". Las tablas `prospect_*` no cambian.
- [ ] **Step 4:** `grep -rn "prospects" apps/admin/app apps/admin/components` → solo nombres de tabla/variables, ninguna ruta.
- [ ] **Step 5:** `pnpm --filter @jotapuntoce/admin test` → PASS. **Commit** — `git commit -am "refactor(admin): Prospectos se llama Clientes"`.

---

### Task 8: Hoja para la landing, env y cierre

**Files:** Create `C:\Users\charl\OneDrive\Documentos\JotaPuntoCe\Improvement\jotapuntoce\landing\chequeo-api.md`. Modify `.env.example` (si el permiso deja leerlo; si no, se le pide al dueño agregar las dos líneas).

- [ ] **Step 1: `.env.example`** — agregar:

```
# Chequeos (apps/admin) — orígenes que pueden llamar a /api/chequeos, separados por coma
CHEQUEOS_ORIGENES=https://www.jotapuntoce.com,http://localhost:4400
# WhatsApp al que llegan los avisos de chequeos y compras (E.164)
AVISOS_WHATSAPP_A=
# URL pública del admin, para los enlaces de los avisos
ADMIN_URL=http://localhost:3100
```

- [ ] **Step 2: `chequeo-api.md`** — el contrato de la spec (sección "Puerta de entrada") en lenguaje para el chat de la landing: los dos envíos con ejemplo de `fetch`, todos los campos con sus valores permitidos (`CANALES`, `ENLACES`), las respuestas (201/200/400/404/409/403) y qué mostrar en cada una, el campo trampa `sitio_web` oculto con CSS (no `type="hidden"`), la casilla del aviso de privacidad y la de correos, cómo medir `entrevistaSegundos`, y cómo leer `utm_*` de `location.search`. Mientras el admin no esté publicado: `http://localhost:3100`.
- [ ] **Step 3: Gate completo** — `pnpm lint && pnpm typecheck && pnpm test` → todo PASS.
- [ ] **Step 4: Commit** — `git add .env.example && git commit -m "chore: variables de chequeos en .env.example"`.
- [ ] **Step 5: Boreal** — lo da de alta el dueño desde "+ Chequeo propio" (requiere su sesión) y sube `Chequeo-Boreal.pdf`.

---

## Self-review

- Cobertura del spec: datos (T1–2), unicidad (T1, T3), puerta (T5), tablero/escalera/canal/avisos (T4, T6), detalle/bitácora/PDF embebido/compras → Clientes (T3, T6), avisos WhatsApp (T3), renombre (T7), hoja para la landing y env (T8), Boreal (T8). ✅
- Desviación consciente del spec: `registrarCompra` inserta directo en `prospect_client`/`prospect_company` en vez de llamar `createProspectClient()`, para que todo quede en una transacción.
- Nombres consistentes entre tareas: `registrarChequeo`, `guardarEntrevista`, `crearChequeoPropio`, `cambiarEtapa`, `anotarContacto`, `fijarProximaAccion`, `registrarCompra`, `avisar`, `guardarPdf`, `urlPdf`, `getChequeo`, `listarChequeos`, `tablero`. ✅
