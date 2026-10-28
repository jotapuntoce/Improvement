// La puerta única de las vistas genéricas: guard por sección, adaptador de la app y bitácora.
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { appModel, appStage, profile, recordActivity } from "@jotapuntoce/db/schema";
import { resolveSection } from "../auth/guard.ts";
import { BASE_APPS, ensureOrgApps } from "./catalog.ts";
import { ADAPTERS, type AppRecord } from "./adapters.ts";
import { listFields, schemaFor } from "./fields.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
const fail = (message: string, code = "VALIDATION_ERROR"): { ok: false; error: { code: string; message: string } } => ({ ok: false, error: { code, message } });

export type { AppRecord };
export interface ActivityItem { kind: "nota" | "cambio"; body: string; actorName: string | null; createdAt: Date }

/** Lectura: cualquier alcance distinto de "ninguno". Escritura: solo "empresa", igual que las apps base. */
async function gate(userId: string, orgId: string, appKey: string, write: boolean) {
  const app = BASE_APPS.find((a) => a.key === appKey);
  if (!app) return { error: fail("Esa app no existe.", "NOT_FOUND") };
  const { scope } = await resolveSection(userId, orgId, app.section);
  if (scope === "ninguno" || (write && scope !== "empresa")) return { error: fail("No tienes acceso a esta app.", "FORBIDDEN") };
  return { app, adapter: ADAPTERS[app.key] };
}

const isUuid = (id: string) => z.uuid().safeParse(id).success;

export async function listRecords(
  userId: string,
  orgId: string,
  appKey: string,
  opts: { q?: string } = {},
): Promise<Result<{ records: AppRecord[]; stages: { key: string; name: string }[] }>> {
  const g = await gate(userId, orgId, appKey, false);
  if (g.error) return g.error;
  const q = z.string().trim().max(80).safeParse(opts.q ?? "");
  await ensureOrgApps(orgId);
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

export async function moveRecord(userId: string, orgId: string, appKey: string, id: string, stage: string): Promise<Result<true>> {
  const g = await gate(userId, orgId, appKey, true);
  if (g.error) return g.error;
  const before = isUuid(id) ? await g.adapter.get(orgId, id) : undefined;
  if (!before) return fail("No existe.", "NOT_FOUND");
  const r = await g.adapter.move(userId, orgId, id, stage);
  if (r.ok && before.stage !== stage) await log(orgId, appKey, g.app.section, id, "cambio", `Etapa: ${before.stage} → ${stage}`, userId);
  return r;
}

export async function saveCustomValues(userId: string, orgId: string, appKey: string, id: string, values: unknown): Promise<Result<Record<string, unknown>>> {
  const g = await gate(userId, orgId, appKey, true);
  if (g.error) return g.error;
  if (!isUuid(id)) return fail("No existe.", "NOT_FOUND");
  const parsed = schemaFor(await listFields(userId, orgId, appKey)).safeParse(values);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Datos inválidos.");
  const saved = await g.adapter.saveCustom(orgId, id, parsed.data);
  if (!saved) return fail("No existe.", "NOT_FOUND");
  await log(orgId, appKey, g.app.section, id, "cambio", "Campos actualizados", userId);
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
