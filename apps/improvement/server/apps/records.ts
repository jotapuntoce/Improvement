// La puerta única de las vistas genéricas: guard por sección, adaptador de la app y bitácora.
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { appModel, appRecord, appStage, profile, recordActivity } from "@jotapuntoce/db/schema";
import { resolveSection } from "../auth/guard.ts";
import { ensureOrgApps, type BaseAppKey } from "./catalog.ts";
import { customAdapter, firstStage } from "./custom.ts";
import type { SectionSlug } from "../permissions/sections.ts";
import { ADAPTERS, type AppRecord } from "./adapters.ts";
import { listFields, schemaFor } from "./fields.ts";
import { runAutomations, type AutomationEvent } from "../automations/engine.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
const fail = (message: string, code = "VALIDATION_ERROR"): { ok: false; error: { code: string; message: string } } => ({ ok: false, error: { code, message } });

export type { AppRecord };
export interface ActivityItem { kind: "nota" | "cambio"; body: string; actorName: string | null; createdAt: Date }

export interface AppMeta { id: string; key: string; name: string; section: SectionSlug; kind: "base" | "custom" }

/** La app prendida del org por su llave (base o propia), o null. Sin guard: la llaman gate() y las páginas después de requireSection. */
export async function getAppMeta(orgId: string, appKey: string): Promise<AppMeta | null> {
  await ensureOrgApps(orgId);
  const [row] = await db
    .select({ id: appModel.id, key: appModel.key, name: appModel.name, section: appModel.section, kind: appModel.kind })
    .from(appModel)
    .where(and(eq(appModel.orgId, orgId), eq(appModel.key, appKey), eq(appModel.enabled, true)));
  return row ? { ...row, section: row.section as SectionSlug, kind: row.kind === "custom" ? "custom" : "base" } : null;
}

/** Lectura: cualquier alcance distinto de "ninguno". Escritura: solo "empresa", igual que las apps base. */
async function gate(userId: string, orgId: string, appKey: string, write: boolean) {
  const app = await getAppMeta(orgId, appKey);
  if (!app) return { error: fail("Esa app no existe.", "NOT_FOUND") };
  const { scope } = await resolveSection(userId, orgId, app.section);
  if (scope === "ninguno" || (write && scope !== "empresa")) return { error: fail("No tienes acceso a esta app.", "FORBIDDEN") };
  return { app, adapter: app.kind === "custom" ? customAdapter(app.id) : ADAPTERS[app.key as BaseAppKey] };
}

const isUuid = (id: string) => z.uuid().safeParse(id).success;

/** Lo usan las automatizaciones (opts.depth) para saber cuántas reglas encadenadas van. */
interface ChainOpts { depth?: number }

/** Dispara las automatizaciones después de un guardado exitoso; su error nunca tumba el guardado. */
async function fire(event: AutomationEvent) {
  await runAutomations(event).catch(() => {});
}

/** El registro sin guard. Interna: la llaman el motor y el cron, que ya autorizaron. */
export async function loadRecord(orgId: string, appKey: string, id: string): Promise<AppRecord | null> {
  const app = await getAppMeta(orgId, appKey);
  if (!app || !isUuid(id)) return null;
  const adapter = app.kind === "custom" ? customAdapter(app.id) : ADAPTERS[app.key as BaseAppKey];
  return (await adapter.get(orgId, id)) ?? null;
}

export async function listRecords(
  userId: string,
  orgId: string,
  appKey: string,
  opts: { q?: string } = {},
): Promise<Result<{ records: AppRecord[]; stages: { key: string; name: string }[] }>> {
  const g = await gate(userId, orgId, appKey, false);
  if (g.error) return g.error;
  const q = z.string().trim().max(80).safeParse(opts.q ?? "");
  const [records, stages] = await Promise.all([
    g.adapter.list(orgId, q.success && q.data ? q.data : undefined),
    db
      .select({ key: appStage.key, name: appStage.name })
      .from(appStage)
      .innerJoin(appModel, eq(appModel.id, appStage.appId))
      .where(and(eq(appStage.orgId, orgId), eq(appModel.key, appKey)))
      .orderBy(asc(appStage.position)),
  ]);
  return { ok: true, data: { records, stages } };
}

export async function getRecord(userId: string, orgId: string, appKey: string, id: string): Promise<Result<AppRecord>> {
  const g = await gate(userId, orgId, appKey, false);
  if (g.error) return g.error;
  const rec = isUuid(id) ? await g.adapter.get(orgId, id) : undefined;
  return rec ? { ok: true, data: rec } : fail("No existe.", "NOT_FOUND");
}

