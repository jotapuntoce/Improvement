// apps/improvement/server/import/jobs.ts
// Una importación de punta a punta: el archivo se lee y queda en borrador con un mapeo propuesto; la
// vista previa valida cada fila con schemaFor (la única puerta de validación de campos); al
// confirmar se crean los registros y se ligan al job; deshacer borra solo lo que nadie ha tocado.
// Solo el dueño importa: es configuración del negocio, igual que agregar campos.
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { appModel, appRecord, client, clientPreference, deal, experienceGrant, importJob, project, recordOrigin, ticket } from "@jotapuntoce/db/schema";
import { findOwnerMembership } from "../auth/guard.ts";
import { extractStructured, type Attachment, type SuggestionProvider } from "../ai/gateway.ts";
import { READ_TABLE_SYSTEM, readTablePrompt, readTableSchema } from "../ai/prompts/import.ts";
import { firstStage } from "../apps/custom.ts";
import { listFields, schemaFor, type FieldDef } from "../apps/fields.ts";
import { getAppMeta, type AppMeta } from "../apps/records.ts";
import { isValidMapping, mapByName, mapWithAi, type Mapping } from "./mapping.ts";
import { normalizeCell } from "./normalize.ts";
import { fileKind, readTable, toTable, type UploadedFile } from "./parse.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
const fail = (message: string, code = "VALIDATION_ERROR"): { ok: false; error: { code: string; message: string } } => ({ ok: false, error: { code, message } });

type Job = typeof importJob.$inferSelect;
interface Row { title: string; values: Record<string, unknown> }

export const IMPORTABLE = (app: AppMeta) => app.kind === "custom" || app.key === "clientes";

async function ownerGate(userId: string, orgId: string) {
  return (await findOwnerMembership(userId, orgId)) ? null : fail("Solo el dueño importa información.", "FORBIDDEN");
}

async function loadJob(orgId: string, jobId: string): Promise<Job | undefined> {
  if (!z.uuid().safeParse(jobId).success) return undefined;
  const [job] = await db.select().from(importJob).where(and(eq(importJob.id, jobId), eq(importJob.orgId, orgId)));
  return job;
}

async function appOf(orgId: string, job: Job): Promise<AppMeta | null> {
  const [row] = await db.select({ key: appModel.key }).from(appModel).where(eq(appModel.id, job.appId));
  return row ? getAppMeta(orgId, row.key) : null;
}

const MEDIA: Record<string, Attachment["mediaType"]> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

export async function createImportJob(
  userId: string,
  orgId: string,
  appKey: string,
  file: UploadedFile,
  opts: { provider?: SuggestionProvider; source?: "sheets" } = {},
): Promise<Result<{ jobId: string }>> {
  const denied = await ownerGate(userId, orgId);
  if (denied) return denied;
  const app = await getAppMeta(orgId, appKey);
  if (!app) return fail("Esa app no existe.", "NOT_FOUND");
  if (!IMPORTABLE(app)) return fail("Por ahora se importa a Clientes y a tus apps propias.");

  let table = await readTable(file);
  let source: Job["source"] = opts.source ?? (table.ok ? table.data.source : "csv");
  if (!table.ok && table.error.code === "NEEDS_AI") {
    const kind = fileKind(file)!;
    source = kind === "pdf" ? "pdf" : "imagen";
    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    const mediaType = MEDIA[ext] ?? (Object.values(MEDIA).find((m) => m === file.type) || "image/jpeg");
    const read = await extractStructured({
      orgId,
      purpose: "importacion_lectura",
      system: READ_TABLE_SYSTEM,
      prompt: readTablePrompt(file.name),
      schema: readTableSchema,
      attachment: { mediaType, base64: Buffer.from(file.bytes).toString("base64") },
      // ponytail: tope de 16k tokens sin streaming; una tabla más larga en PDF pide streaming.
      maxTokens: 16000,
      provider: opts.provider,
    }).catch(() => null);
    if (!read?.ok) return fail("Para leer PDF o fotos se necesita la IA y no respondió; sube el archivo como CSV o Excel.");
    const t = toTable([read.data.parsed.headers, ...read.data.parsed.rows]);
    table = t.ok ? { ok: true, data: { ...t.data, source: "csv" } } : t;
  }
  if (!table.ok) return table;

  const { headers, rows } = table.data;
  const fields = await listFields(userId, orgId, appKey);
  const byAi = await mapWithAi(orgId, headers, rows, fields, opts.provider);
  const [job] = await db
    .insert(importJob)
    .values({
      orgId, appId: app.id, source, fileName: file.name.slice(0, 200), headers, rows,
      mapping: byAi ?? mapByName(headers, fields), mappedBy: byAi ? "ia" : "nombre", createdBy: userId,
    })
    .returning({ id: importJob.id });
  return { ok: true, data: { jobId: job!.id } };
}

