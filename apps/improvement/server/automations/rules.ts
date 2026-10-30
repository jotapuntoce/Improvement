// apps/improvement/server/automations/rules.ts
// Las reglas del dueño: "cuando pase esto en esta app, y se cumpla esto, haz esto". Solo el dueño
// las crea, prueba y activa. Toda referencia (app, etapa, campo, persona) se valida contra su
// empresa al guardar, y la regla nace en "prueba": anota lo que haría sin hacerlo.
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { appModel, appStage, automationRule, automationRun, AUTOMATION_STATUSES, membership, type AutomationAction, type AutomationCondition, type AutomationTrigger } from "@jotapuntoce/db/schema";
import { findOwnerMembership } from "../auth/guard.ts";
import { listFields } from "../apps/fields.ts";
import { getAppMeta, listRecords } from "../apps/records.ts";
import { matchesConditions } from "./engine.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
const fail = (message: string, code = "VALIDATION_ERROR"): { ok: false; error: { code: string; message: string } } => ({ ok: false, error: { code, message } });

export type RuleRow = typeof automationRule.$inferSelect;
export type RunRow = typeof automationRun.$inferSelect;

const key = z.string().min(1).max(60);
const days = z.number().int().min(-365).max(365);
const title = z.string().trim().min(1).max(160);
const triggerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("creado") }),
  z.object({ type: z.literal("etapa"), to: key.optional() }),
  z.object({ type: z.literal("campo"), field: key }),
  z.object({ type: z.literal("fecha"), field: key, days }),
  z.object({ type: z.literal("sin_actividad"), days: days.min(1) }),
]);
const conditionSchema = z.object({
  field: key,
  op: z.enum(["es", "no_es", "mayor", "menor", "vacio", "no_vacio"]),
  value: z.union([z.string().max(200), z.number(), z.boolean()]).optional(),
});
const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("crear_registro"), app: key, title }),
  z.object({ type: z.literal("mover_etapa"), stage: key }),
  z.object({ type: z.literal("actualizar_campos"), values: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal("crear_tarea"), assigneeId: z.uuid(), title, dueInDays: z.number().int().min(0).max(365).optional() }),
  z.object({ type: z.literal("crear_objetivo"), assigneeId: z.uuid(), title, impactWeight: z.number().int().min(1).max(100), dueInDays: z.number().int().min(1).max(365) }),
  z.object({ type: z.literal("avisar"), userId: z.uuid(), text: z.string().trim().min(1).max(300), channel: z.enum(["in_app", "email"]) }),
  z.object({ type: z.literal("experiencia_lealtad"), title: z.string().trim().min(3).max(160) }),
]);
export const ruleSchema = z.object({
  name: z.string().trim().min(1, "Ponle nombre a la regla.").max(80),
  appKey: key,
  trigger: triggerSchema,
  conditions: z.array(conditionSchema).max(10).default([]),
  actions: z.array(actionSchema).min(1, "Agrega al menos una acción.").max(5),
});

/** Campos que entiende una condición además de los extra de la app. */
const BUILTIN_FIELDS = ["etapa", "titulo"];

async function stagesOf(orgId: string, appKey: string): Promise<string[]> {
  const rows = await db
    .select({ key: appStage.key })
    .from(appStage)
    .innerJoin(appModel, eq(appModel.id, appStage.appId))
    .where(and(eq(appStage.orgId, orgId), eq(appModel.key, appKey)))
    .orderBy(asc(appStage.position));
  return rows.map((r) => r.key);
}

