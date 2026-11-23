// Apps que crea el dueño: su fila en app_model (kind 'custom'), sus etapas y el adaptador que las
// conecta a las vistas genéricas sobre app_record. Entran por la misma puerta que las base (records.ts).
import { and, asc, desc, eq, ilike, max } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { appGroup, appModel, appRecord, appStage } from "@jotapuntoce/db/schema";
import { findOwnerMembership } from "../auth/guard.ts";
import { ensureOrgApps } from "./catalog.ts";
import type { Adapter, AppRecord } from "./adapters.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
const fail = (message: string, code = "VALIDATION_ERROR") => ({ ok: false as const, error: { code, message } });

/** "Mascotas atendidas" → "mascotas-atendidas": llave estable para la URL y las etapas. */
export const slugKey = (name: string) =>
  name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

const Input = z.object({
  name: z.string().trim().min(2, "El nombre lleva de 2 a 40 letras.").max(40),
  groupName: z.string().trim().min(2, "El grupo lleva de 2 a 30 letras.").max(30),
  stages: z.array(z.string().trim().min(1).max(30)).min(1, "Pon al menos una etapa.").max(12),
});

export async function createCustomApp(userId: string, orgId: string, input: unknown): Promise<Result<{ key: string }>> {
  if (!(await findOwnerMembership(userId, orgId))) return fail("Solo el dueño crea aplicaciones.", "FORBIDDEN");
  const parsed = Input.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Datos inválidos.");
  const { name, groupName, stages } = parsed.data;
  const key = slugKey(name);
  if (!key) return fail("Ese nombre no sirve para una aplicación.");
  await ensureOrgApps(orgId);
  return db.transaction(async (tx) => {
    const [taken] = await tx.select({ id: appModel.id }).from(appModel).where(and(eq(appModel.orgId, orgId), eq(appModel.key, key)));
    if (taken) return fail("Ya tienes una aplicación con ese nombre.", "CONFLICT");
    const [group] = await tx.select({ id: appGroup.id }).from(appGroup).where(and(eq(appGroup.orgId, orgId), eq(appGroup.name, groupName)));
    const groupId = group?.id ?? (await tx.insert(appGroup).values({ orgId, name: groupName, position: 99 }).returning({ id: appGroup.id }))[0]!.id;
    const [{ last } = { last: 0 }] = await tx.select({ last: max(appModel.position) }).from(appModel).where(eq(appModel.orgId, orgId));
    const [app] = await tx
      .insert(appModel)
      .values({ orgId, key, name, kind: "custom", section: "aplicaciones", icon: "grid", groupId, position: (last ?? 0) + 1 })
      .returning({ id: appModel.id });
    const used = new Set<string>();
    await tx.insert(appStage).values(
      stages.map((s, position) => {
        let k = slugKey(s) || `etapa-${position + 1}`;
        if (used.has(k)) k = `${k}-${position + 1}`;
        used.add(k);
        return { orgId, appId: app!.id, key: k, name: s, position };
      }),
    );
    return { ok: true as const, data: { key } };
  });
}

const toRecord = (r: typeof appRecord.$inferSelect): AppRecord => ({
  id: r.id, title: r.title, subtitle: null, stage: r.stage, amountCents: null, custom: r.data, updatedAt: r.updatedAt,
});

/** El adaptador de una app propia: lee y escribe app_record de esa app; la etapa se valida contra app_stage. */
export function customAdapter(appId: string): Adapter {
  const where = (orgId: string, id: string) => and(eq(appRecord.id, id), eq(appRecord.orgId, orgId), eq(appRecord.appId, appId));
  return {
    async list(orgId, q) {
      const rows = await db
        .select()
        .from(appRecord)
        .where(and(eq(appRecord.orgId, orgId), eq(appRecord.appId, appId), q ? ilike(appRecord.title, `%${q}%`) : undefined))
        .orderBy(desc(appRecord.updatedAt))
        .limit(200);
      return rows.map(toRecord);
    },
    async get(orgId, id) {
      const [r] = await db.select().from(appRecord).where(where(orgId, id));
      return r ? toRecord(r) : undefined;
    },
    async move(_userId, orgId, id, stage) {
      const [ok] = await db.select({ key: appStage.key }).from(appStage).where(and(eq(appStage.appId, appId), eq(appStage.key, stage)));
      if (!ok) return fail("Esa etapa no existe.");
      const [row] = await db.update(appRecord).set({ stage, updatedAt: new Date() }).where(where(orgId, id)).returning({ id: appRecord.id });
      return row ? { ok: true, data: true } : fail("No existe.", "NOT_FOUND");
    },
    async saveCustom(orgId, id, values) {
      const [row] = await db.update(appRecord).set({ data: values, updatedAt: new Date() }).where(where(orgId, id)).returning({ data: appRecord.data });
      return row?.data;
    },
  };
}

/** Primera etapa de la app: donde nace todo registro nuevo. */
export async function firstStage(appId: string): Promise<string | undefined> {
  const [s] = await db.select({ key: appStage.key }).from(appStage).where(eq(appStage.appId, appId)).orderBy(asc(appStage.position)).limit(1);
  return s?.key;
}