export async function getImportJob(userId: string, orgId: string, jobId: string): Promise<Result<{ job: Job; app: AppMeta; fields: FieldDef[] }>> {
  const denied = await ownerGate(userId, orgId);
  if (denied) return denied;
  const job = await loadJob(orgId, jobId);
  const app = job && (await appOf(orgId, job));
  if (!job || !app) return fail("No existe.", "NOT_FOUND");
  return { ok: true, data: { job, app, fields: await listFields(userId, orgId, app.key) } };
}

/** Cada fila → registro listo o error con su renglón (el 1 es el encabezado). */
function buildRows(rows: string[][], mapping: Mapping, fields: FieldDef[]) {
  const schema = schemaFor(fields);
  const valid: Row[] = [];
  const errors: { row: number; message: string }[] = [];
  rows.forEach((cells, i) => {
    let title = "";
    const raw: Record<string, unknown> = {};
    for (const [col, target] of Object.entries(mapping)) {
      const cell = cells[Number(col)] ?? "";
      if (target === "titulo") title = cell.trim().slice(0, 120);
      else if (target !== "ignorar") {
        const f = fields.find((f) => f.key === target);
        if (f) raw[f.key] = normalizeCell(f, cell);
      }
    }
    if (!title) return void errors.push({ row: i + 2, message: "Falta el nombre." });
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const label = fields.find((f) => f.key === issue?.path[0])?.label;
      return void errors.push({ row: i + 2, message: `${label ? `${label}: ` : ""}${issue?.message ?? "Dato inválido."}` });
    }
    valid.push({ title, values: parsed.data });
  });
  return { valid, errors };
}

export async function previewImport(
  userId: string,
  orgId: string,
  jobId: string,
  mapping: Mapping,
): Promise<Result<{ valid: number; errors: { row: number; message: string }[]; sample: Row[] }>> {
  const g = await getImportJob(userId, orgId, jobId);
  if (!g.ok) return g;
  const { job, fields } = g.data;
  if (job.status !== "borrador") return fail("Esta importación ya se hizo.");
  if (!isValidMapping(mapping, job.headers, fields)) return fail("Elige una sola columna como nombre del registro.");
  const { valid, errors } = buildRows(job.rows, mapping, fields);
  await db.update(importJob).set({ mapping, errors }).where(eq(importJob.id, job.id));
  return { ok: true, data: { valid: valid.length, errors, sample: valid.slice(0, 20) } };
}