/** Lo que la regla nombra tiene que existir en esta empresa; devuelve el primer problema o null. */
async function problemWith(userId: string, orgId: string, rule: z.infer<typeof ruleSchema>): Promise<string | null> {
  const app = await getAppMeta(orgId, rule.appKey);
  if (!app) return "Esa app no existe.";
  const [stages, fields, members] = await Promise.all([
    stagesOf(orgId, rule.appKey),
    listFields(userId, orgId, rule.appKey),
    db.select({ userId: membership.userId }).from(membership).where(eq(membership.orgId, orgId)),
  ]);
  const fieldKeys = new Set([...BUILTIN_FIELDS, ...fields.map((f) => f.key)]);
  const people = new Set(members.map((m) => m.userId));
  const t = rule.trigger;
  if (t.type === "etapa" && t.to && !stages.includes(t.to)) return "Esa etapa no existe en la app.";
  if ((t.type === "campo" || t.type === "fecha") && !fieldKeys.has(t.field)) return "Ese campo no existe en la app.";
  if (t.type === "fecha" && fields.find((f) => f.key === t.field)?.type !== "fecha") return "Ese campo no es una fecha.";
  for (const c of rule.conditions) if (!fieldKeys.has(c.field)) return `El campo «${c.field}» no existe en la app.`;
  for (const a of rule.actions) {
    if (a.type === "mover_etapa" && !stages.includes(a.stage)) return "Esa etapa no existe en la app.";
    if (a.type === "actualizar_campos" && Object.keys(a.values).some((k) => !fieldKeys.has(k))) return "Uno de los campos no existe en la app.";
    if ((a.type === "crear_tarea" || a.type === "crear_objetivo") && !people.has(a.assigneeId)) return "Esa persona no es de tu equipo.";
    if (a.type === "avisar" && !people.has(a.userId)) return "Esa persona no es de tu equipo.";
    if (a.type === "crear_registro" && (await getAppMeta(orgId, a.app))?.kind !== "custom") return "Solo se crean registros en tus apps propias.";
    if (a.type === "experiencia_lealtad" && rule.appKey !== "clientes") return "Las experiencias de lealtad solo van en Clientes.";
  }
  return null;
}

export async function createRule(userId: string, orgId: string, input: unknown): Promise<Result<{ id: string }>> {
  if (!(await findOwnerMembership(userId, orgId))) return fail("Solo el dueño crea automatizaciones.", "FORBIDDEN");
  const parsed = ruleSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "La regla no está completa.");
  const problem = await problemWith(userId, orgId, parsed.data);
  if (problem) return fail(problem);
  const { trigger, conditions, actions, ...rest } = parsed.data;
  const [row] = await db
    .insert(automationRule)
    .values({ ...rest, orgId, trigger: trigger as AutomationTrigger, conditions: conditions as AutomationCondition[], actions: actions as AutomationAction[], createdBy: userId })
    .returning({ id: automationRule.id });
  return { ok: true, data: { id: row!.id } };
}

async function ownersRule(userId: string, orgId: string, ruleId: string): Promise<RuleRow | null> {
  if (!(await findOwnerMembership(userId, orgId)) || !z.uuid().safeParse(ruleId).success) return null;
  const [row] = await db.select().from(automationRule).where(and(eq(automationRule.id, ruleId), eq(automationRule.orgId, orgId)));
  return row ?? null;
}

export async function setRuleStatus(userId: string, orgId: string, ruleId: string, status: unknown): Promise<Result<true>> {
  const rule = await ownersRule(userId, orgId, ruleId);
  if (!rule) return fail("Esa automatización no existe.", "NOT_FOUND");
  const s = z.enum(AUTOMATION_STATUSES).safeParse(status);
  if (!s.success) return fail("Ese estado no existe.");
  // Quien la activa pasa a ser quien la ejecuta: el motor actúa como el dueño que la creó.
  await db.update(automationRule).set({ status: s.data, createdBy: userId }).where(eq(automationRule.id, rule.id));
  return { ok: true, data: true };
}

export async function listRules(userId: string, orgId: string): Promise<Result<RuleRow[]>> {
  if (!(await findOwnerMembership(userId, orgId))) return fail("Solo el dueño ve las automatizaciones.", "FORBIDDEN");
  return { ok: true, data: await db.select().from(automationRule).where(eq(automationRule.orgId, orgId)).orderBy(desc(automationRule.createdAt)) };
}

export async function getRule(userId: string, orgId: string, ruleId: string): Promise<Result<RuleRow & { runs: RunRow[] }>> {
  const rule = await ownersRule(userId, orgId, ruleId);
  if (!rule) return fail("Esa automatización no existe.", "NOT_FOUND");
  const runs = await db.select().from(automationRun).where(eq(automationRun.ruleId, rule.id)).orderBy(desc(automationRun.createdAt)).limit(30);
  return { ok: true, data: { ...rule, runs } };
}

/** Los registros de hoy que cumplen las condiciones. No escribe nada. */
export async function testRule(userId: string, orgId: string, ruleId: string): Promise<Result<{ matches: { id: string; title: string }[] }>> {
  const rule = await ownersRule(userId, orgId, ruleId);
  if (!rule) return fail("Esa automatización no existe.", "NOT_FOUND");
  const list = await listRecords(userId, orgId, rule.appKey);
  if (!list.ok) return list;
  return { ok: true, data: { matches: list.data.records.filter((r) => matchesConditions(rule.conditions, r)).map((r) => ({ id: r.id, title: r.title })) } };
}