async function log(orgId: string, appKey: string, section: string, recordId: string, kind: "nota" | "cambio", body: string, actorId: string) {
  await db.insert(recordActivity).values({ orgId, appKey, section, recordId, kind, body, actorId });
}

export async function moveRecord(userId: string, orgId: string, appKey: string, id: string, stage: string, opts: ChainOpts = {}): Promise<Result<true>> {
  const g = await gate(userId, orgId, appKey, true);
  if (g.error) return g.error;
  const before = isUuid(id) ? await g.adapter.get(orgId, id) : undefined;
  if (!before) return fail("No existe.", "NOT_FOUND");
  const r = await g.adapter.move(userId, orgId, id, stage);
  if (r.ok && before.stage !== stage) {
    await log(orgId, appKey, g.app.section, id, "cambio", `Etapa: ${before.stage} → ${stage}`, userId);
    await fire({ orgId, actorId: userId, appKey, recordId: id, type: "etapa", stage, depth: opts.depth });
  }
  return r;
}

export async function saveCustomValues(userId: string, orgId: string, appKey: string, id: string, values: unknown, opts: ChainOpts = {}): Promise<Result<Record<string, unknown>>> {
  const g = await gate(userId, orgId, appKey, true);
  if (g.error) return g.error;
  if (!isUuid(id)) return fail("No existe.", "NOT_FOUND");
  const parsed = schemaFor(await listFields(userId, orgId, appKey)).safeParse(values);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Datos inválidos.");
  const before = await g.adapter.get(orgId, id);
  if (!before) return fail("No existe.", "NOT_FOUND");
  const saved = await g.adapter.saveCustom(orgId, id, parsed.data);
  if (!saved) return fail("No existe.", "NOT_FOUND");
  const changed = Object.keys(parsed.data).filter((k) => JSON.stringify(before.custom[k] ?? null) !== JSON.stringify(parsed.data[k] ?? null));
  await log(orgId, appKey, g.app.section, id, "cambio", "Campos actualizados", userId);
  if (changed.length) await fire({ orgId, actorId: userId, appKey, recordId: id, type: "campo", fields: changed, depth: opts.depth });
  return { ok: true, data: saved };
}

export async function addNote(userId: string, orgId: string, appKey: string, id: string, body: string): Promise<Result<true>> {
  const g = await gate(userId, orgId, appKey, false);
  if (g.error) return g.error;
  const text = z.string().trim().min(1, "Escribe la nota.").max(2000).safeParse(body);
  if (!text.success) return fail(text.error.issues[0]?.message ?? "Escribe la nota.");
  if (!isUuid(id) || !(await g.adapter.get(orgId, id))) return fail("No existe.", "NOT_FOUND");
  await log(orgId, appKey, g.app.section, id, "nota", text.data, userId);
  return { ok: true, data: true };
}

export async function listActivity(userId: string, orgId: string, appKey: string, id: string): Promise<Result<ActivityItem[]>> {
  const g = await gate(userId, orgId, appKey, false);
  if (g.error) return g.error;
  if (!isUuid(id)) return { ok: true, data: [] };
  const rows = await db
    .select({ kind: recordActivity.kind, body: recordActivity.body, actorName: profile.fullName, createdAt: recordActivity.createdAt })
    .from(recordActivity)
    .leftJoin(profile, eq(profile.id, recordActivity.actorId))
    .where(and(eq(recordActivity.orgId, orgId), eq(recordActivity.appKey, appKey), eq(recordActivity.recordId, id)))
    .orderBy(desc(recordActivity.createdAt));
  return { ok: true, data: rows };
}

/** Registro nuevo en una app propia; nace en su primera etapa. Las base se crean desde sus pantallas de siempre. */
export async function createRecord(userId: string, orgId: string, appKey: string, title: string, opts: ChainOpts = {}): Promise<Result<{ id: string }>> {
  const g = await gate(userId, orgId, appKey, true);
  if (g.error) return g.error;
  if (g.app.kind !== "custom") return fail("En esta app los registros se crean desde su pantalla de siempre.");
  const t = z.string().trim().min(1).max(120).safeParse(title);
  if (!t.success) return fail("Ponle un nombre.");
  const stage = await firstStage(g.app.id);
  if (!stage) return fail("Esta app no tiene etapas.");
  const [row] = await db.insert(appRecord).values({ orgId, appId: g.app.id, title: t.data, stage, createdBy: userId }).returning({ id: appRecord.id });
  await log(orgId, appKey, g.app.section, row!.id, "cambio", "Registro creado", userId);
  await fire({ orgId, actorId: userId, appKey, recordId: row!.id, type: "creado", depth: opts.depth });
  return { ok: true, data: { id: row!.id } };
}