export async function confirmImport(userId: string, orgId: string, jobId: string): Promise<Result<{ imported: number; skipped: number }>> {
  const g = await getImportJob(userId, orgId, jobId);
  if (!g.ok) return g;
  const { job, app, fields } = g.data;
  if (job.status !== "borrador") return fail("Esta importación ya se hizo.");
  // Se recalcula aquí: nunca se confía en la vista previa que vio el navegador.
  const { valid, errors } = buildRows(job.rows, job.mapping, fields);
  const stage = app.kind === "custom" ? await firstStage(app.id) : undefined;
  if (app.kind === "custom" && !stage) return fail("Esta app no tiene etapas.");

  const done = await db.transaction(async (tx) => {
    // El cambio de estado va primero y condicionado: dos confirmaciones a la vez importan una sola vez.
    const [claimed] = await tx
      .update(importJob)
      .set({ status: "importado", importedAt: new Date(), importedCount: valid.length, errors, rows: [] })
      .where(and(eq(importJob.id, job.id), eq(importJob.status, "borrador")))
      .returning({ id: importJob.id });
    if (!claimed) return false;
    for (let i = 0; i < valid.length; i += 500) {
      const chunk = valid.slice(i, i + 500);
      const ids =
        app.kind === "custom"
          ? await tx.insert(appRecord).values(chunk.map((r) => ({ orgId, appId: app.id, title: r.title, stage: stage!, data: r.values, createdBy: userId }))).returning({ id: appRecord.id })
          : await tx.insert(client).values(chunk.map((r) => ({ orgId, name: r.title, custom: r.values }))).returning({ id: client.id });
      await tx.insert(recordOrigin).values(ids.map(({ id }) => ({ importJobId: job.id, orgId, recordId: id })));
    }
    return true;
  });
  if (!done) return fail("Esta importación ya se hizo.");
  return { ok: true, data: { imported: valid.length, skipped: errors.length } };
}

export async function undoImport(userId: string, orgId: string, jobId: string): Promise<Result<{ removed: number; kept: { edited: number; withActivity: number } }>> {
  const g = await getImportJob(userId, orgId, jobId);
  if (!g.ok) return g;
  const { job, app } = g.data;
  if (job.status !== "importado" || !job.importedAt) return fail("Solo se deshace una importación ya hecha.");
  const ids = (await db.select({ id: recordOrigin.recordId }).from(recordOrigin).where(eq(recordOrigin.importJobId, job.id))).map((r) => r.id);
  // Un segundo de holgura: el insert y su updatedAt caen en el mismo instante que importedAt.
  const since = new Date(job.importedAt.getTime() + 1000);
  const table = app.kind === "custom" ? appRecord : client;

  const edited = ids.length
    ? (await db.select({ id: table.id }).from(table).where(and(inArray(table.id, ids), gt(table.updatedAt, since)))).map((r) => r.id)
    : [];
  let withActivity: string[] = [];
  if (app.kind !== "custom") {
    const rest = ids.filter((id) => !edited.includes(id));
    // Un cliente que ya tiene ventas, proyectos, tickets, preferencias o experiencias se queda:
    // borrarlo arrastraría en cascada trabajo hecho después de importar.
    const used = rest.length
      ? await Promise.all([deal, project, ticket, clientPreference, experienceGrant].map((t) => db.selectDistinct({ id: t.clientId }).from(t).where(inArray(t.clientId, rest))))
      : [];
    withActivity = [...new Set(used.flat().map((r) => r.id).filter((id): id is string => id !== null))];
  }
  const keep = new Set([...edited, ...withActivity]);
  const remove = ids.filter((id) => !keep.has(id));

  await db.transaction(async (tx) => {
    if (remove.length) await tx.delete(table).where(and(eq(table.orgId, orgId), inArray(table.id, remove)));
    await tx.delete(recordOrigin).where(eq(recordOrigin.importJobId, job.id));
    await tx.update(importJob).set({ status: "deshecho", undoneAt: new Date() }).where(eq(importJob.id, job.id));
  });
  return { ok: true, data: { removed: remove.length, kept: { edited: edited.length, withActivity: withActivity.length } } };
}

export async function listImports(
  userId: string,
  orgId: string,
  appKey: string,
): Promise<Result<{ id: string; fileName: string; status: Job["status"]; importedCount: number; createdAt: Date }[]>> {
  const denied = await ownerGate(userId, orgId);
  if (denied) return denied;
  const app = await getAppMeta(orgId, appKey);
  if (!app) return fail("Esa app no existe.", "NOT_FOUND");
  const rows = await db
    .select({ id: importJob.id, fileName: importJob.fileName, status: importJob.status, importedCount: importJob.importedCount, createdAt: importJob.createdAt })
    .from(importJob)
    .where(and(eq(importJob.orgId, orgId), eq(importJob.appId, app.id)))
    .orderBy(desc(importJob.createdAt))
    .limit(50);
  return { ok: true, data: rows };
}
