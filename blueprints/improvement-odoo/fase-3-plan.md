# Improvement estilo Odoo — Fase 3 (Importación) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El dueño trae lo que ya tiene —CSV, Excel, una hoja de Google Drive, un PDF o una foto— a Clientes o a cualquiera de sus apps propias. Improvement propone qué columna va en qué campo, enseña la vista previa con los errores fila por fila, importa solo cuando el dueño lo confirma y puede deshacer la importación completa.

**Architecture:** Una importación es una fila `import_job` que pasa por tres estados: `borrador` → `importado` → `deshecho`. Al subir el archivo, `server/import/parse.ts` lo convierte en `{ headers, rows }`: CSV con un lector propio, `.xlsx` con una dependencia, y PDF o foto leídos por la IA con visión desde el gateway. Luego `server/import/mapping.ts` propone el mapeo, primero con IA y, si no hay IA, emparejando por nombre. La vista previa valida cada fila con `schemaFor()` de `server/apps/fields.ts`, la única puerta de validación. Al confirmar, las filas válidas se insertan en `client` o en `app_record` y cada registro se liga a su importación en `record_origin`; deshacer borra solo esos registros.

**Tech Stack:** Next 16 App Router · TypeScript · Drizzle + Supabase (RLS) · zod 4 · `@anthropic-ai/sdk` (solo en el gateway) · Google Identity Services + Google Picker (scripts del navegador, sin paquete) · Vitest · Playwright + axe.

