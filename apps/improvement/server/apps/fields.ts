// apps/improvement/server/apps/fields.ts
// Los campos extra de cada app: la única puerta que convierte su definición (app_field) en validación.
// Toda escritura de valores extra, en apps base o custom, pasa por schemaFor.
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { APP_FIELD_TYPES, appField, appModel } from "@jotapuntoce/db/schema";
import { assertMembership, findOwnerMembership } from "../auth/guard.ts";
import { ensureOrgApps } from "./catalog.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
const fail = (message: string, code = "VALIDATION_ERROR"): Result<never> => ({ ok: false, error: { code, message } });

export type FieldType = (typeof APP_FIELD_TYPES)[number];
export interface FieldDef { key: string; label: string; type: FieldType; options: string[]; required: boolean }

function valueSchema(f: FieldDef): z.ZodType<unknown> {
  switch (f.type) {
    case "texto": return z.string().trim().max(2000);
    case "numero": return z.coerce.number();
    case "dinero": return z.coerce.number().min(0).transform((pesos) => Math.round(pesos * 100));
    case "fecha": return z.iso.date();
    case "opcion": return z.enum(f.options as [string, ...string[]]);
    case "si_no": return z.union([z.boolean(), z.enum(["on", "true", "false"]).transform((v) => v !== "false")]);
  }
}

/** Esquema zod de los valores extra. Vacío ("" o null) cuenta como ausente. */
export function schemaFor(fields: FieldDef[]): z.ZodType<Record<string, unknown>> {
  const shape: Record<string, z.ZodType<unknown>> = {};
  for (const f of fields) {
    const base = z.preprocess((v) => (v === "" || v === null ? undefined : v), valueSchema(f));
    shape[f.key] = f.required ? base : base.optional();
  }
  return z.object(shape).strip() as z.ZodType<Record<string, unknown>>;
}

export async function listFields(userId: string, orgId: string, appKey: string): Promise<FieldDef[]> {
  await assertMembership(userId, orgId);
  return db
    .select({ key: appField.key, label: appField.label, type: appField.type, options: appField.options, required: appField.required })
    .from(appField)
    .innerJoin(appModel, eq(appModel.id, appField.appId))
    .where(and(eq(appField.orgId, orgId), eq(appModel.key, appKey)))
    .orderBy(asc(appField.position));
}

const addSchema = z.object({
  label: z.string().trim().min(2, "El campo lleva un nombre de 2 a 60 letras.").max(60),
  type: z.enum(APP_FIELD_TYPES),
  options: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  required: z.boolean().default(false),
});

const toKey = (label: string) =>
  label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "c_$1").slice(0, 40);

/** El dueño agrega un campo extra a una app. La llave sale del nombre y no cambia aunque lo renombre. */
export async function addField(userId: string, orgId: string, appKey: string, input: unknown): Promise<Result<FieldDef>> {
  if (!(await findOwnerMembership(userId, orgId))) return fail("Solo el dueño agrega campos.", "FORBIDDEN");
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Datos inválidos.");
  if (parsed.data.type === "opcion" && parsed.data.options.length === 0) return fail("Un campo de opción necesita opciones.");
  await ensureOrgApps(orgId);
  const [app] = await db.select({ id: appModel.id }).from(appModel).where(and(eq(appModel.orgId, orgId), eq(appModel.key, appKey)));
  if (!app) return fail("Esa app no existe.", "NOT_FOUND");
  const key = toKey(parsed.data.label);
  if (!/^[a-z][a-z0-9_]{1,39}$/.test(key)) return fail("El nombre necesita letras o números.");
  const existing = await db.select({ key: appField.key }).from(appField).where(eq(appField.appId, app.id));
  if (existing.some((f) => f.key === key)) return fail("Ya hay un campo con ese nombre.");
  const [row] = await db
    .insert(appField)
    .values({ orgId, appId: app.id, key, label: parsed.data.label, type: parsed.data.type, options: parsed.data.options, required: parsed.data.required, position: existing.length })
    .returning();
  return { ok: true, data: { key: row!.key, label: row!.label, type: row!.type, options: row!.options, required: row!.required } };
}