**Spec:** `blueprints/improvement-odoo/spec.md` (§5 pasos 3 y 5, puntos 3 a 6; §9 fase 3). Base: Fase 2 (PR jotapuntoce/Improvement#7).

## Global Constraints

- Dos puertas: cada función de `server/**` empieza con su guard; cada tabla org-scoped nueva nace con su política RLS en la misma migración.
- Motor genérico: nada en `server/**` ni `packages/db/**` nombra un org, empresa o persona.
- Toda migración se muestra a Jose Carlos y espera un "sí" explícito antes de `pnpm db:migrate`. Nunca editar a mano una migración generada; la de RLS va con `pnpm db:generate --custom`.
- Errores como `{ ok: true, data } | { ok: false, error: { code, message } }`; input validado con zod en el borde.
- Imports relativos con extensión `.ts`/`.tsx`; alias `@/`; sin barrels; las rutas nunca importan `@jotapuntoce/db`.
- `"use client"` solo en la hoja que necesita estado o eventos (`DrivePicker`).
- Ningún hex nuevo fuera de `packages/ui/src/tokens.css`.
- `@anthropic-ai/sdk` solo en `server/ai/gateway.ts`. Antes de tocar la llamada al modelo se invoca la skill `claude-api` y se copian de ahí el model id, el precio y los parámetros de visión vigentes. El prompt vive en `server/ai/prompts/`, la respuesta se valida con zod (un reintento) y el uso real se guarda en `llm_calls`. El tope de 10 llamadas por org por hora se revisa antes de llamar al proveedor.
- `SUPABASE_SERVICE_ROLE_KEY` nunca en `apps/improvement`.
- Una sola dependencia nueva, para `.xlsx`, con su razón en el mensaje del commit (E3).
- El token de Google del dueño solo viaja en la Server Action que baja el archivo: nunca se guarda ni se escribe en logs.
- Escribir "Jotapuntoce", nunca "J.C". Sin ranking dentro de Improvement.
- Gate: `pnpm lint && pnpm typecheck && pnpm test` en verde antes de dar una tarea por hecha.
- Commits con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; nunca `git add -A`.

## Decisiones (aprobadas por Jose Carlos el 2026-10-27)

| # | Spec | Este plan |
|---|---|---|
| E1 | Importar a cualquier app | Solo Clientes y apps propias. Ventas, Proyectos y Postventa piden cliente, monto o autorización; se agregan cuando alguien lo pida. |
| E2 | Drive con alcance de solo lectura | Google Picker con `drive.file`: Improvement solo ve el archivo que el dueño elige. El token se pide en el navegador con Google Identity Services, así que no hace falta `GOOGLE_CLIENT_SECRET` ni guardar tokens. Variables nuevas: `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_API_KEY` y `NEXT_PUBLIC_GOOGLE_APP_ID` (número de proyecto). Si falta cualquiera, el botón de Drive se oculta. |
| E3 | SheetJS desde npm | Una dependencia para `.xlsx` cuya versión confirma `the-architect:stack-researcher` al instalarla. Preferencia: `read-excel-file`, que es chica y está mantenida en npm. Si no sirve, SheetJS desde su CDN oficial. Nunca el paquete `xlsx` de npm, que está abandonado y tiene vulnerabilidades. |
| E4 | Mapeo con IA | La IA propone y el dueño confirma. Sin `ANTHROPIC_API_KEY`, con el tope alcanzado o si la IA falla, se empareja por nombre y la importación sigue. PDF y fotos sí necesitan la IA: sin ella, se avisa que se suba CSV o Excel. |
| E5 | Deshacer completo | Borra los registros de esa importación, menos los que se editaron después de importarse y los clientes que ya tienen ventas, proyectos, tickets, preferencias o experiencias. Al terminar dice cuántos se quedaron y por qué. |
| E6 | En el arranque, los archivos alimentan la propuesta | Hay un botón "Importar" en Clientes y en cada app propia, más un paso opcional "Trae lo que ya tienes" después de la propuesta. Que lo leído cambie la propuesta llega con la conversación (Fase 4). |

Límites: 5 MB por archivo, 5,000 filas y 60 columnas por importación. Solo el dueño importa y deshace, porque es configuración del negocio igual que agregar campos.

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `packages/db/src/schema.ts` | `importJob`, `recordOrigin`, `IMPORT_SOURCES`, `IMPORT_STATUSES` |
| `packages/db/migrations/0062_*.sql` (generada) + `0063_importacion_rls.sql` (custom) | Tablas y RLS |
| `apps/improvement/server/import/csv.ts` | Lector CSV (RFC 4180, detecta `,` o `;`) |
| `apps/improvement/server/import/parse.ts` | Archivo → `{ headers, rows }` según su tipo; límites |
| `apps/improvement/server/import/normalize.ts` | Texto de una celda → valor que acepta `schemaFor()` (dinero "$1,234.50", fecha "31/12/2026", "sí") |
| `apps/improvement/server/import/mapping.ts` | `Mapping`, mapeo por nombre y mapeo con IA |
| `apps/improvement/server/import/jobs.ts` | `createImportJob`, `getImportJob`, `previewImport`, `confirmImport`, `undoImport`, `listImports` |
| `apps/improvement/server/import/drive.ts` | Bajar de Drive el archivo elegido (export a CSV si es Google Sheet) |
| `apps/improvement/server/ai/gateway.ts` | Adjuntos (PDF/imagen) en el proveedor + `extractStructured()` |
| `apps/improvement/server/ai/prompts/import.ts` | Prompts y esquemas zod de lectura y mapeo |
| `apps/improvement/lib/env.ts` + `.env.example` | Las tres variables de Google |
| `apps/improvement/components/views/ControlPanel.tsx` | Enlace "Importar" (prop opcional) |
| `apps/improvement/components/import/DrivePicker.tsx` | Hoja cliente: token + Picker → formulario con `fileId` |
| `apps/improvement/app/[org]/a/[app]/importar/page.tsx` | Subir archivo o elegir de Drive + historial con Deshacer |
| `apps/improvement/app/[org]/a/[app]/importar/[job]/page.tsx` | Mapeo, vista previa, errores y Confirmar |
| `apps/improvement/app/arranque/[org]/importar/page.tsx` | Paso "Trae lo que ya tienes" |

---

### Task 1: Esquema — `import_job` y `record_origin` con RLS

**Files:**
- Modify: `packages/db/src/schema.ts` (al final, junto a `appRecord`)
- Create: migración generada + `packages/db/migrations/0063_importacion_rls.sql` (custom)
- Test: `apps/improvement/tests/import-schema.test.ts`

**Interfaces:**
- Produces: `IMPORT_SOURCES = ["csv","xlsx","sheets","pdf","imagen"] as const`, `IMPORT_STATUSES = ["borrador","importado","deshecho"] as const`, `importJob`, `recordOrigin`.

- [ ] **Step 1: Escribir la prueba que falla** (`tests/import-schema.test.ts`), con el mismo `setup()` de `apps-custom.test.ts` y el helper RLS `set_config('role','authenticated',true)` + `request.jwt.claims`:

```ts
it("WHEN un empleado consulta import_job por PostgREST THE SYSTEM SHALL no devolverle nada y al dueño sí", async () => {
  const { orgId, owner, emp } = await setup();
  const [app] = await db.select({ id: appModel.id }).from(appModel).where(eq(appModel.orgId, orgId)).limit(1); // tras ensureOrgApps(orgId)
  await db.insert(importJob).values({ orgId, appId: app!.id, source: "csv", fileName: "c.csv", headers: ["Nombre"], rows: [["Ana"]], createdBy: owner });
  expect(await countAs(emp, sql`select count(*)::int as n from import_job where org_id = ${orgId}`)).toBe(0);
  expect(await countAs(owner, sql`select count(*)::int as n from import_job where org_id = ${orgId}`)).toBe(1);
});
it("WHEN el source no es del catálogo THE SYSTEM SHALL rechazarlo en la base", async () => {
  // insert con source "zip" → rechaza con import_job_source_check
});
```

- [ ] **Step 2:** `pnpm --filter improvement test tests/import-schema.test.ts` → FALLA (no existe `importJob`).
- [ ] **Step 3: Esquema**

```ts
export const IMPORT_SOURCES = ["csv", "xlsx", "sheets", "pdf", "imagen"] as const;
export const IMPORT_STATUSES = ["borrador", "importado", "deshecho"] as const;

// Una importación de archivo a una app. rows guarda la tabla leída solo mientras es borrador; al
// importar se vacía (los datos ya viven en sus registros) y record_origin queda para deshacer.
export const importJob = pgTable(
  "import_job",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    appId: uuid("app_id").notNull().references(() => appModel.id, { onDelete: "cascade" }),
    source: text("source", { enum: IMPORT_SOURCES }).notNull(),
    fileName: text("file_name").notNull(),
    status: text("status", { enum: IMPORT_STATUSES }).notNull().default("borrador"),
    headers: jsonb("headers").$type<string[]>().notNull(),
    rows: jsonb("rows").$type<string[][]>().notNull(),
    mapping: jsonb("mapping").$type<Record<string, string>>().notNull().default({}),
    mappedBy: text("mapped_by"),
    errors: jsonb("errors").$type<{ row: number; message: string }[]>().notNull().default([]),
    importedCount: integer("imported_count").notNull().default(0),
    createdBy: uuid("created_by").references(() => profile.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    importedAt: timestamp("imported_at", { withTimezone: true }),
    undoneAt: timestamp("undone_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_import_job_app").on(t.appId, t.createdAt),
    check("import_job_source_check", sql`${t.source} in ('csv','xlsx','sheets','pdf','imagen')`),
    check("import_job_status_check", sql`${t.status} in ('borrador','importado','deshecho')`),
    check("import_job_mapped_by_check", sql`${t.mappedBy} is null or ${t.mappedBy} in ('ia','nombre')`),
  ],
);

// Qué registro nació de qué importación (client o app_record, según la app del job).
export const recordOrigin = pgTable(
  "record_origin",
  {
    importJobId: uuid("import_job_id").notNull().references(() => importJob.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    recordId: uuid("record_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.importJobId, t.recordId] })],
);
```

- [ ] **Step 4:** `pnpm db:generate` y luego `pnpm db:generate --custom --name=importacion_rls` con:

```sql
-- import_job y record_origin: solo el dueño de la empresa los lee (importar es configuración del
-- negocio). Se escriben solo desde el servidor.
alter table import_job enable row level security;
create policy "owners read their imports" on import_job for select
  using (exists (select 1 from membership m where m.org_id = import_job.org_id and m.user_id = auth.uid() and m.role = 'owner'));
alter table record_origin enable row level security;
create policy "owners read their record origins" on record_origin for select
  using (exists (select 1 from membership m where m.org_id = record_origin.org_id and m.user_id = auth.uid() and m.role = 'owner'));
grant select on import_job, record_origin to authenticated;
```

- [ ] **Step 5:** Mostrar ambos SQL a Jose Carlos y esperar su "sí". Luego `pnpm db:migrate`.
- [ ] **Step 6:** Correr la prueba → PASA. Gate. Commit `Fase 3 T1: import_job y record_origin con RLS de dueño`.

---

### Task 2: Leer archivos — CSV, Excel y normalización de celdas

**Files:**
- Create: `apps/improvement/server/import/csv.ts`, `server/import/normalize.ts`, `server/import/parse.ts`
- Modify: `apps/improvement/package.json` (dependencia de `.xlsx`)
- Test: `apps/improvement/tests/import-parse.test.ts`

**Interfaces:**
- Produces:
  - `parseCsv(text: string): string[][]`
  - `normalizeCell(field: FieldDef, raw: string): unknown`
  - `type Table = { headers: string[]; rows: string[][] }`
  - `readTable(file: { name: string; type: string; bytes: Uint8Array }): Promise<Result<Table & { source: "csv" | "xlsx" }>>`. PDF e imagen devuelven `{ ok: false, error: { code: "NEEDS_AI" } }`, y `jobs.ts` los manda a la IA.
  - `MAX_BYTES = 5 * 1024 * 1024`, `MAX_ROWS = 5000`, `MAX_COLS = 60`.

- [ ] **Step 1:** Dispatch `the-architect:stack-researcher`: "versión estable actual de `read-excel-file` (npm), si su entrada de Node lee un `Buffer`/`Uint8Array` y devuelve celdas de fecha como `Date`, y si es compatible con Node 24 y Turbopack del lado servidor; alternativa SheetJS CE desde cdn.sheetjs.com". Fijar exactamente la versión que reporte.
- [ ] **Step 2: Escribir la prueba que falla:**

```ts
describe("leer archivos", () => {
  it("WHEN el CSV trae comillas, comas y saltos dentro de una celda THE SYSTEM SHALL respetarlos", () => {
    expect(parseCsv('Nombre,Nota\r\n"Pérez, Ana","dijo ""hola""\nmañana"\r\n')).toEqual([["Nombre", "Nota"], ["Pérez, Ana", 'dijo "hola"\nmañana']]);
  });
  it("WHEN el CSV usa punto y coma (Excel en español) THE SYSTEM SHALL detectarlo", () => {
    expect(parseCsv("a;b\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("WHEN la celda es dinero, fecha o sí/no en formato mexicano THE SYSTEM SHALL dejarla lista para schemaFor", () => {
    const f = (type: FieldType, options: string[] = []): FieldDef => ({ key: "k", label: "K", type, options, required: false });
    expect(normalizeCell(f("dinero"), "$1,234.50")).toBe("1234.50");
    expect(normalizeCell(f("fecha"), "31/12/2026")).toBe("2026-12-31");
    expect(normalizeCell(f("fecha"), "2026-12-31")).toBe("2026-12-31");
    expect(normalizeCell(f("si_no"), "Sí")).toBe(true);
    expect(normalizeCell(f("si_no"), "no")).toBe(false);
    expect(normalizeCell(f("texto"), "  hola ")).toBe("hola");
    expect(normalizeCell(f("opcion", ["Mayoreo", "Menudeo"]), "mayoreo")).toBe("Mayoreo");
  });
  it("WHEN el archivo pasa de 5 MB, de 5,000 filas o no trae filas THE SYSTEM SHALL rechazarlo con su motivo", async () => { /* tres casos */ });
  it("WHEN se sube un .xlsx THE SYSTEM SHALL leer su primera hoja como texto", async () => {
    // fixture: tests/fixtures/clientes.xlsx (2 columnas, 3 filas, una fecha)
  });
  it("WHEN se sube un PDF o una foto THE SYSTEM SHALL pedir lectura con IA", async () => {
    expect(await readTable({ name: "a.pdf", type: "application/pdf", bytes: new Uint8Array(10) })).toMatchObject({ ok: false, error: { code: "NEEDS_AI" } });
  });
});
```

- [ ] **Step 3:** `parseCsv`: una sola pasada carácter por carácter con estado `inQuotes`. El delimitador es el que más aparece en la primera línea, entre `,` y `;`. Quita el BOM y descarta las filas vacías al final.
- [ ] **Step 4:** `normalizeCell`:
  - `dinero`/`numero`: quita `$`, espacios y comas de miles → string numérico.
  - `fecha`: acepta `dd/mm/aaaa`, `d/m/aa` e ISO → `aaaa-mm-dd`; si no reconoce el formato, deja el texto tal cual para que `schemaFor` marque el error de esa fila.
  - `si_no`: `sí|si|x|1|true|verdadero` → true, `no|0|false|falso|""` → false.
  - `opcion`: empata sin acentos ni mayúsculas contra `field.options` y devuelve la opción original.
- [ ] **Step 5:** `readTable`: revisa el tamaño y elige el lector por extensión y tipo MIME. En `.xlsx`, las fechas se convierten a ISO y todo lo demás a string. La primera fila son los encabezados (los vacíos se llaman `Columna N`). Luego revisa los límites.
- [ ] **Step 6:** `pnpm add <paquete>@<versión exacta> --filter improvement`. La prueba PASA. Gate. Commit `Fase 3 T2: leer CSV y Excel, normalizar celdas`, con la razón de la dependencia en el cuerpo: "Lee .xlsx, que es como los dueños tienen hoy su información; Node no trae lector de Excel y el paquete xlsx de npm está abandonado y con vulnerabilidades."

---

### Task 3: Gateway — adjuntos y `extractStructured()` para leer y mapear

**Files:**
- Modify: `apps/improvement/server/ai/gateway.ts`
- Create: `apps/improvement/server/ai/prompts/import.ts`
- Test: `apps/improvement/tests/ai-import.test.ts` (proveedor simulado, como `tests/ai-gateway.test.ts`)

**Interfaces:**
- Produces:
  - `SuggestionProvider.complete(system, prompt, attachment?: { mediaType: "application/pdf" | "image/png" | "image/jpeg" | "image/webp"; base64: string })`.
  - `extractStructured<T>({ orgId, purpose: "importacion_lectura" | "importacion_mapeo", system, prompt, attachment?, schema, maxTokens, provider? }): Promise<StructuredResult<T>>`, donde `StructuredResult` lleva solo `{ parsed: T }` y no escribe en `ai_suggestion` porque no es una sugerencia para el dueño.
  - `READ_TABLE_SYSTEM`, `readTablePrompt(fileName)`, `readTableSchema` → `{ headers: string[]; rows: string[][] }`.
  - `MAP_SYSTEM`, `mapPrompt(headers, sample, fields)`, `mapSchema` → `{ mapping: Record<header, "titulo" | fieldKey | "ignorar"> }`.

- [ ] **Step 1:** Invocar la skill `claude-api` y copiar el model id vigente, el precio por 1M tokens y la forma exacta de los bloques `document` (PDF base64) e `image`. Si el model id cambia, actualizar `MODEL_ID` y `PRICING_USD_PER_MTOK` con la fecha de verificación en su comentario.
- [ ] **Step 2: Escribir la prueba que falla:**

```ts
it("WHEN se lee un PDF THE SYSTEM SHALL mandar el adjunto, validar la tabla y guardar el uso real en llm_calls sin crear ai_suggestion", async () => { /* provider simulado devuelve JSON válido; assert llm_calls.purpose = "importacion_lectura" y 0 filas nuevas en ai_suggestion */ });
it("WHEN el modelo responde dos veces fuera del esquema THE SYSTEM SHALL fallar explícito tras un reintento", async () => { /* 2 llamadas exactas */ });
it("WHEN el org ya hizo 10 lecturas en la hora THE SYSTEM SHALL negar la 11ª sin llamar al proveedor", async () => { /* provider.complete nunca llamado */ });
```

- [ ] **Step 3:** En `AnthropicSuggestionProvider.complete`, si llega `attachment`, el contenido del mensaje se vuelve `[ { type: "document" | "image", source: { type: "base64", media_type, data } }, { type: "text", text: prompt } ]`. `max_tokens` llega por parámetro (lectura 8192, mapeo 1024).
- [ ] **Step 4:** `extractStructured` reutiliza `hasReachedHourlyLimit(orgId, purpose)`, el ciclo de un reintento, `parseCompletion` y el insert en `llm_calls`. Para no copiar el ciclo, se saca de `generateStructured` un helper interno `runStructured` que usan las dos.
- [ ] **Step 5:** Escribir los prompts en `prompts/import.ts`. Lectura: "Devuelve SOLO JSON `{headers, rows}` con la tabla principal del documento; una fila por registro; celdas como texto tal cual se ven." Mapeo: recibe los encabezados, las primeras 5 filas y los campos `{key, label, type, options}`, y debe devolver `titulo` para exactamente una columna.
- [ ] **Step 6:** La prueba PASA, junto con `tests/ai-gateway.test.ts`, que no debe cambiar. Gate. Commit `Fase 3 T3: el gateway lee PDF e imágenes y propone mapeos`.

---

### Task 4: `server/import/jobs.ts` — crear, previsualizar, confirmar, deshacer

**Files:**
- Create: `apps/improvement/server/import/mapping.ts`, `apps/improvement/server/import/jobs.ts`
- Test: `apps/improvement/tests/import-jobs.test.ts`

**Interfaces:**
- Consumes: `readTable`, `normalizeCell` (T2), `extractStructured` + prompts (T3), `listFields`/`schemaFor`/`FieldDef` (`server/apps/fields.ts`), `getAppMeta` (`server/apps/records.ts`), `firstStage` (`server/apps/custom.ts`), `findOwnerMembership` (guard).
- Produces:
  - `type Mapping = Record<string, "titulo" | "ignorar" | string>`: llave = índice de columna como string, valor = `"titulo"`, `"ignorar"` o un `fieldKey`.
  - `mapByName(headers, fields): Mapping`
  - `IMPORTABLE = (app: AppMeta) => app.kind === "custom" || app.key === "clientes"`
  - `createImportJob(userId, orgId, appKey, file: File | { name; type; bytes }, source?: "sheets"): Promise<Result<{ jobId: string }>>`
  - `getImportJob(userId, orgId, jobId): Promise<Result<{ job; app: AppMeta; fields: FieldDef[] }>>`
  - `previewImport(userId, orgId, jobId, mapping: Mapping): Promise<Result<{ valid: number; errors: { row: number; message: string }[]; sample: { title: string; values: Record<string, unknown> }[] }>>`. Guarda el mapeo en el job.
  - `confirmImport(userId, orgId, jobId): Promise<Result<{ imported: number; skipped: number }>>`
  - `undoImport(userId, orgId, jobId): Promise<Result<{ removed: number; kept: { edited: number; withActivity: number } }>>`
  - `listImports(userId, orgId, appKey): Promise<Result<{ id; fileName; status; importedCount; createdAt }[]>>`

- [ ] **Step 1: Escribir la prueba que falla** (cada caso con `setup()` propio y CSV en memoria):

```ts
it("WHEN el dueño sube un CSV a Clientes THE SYSTEM SHALL crear un borrador con un mapeo por nombre si no hay IA", async () => {
  const { orgId, owner } = await setup();
  await addField(owner, orgId, "clientes", { label: "Teléfono", type: "texto" });
  const r = await createImportJob(owner, orgId, "clientes", csvFile("Nombre,Teléfono\nAna,555\nLuis,556"));
  const j = await getImportJob(owner, orgId, r.ok ? r.data.jobId : "");
  expect(j.ok && j.data.job.mapping).toEqual({ "0": "titulo", "1": "telefono" });
  expect(j.ok && j.data.job.mappedBy).toBe("nombre");
});
it("WHEN una fila no cumple su campo THE SYSTEM SHALL reportar el renglón (contando encabezado) y no frenar las demás", async () => {
  // campo "Visitas" número; fila 3 "muchas" → errors [{ row: 3, message: … }], valid 1
});
it("WHEN el dueño confirma THE SYSTEM SHALL crear los registros, ligarlos al job y vaciar rows", async () => {
  // listRecords("clientes") contiene Ana y Luis con custom.telefono; record_origin 2 filas; job.rows = []; status importado
});
it("WHEN se importa a una app propia THE SYSTEM SHALL crear app_record en su primera etapa", async () => { /* createCustomApp + import */ });
it("WHEN se deshace THE SYSTEM SHALL borrar lo importado, salvo lo editado después y los clientes con ventas", async () => {
  // importa 3 clientes; a uno le crea un deal; a otro le cambia custom (updatedAt > importedAt) → removed 1, kept {edited:1, withActivity:1}; status deshecho
});
it("WHEN un empleado, otra empresa o una app base distinta de Clientes intentan importar THE SYSTEM SHALL negarlo", async () => {
  // emp → FORBIDDEN; appKey "ventas" → VALIDATION_ERROR "Por ahora se importa a Clientes y a tus apps propias."; jobId de otro org → NOT_FOUND
});
it("WHEN se confirma dos veces THE SYSTEM SHALL importar una sola vez", async () => { /* segundo confirm → error "Esta importación ya se hizo." */ });
```

- [ ] **Step 2:** La prueba FALLA.
- [ ] **Step 3: `mapping.ts`.**
  - `mapByName` compara sin acentos ni mayúsculas el encabezado contra `label` y `key` de cada campo.
  - El título es la primera columna cuyo encabezado sea `nombre|cliente|titulo|título|name|razon social`; si ninguna empata, la columna 0.
  - Las columnas sin pareja quedan en `ignorar`.
  - `mapWithAi(orgId, headers, rows, fields)` llama a `extractStructured` con propósito `importacion_mapeo`. Antes de aceptar la respuesta exige un solo `titulo` y que cada `fieldKey` exista; si no, devuelve `null` y el caller usa `mapByName`.
- [ ] **Step 4: `jobs.ts`.**
  - Todas las funciones empiezan con `findOwnerMembership(userId, orgId)` y responden `FORBIDDEN` si no es el dueño. El job se lee con `where(and(eq(importJob.id, jobId), eq(importJob.orgId, orgId)))`, así que un job de otro org da `NOT_FOUND`. Si el id no es uuid, también `NOT_FOUND`.
  - **`createImportJob`:**
    - Primero `readTable`. Si devuelve `NEEDS_AI`, llama a `extractStructured` con propósito `importacion_lectura` y el adjunto en base64. Si eso falla, responde "Para leer PDF o fotos se necesita la IA; sube el archivo como CSV o Excel."
    - Después el mapeo: primero `mapWithAi`, y si da `null`, `mapByName`.
    - Inserta el job en estado `borrador`.
  - **`previewImport`:**
    - Por cada fila arma `{ title, values }` con `normalizeCell` y valida `values` con `schemaFor(fields)`.
    - Un título vacío es error de esa fila: "Falta el nombre."
    - El renglón que se reporta es índice + 2, porque el renglón 1 es el encabezado.
    - Devuelve las primeras 20 filas válidas como muestra y guarda `mapping` y `errors` en el job.
  - **`confirmImport`:**
    - Exige estado `borrador`.
    - Recalcula la vista previa en el servidor; nunca confía en la que vio el cliente.
    - En una transacción:
      1. Inserta las filas válidas en bloques de 500: en `client` (`name`, `custom`) o en `app_record` (`title`, `stage: firstStage`, `data`, `createdBy`).
      2. Inserta las mismas filas en `record_origin`.
      3. Actualiza el job: `status = 'importado'`, `importedAt = now()`, `importedCount`, `rows = []`.
    - Escribe una sola entrada de bitácora por importación en `record_activity`, no una por registro. El `recordId` es el del job (las fichas no la muestran) y el texto es "Importación de <archivo>: N registros".
  - **`undoImport`:**
    - Exige estado `importado`.
    - Los ids salen de `record_origin`.
    - Se quedan los que tengan `updatedAt > importedAt + 1 s` y, en Clientes, los que tengan filas en `deal`, `project`, `ticket`, `client_preference` o `experience_grant` (con un `exists` por tabla).
    - Borra el resto, marca el job como `deshecho` con `undoneAt`, y borra todo su `record_origin`.
- [ ] **Step 5:** La prueba PASA. Gate. Commit `Fase 3 T4: importaciones con vista previa, confirmación y deshacer`.

---

### Task 5: Pantallas — Importar, mapeo y vista previa

**Files:**
- Modify: `apps/improvement/components/views/ControlPanel.tsx` (prop `importHref?: string`), `apps/improvement/app/[org]/a/[app]/page.tsx`
- Create: `apps/improvement/app/[org]/a/[app]/importar/page.tsx`, `apps/improvement/app/[org]/a/[app]/importar/[job]/page.tsx`
- Modify: `apps/improvement/app/globals.css` (solo clases con tokens existentes: `.import-table`, `.import-errors`)
- Test: E2E en T7; a11y en `tests/e2e/a11y.spec.ts`

**Interfaces:**
- Consumes: todo `jobs.ts` (T4), `getAppMeta`, `requireSection`/`requireOrgMembership`, `findOwnerMembership`.

- [ ] **Step 1:** `a/[app]/page.tsx` pasa `importHref={`/${orgId}/a/${appKey}/importar`}` solo cuando quien entra es el dueño y la app es importable (`IMPORTABLE`). `ControlPanel` lo pinta como enlace "Importar" junto a "Nuevo".
- [ ] **Step 2: `importar/page.tsx`** (Server Component).
  - Las páginas que no son del dueño dan 404.
  - Formulario `encType` multipart con `<input type="file" name="archivo" accept=".csv,.xlsx,.pdf,image/png,image/jpeg,image/webp">`, la ayuda "Hasta 5 MB y 5,000 filas" y el botón "Leer archivo".
  - La Server Action llama a `createImportJob` y redirige a `importar/[job]`; si falla, redirige con `?error=`.
  - Debajo, "Tus importaciones": tabla con archivo, fecha, estado e importados, más un botón "Deshacer" (form por fila) en las que están en `importado`. Tras deshacer, redirige con `?aviso=` "Se quitaron N; se quedaron M porque ya tenían cambios o ventas."
- [ ] **Step 3: `importar/[job]/page.tsx`.**
  - Muestra "Así leímos tu archivo" y de dónde salió el mapeo: "Lo propuso Improvement" o "Emparejamos por nombre".
  - Un formulario con un `<select name="col-<i>">` por columna, con `<label>` igual al encabezado y opciones "Nombre del registro", cada campo de la app e "Ignorar".
  - Botón "Ver vista previa": guarda con `previewImport` y vuelve a la misma página.
  - Si ya hay vista previa: "N listos para importar" y la tabla de muestra; "M renglones con error", en una lista `role="list"` con renglón y motivo; y el botón "Importar N registros" (`confirmImport` → redirige a `/${org}/a/${app}?aviso=Importados N`).
  - Un enlace para agregar campos: "¿Falta un campo? Agrégalo en Campos de la app" hacia la pantalla de campos de la Fase 1, con `returnTo` al job.
- [ ] **Step 4:** Agregar `/[org]/a/clientes/importar` a `tests/e2e/a11y.spec.ts`. Correr `pnpm --filter improvement test:e2e tests/e2e/a11y.spec.ts`: 0 serious o critical. Gate. Commit `Fase 3 T5: pantallas de importar, mapear y revisar`.

---

### Task 6: Google Drive con Picker y `drive.file`

**Files:**
- Modify: `apps/improvement/lib/env.ts`, `.env.example` (sección de Google con dueño y paso, como las demás)
- Create: `apps/improvement/server/import/drive.ts`, `apps/improvement/components/import/DrivePicker.tsx`
- Modify: `apps/improvement/app/[org]/a/[app]/importar/page.tsx` (botón de Drive si hay variables)
- Test: `apps/improvement/tests/import-drive.test.ts` (`fetch` simulado)

**Interfaces:**
- Produces:
  - `fetchDriveFile(fileId: string, accessToken: string, fetchImpl = fetch): Promise<Result<{ name; type; bytes: Uint8Array; source: "sheets" | undefined }>>`
  - `<DrivePicker clientId apiKey appId action />`

- [ ] **Step 1: Escribir la prueba que falla:**

```ts
it("WHEN el archivo elegido es una Google Sheet THE SYSTEM SHALL exportarla a CSV", async () => {
  // fetch 1 → metadata { name, mimeType: "application/vnd.google-apps.spreadsheet", size: undefined }; fetch 2 → URL .../files/<id>/export?mimeType=text/csv
});
it("WHEN es un archivo normal THE SYSTEM SHALL bajarlo con alt=media y respetar 5 MB", async () => { /* size 6MB → error sin segunda llamada */ });
it("WHEN el fileId trae caracteres raros THE SYSTEM SHALL negarlo sin llamar a Google", async () => { /* "../x" → VALIDATION_ERROR, fetch no llamado */ });
it("WHEN Google responde 401/403/404 THE SYSTEM SHALL decir que vuelva a elegir el archivo", async () => {});
```

- [ ] **Step 2:** `drive.ts`:
  - Valida `fileId` contra `/^[A-Za-z0-9_-]{10,200}$/`.
  - Solo llama al host fijo `https://www.googleapis.com/drive/v3/files/` con `Authorization: Bearer`.
  - Pide primero la metadata (`?fields=name,mimeType,size`).
  - Las Google Sheets se bajan por `/export?mimeType=text/csv`; lo demás, por `?alt=media`.
  - El token nunca se loguea.
- [ ] **Step 3:** `env.ts` suma `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_API_KEY` y `NEXT_PUBLIC_GOOGLE_APP_ID`, opcionales con `emptyToUndefined`. `.env.example` documenta cada una: dueño Jose Carlos, de dónde sale (Google Cloud → Credenciales / número de proyecto) y que activan el botón de Drive. Las tres son públicas por diseño: Google las usa en el navegador.
- [ ] **Step 4:** `DrivePicker.tsx` (`"use client"`):
  - Al hacer clic carga `https://accounts.google.com/gsi/client` y `https://apis.google.com/js/api.js` una sola vez.
  - Pide el token con `google.accounts.oauth2.initTokenClient({ client_id, scope: "https://www.googleapis.com/auth/drive.file", callback })`.
  - Abre el Picker con `setOAuthToken`, `setDeveloperKey`, `setAppId` y vistas de hojas de cálculo, PDF e imágenes.
  - Al elegir, llena dos `<input type="hidden">` (`fileId`, `token`) y hace `requestSubmit()` del formulario de la Server Action.
  - Si el dueño cierra el Picker, no pasa nada.
  - El botón se llama "Elegir de Google Drive".
- [ ] **Step 5:** La Server Action de `importar/page.tsx` llama a `fetchDriveFile` y después a `createImportJob(…, source)`. Si falta alguna variable de Google, el botón no se pinta.
- [ ] **Step 6:** La prueba PASA. Gate. Commit `Fase 3 T6: importar desde Google Drive con drive.file`.

---

### Task 7: Paso "Trae lo que ya tienes" en el arranque + E2E

**Files:**
- Modify: `apps/improvement/app/arranque/[org]/propuesta/page.tsx` (redirige a `/arranque/${orgId}/importar`)
- Create: `apps/improvement/app/arranque/[org]/importar/page.tsx`
- Modify: `apps/improvement/tests/e2e/registro.spec.ts` (el flujo pasa por el paso nuevo y lo salta)
- Create: `apps/improvement/tests/e2e/importar.spec.ts`, `apps/improvement/tests/e2e/fixtures/clientes.csv`

- [ ] **Step 1: `arranque/[org]/importar/page.tsx`** (solo el dueño).
  - Encabezado "Paso 4 de 4 · Trae lo que ya tienes" y el texto "¿Ya llevas tus clientes o pedidos en Excel, Sheets o papel? Súbelo y lo acomodamos."
  - Un `<select name="app">` con Clientes y las apps propias que acaba de crear, el mismo input de archivo y, si hay variables, Drive.
  - Al enviar, crea el job y lleva a `/${org}/a/${app}/importar/${job}`.
  - Un enlace "No tengo nada, ir a mi Improvement" → `/${orgId}`.
  - Los pasos 1 a 3 cambian su texto a "de 4".
- [ ] **Step 2: `importar.spec.ts`.**
  1. Crea un dueño con su org: fixture de usuario + `createOwnBusiness`, igual que `registro.spec.ts`.
  2. Lo agrega a Clientes con el campo "Teléfono".
  3. Sube `clientes.csv` (3 filas, una sin nombre) y ve el mapeo propuesto.
  4. Ve la vista previa: "2 listos" y "Renglón 4: Falta el nombre".
  5. Importa y ve a los dos clientes en la lista.
  6. Vuelve a Importar, deshace y la lista queda vacía.
  7. Corre axe en las dos pantallas.
  8. `afterAll` borra la org, el perfil y el usuario de auth.
  Las esperas de navegación que tocan Supabase llevan `{ timeout: 20_000 }`.
- [ ] **Step 3:** `registro.spec.ts`: después de "Armar mi Improvement", la prueba espera `/arranque/<org>/importar`, corre axe, hace clic en "No tengo nada, ir a mi Improvement" y sigue con lo que ya revisaba.
- [ ] **Step 4:** Correr `pnpm --filter improvement test:e2e` (toda la suite), luego el gate completo (improvement y summum). Commit `Fase 3 T7: paso de importar en el arranque y E2E de importación`.
- [ ] **Step 5:** Escribir `blueprints/improvement-odoo/fase-3-pr.md` con lo que entra, la verificación y lo que falta fuera del código: las credenciales de Google Cloud (pantalla de consentimiento, API de Drive y API de Picker habilitadas, origen `http://localhost:3200` y el de producción) y las tres variables en Vercel.

---

## Autorrevisión

- **Cobertura del spec §5:**
  - Archivos CSV y Excel (T2), PDF y fotos (T3 + T4), Drive y Sheets (T6).
  - `import_job` y `record_origin` (T1).
  - Mapeo con IA (T3 + T4).
  - Vista previa y errores fila por fila (T4 + T5).
  - Confirmación explícita (T5) y deshacer completo (T4, E5).
  - Paso del arranque (T7).
  - Se desvían por decisión aprobada: "explica cómo lo quiere ver" y que lo leído alimente la propuesta (E6, Fase 4), y `GOOGLE_CLIENT_SECRET` (E2).
- **Tipos entre tareas:**
  - T5 y T7 consumen `Mapping`, `createImportJob(…, source?)` y `normalizeCell(field, raw)` con las mismas firmas que definen T2 y T4.
  - `readTable` devuelve `source: "csv" | "xlsx"`; `"sheets"` lo pone T6, y `"pdf"`/`"imagen"` los pone T4 según el tipo MIME.
