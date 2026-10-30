// apps/improvement/server/automations/engine.ts
// El motor: cuando pasa algo en un registro, evalúa las reglas de esa app. En "prueba" solo anota lo
// que habría hecho; en "activa" lo hace COMO EL DUEÑO que creó la regla (si ya no es dueño, la regla
// se pausa). Interno: lo llaman records.ts y el cron, que ya autorizaron. Nunca lanza: lo que falla
// queda en automation_run y el guardado que lo disparó sigue hecho.
import { and, eq, inArray, max, ne, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { automationRule, automationRun, recordActivity, type AutomationAction, type AutomationCondition, type AutomationTrigger } from "@jotapuntoce/db/schema";
import { findMembership } from "../auth/guard.ts";
import { addNote, createRecord, loadRecord, loadRecords, moveRecord, saveCustomValues, type AppRecord } from "../apps/records.ts";
import { grantExperience } from "../crm/loyalty.ts";
import { createObjective } from "../objectives/mutations.ts";
import { createTask } from "../tasks/inbox.ts";

export interface AutomationEvent { orgId: string; actorId: string; appKey: string; recordId: string; type: "creado" | "etapa" | "campo"; stage?: string; fields?: string[]; depth?: number }
type RuleRow = typeof automationRule.$inferSelect;

/** Una cadena de reglas que se disparan entre sí se corta aquí. */
export const MAX_DEPTH = 3;
const DAY_MS = 86_400_000;

/** La fecha del día en CDMX, como la ve el negocio. */
export const cdmxDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });

/** El valor de un campo del registro para una condición: "etapa", "titulo" o un campo extra. */
function valueOf(rec: AppRecord, field: string): unknown {
  if (field === "etapa") return rec.stage;
  if (field === "titulo") return rec.title;
  return rec.custom[field];
}

function holds(c: AutomationCondition, rec: AppRecord): boolean {
  const v = valueOf(rec, c.field);
  const empty = v === undefined || v === null || v === "";
  switch (c.op) {
    case "vacio": return empty;
    case "no_vacio": return !empty;
    case "es": return !empty && String(v) === String(c.value);
    case "no_es": return empty || String(v) !== String(c.value);
    case "mayor": return !empty && Number(v) > Number(c.value);
    case "menor": return !empty && Number(v) < Number(c.value);
  }
}

export function matchesConditions(conditions: AutomationCondition[], rec: AppRecord): boolean {
  return conditions.every((c) => holds(c, rec));
}

/** ¿Esta regla se dispara con este evento sobre este registro? */
export function matches(
  rule: { trigger: AutomationTrigger; conditions: AutomationCondition[] },
  event: AutomationEvent | { type: "tiempo" },
  rec: AppRecord,
  now: Date,
): boolean {
  const t = rule.trigger;
  let fires: boolean;
  if (event.type === "tiempo") {
    if (t.type === "fecha") {
      const raw = rec.custom[t.field];
      if (typeof raw !== "string" || !raw) return false;
      // Por día de CDMX: "hoy" + días del disparador es la fecha del campo.
      fires = new Date(Date.parse(cdmxDay(now)) - t.days * DAY_MS).toISOString().slice(0, 10) === raw.slice(0, 10);
    } else if (t.type === "sin_actividad") {
      fires = now.getTime() - rec.updatedAt.getTime() >= t.days * DAY_MS;
    } else return false;
  } else if (t.type !== event.type) {
    return false;
  } else if (t.type === "etapa") {
    fires = !t.to || t.to === event.stage;
  } else if (t.type === "campo") {
    fires = !!event.fields?.includes(t.field);
  } else fires = true;
  return fires && matchesConditions(rule.conditions, rec);
}

/** En palabras, para la corrida y la bitácora. */
export function describe(a: AutomationAction): string {
  switch (a.type) {
    case "crear_registro": return `crear «${a.title}» en ${a.app}`;
    case "mover_etapa": return `mover a ${a.stage}`;
    case "actualizar_campos": return `llenar ${Object.keys(a.values).join(", ")}`;
    case "crear_tarea": return `crear tarea «${a.title}»`;
    case "crear_objetivo": return `crear objetivo «${a.title}»`;
    case "avisar": return `avisar: ${a.text}`;
    case "experiencia_lealtad": return `registrar experiencia «${a.title}»`;
  }
}

type Done = { ok: true } | { ok: false; error: { message: string } };

async function perform(a: AutomationAction, owner: string, rule: RuleRow, rec: AppRecord, orgId: string, depth: number, now: Date): Promise<Done> {
  const appKey = rule.appKey;
  const due = (days?: number) => (days === undefined ? undefined : new Date(now.getTime() + days * DAY_MS));
  switch (a.type) {
    case "crear_registro":
      return createRecord(owner, orgId, a.app, a.title, { depth });
    case "mover_etapa":
      return moveRecord(owner, orgId, appKey, rec.id, a.stage, { depth });
    case "actualizar_campos":
      return saveCustomValues(owner, orgId, appKey, rec.id, { ...rec.custom, ...a.values }, { depth });
    case "crear_tarea":
      return createTask(owner, orgId, { title: a.title, assigneeId: a.assigneeId, dueAt: due(a.dueInDays), appKey, recordId: rec.id }, { source: "automatizacion", ruleId: rule.id });
    case "crear_objetivo":
      return createObjective(owner, orgId, {
        title: a.title, description: null, impactWeight: a.impactWeight, dueDate: due(a.dueInDays), areaId: null,
        assignedEmployeeId: a.assigneeId, needId: null, kind: "non_ipa", evidenceType: "ninguna",
      });
    case "avisar":
      // ponytail: un reminder sin objetivo no le llega a nadie; el aviso cae en la bandeja de la
      // persona con fecha de hoy. El correo llega con las plantillas de la Fase 6.
      return createTask(owner, orgId, { title: `Aviso: ${a.text}`, assigneeId: a.userId, dueAt: now, appKey, recordId: rec.id }, { source: "automatizacion", ruleId: rule.id });
    case "experiencia_lealtad":
      return grantExperience(owner, orgId, { clientId: rec.id, title: a.title, valueCents: 0, grantedOn: cdmxDay(now) });
  }
}

async function record(rule: RuleRow, recordId: string, depth: number, outcome: "hecho" | "prueba" | "error" | "tope", detail: string, day: string) {
  await db.insert(automationRun).values({ orgId: rule.orgId, ruleId: rule.id, recordId, depth, outcome, detail, day }).onConflictDoNothing();
}

/**
 * Corre UNA regla sobre un registro. `day` es la llave de idempotencia: el cron pasa el día (una
 * vez por día); los eventos pasan algo único, porque un registro puede volver a la misma etapa.
 */
export async function runRule(rule: RuleRow, rec: AppRecord, depth: number, day: string, now = new Date()): Promise<void> {
  const detail = rule.actions.map(describe).join("; ");
  try {
    if (depth >= MAX_DEPTH) return record(rule, rec.id, depth, "tope", `Se detuvo en el nivel ${MAX_DEPTH}: ${detail}`, day);
    if (rule.status === "prueba") return record(rule, rec.id, depth, "prueba", `Habría hecho: ${detail}`, day);
    const owner = rule.createdBy && (await findMembership(rule.createdBy, rule.orgId))?.role === "owner" ? rule.createdBy : null;
    if (!owner) {
      await db.update(automationRule).set({ status: "pausada" }).where(eq(automationRule.id, rule.id));
      return record(rule, rec.id, depth, "error", "Quien creó la regla ya no es dueño; se pausó.", day);
    }
    for (const a of rule.actions) {
      const r = await perform(a, owner, rule, rec, rule.orgId, depth + 1, now);
      if (!r.ok) return record(rule, rec.id, depth, "error", `${describe(a)}: ${r.error.message}`, day);
    }
    await record(rule, rec.id, depth, "hecho", detail, day);
    await addNote(owner, rule.orgId, rule.appKey, rec.id, `Automatización «${rule.name}»: ${detail}`);
  } catch (err) {
    await record(rule, rec.id, depth, "error", err instanceof Error ? err.message.slice(0, 500) : "Error inesperado.", day).catch(() => {});
  }
}

/** Evalúa las reglas de la app del registro para un evento. */
export async function runAutomations(event: AutomationEvent): Promise<void> {
  try {
    const rules = await db
      .select()
      .from(automationRule)
      .where(and(eq(automationRule.orgId, event.orgId), eq(automationRule.appKey, event.appKey), inArray(automationRule.status, ["prueba", "activa"])));
    const candidates = rules.filter((r) => r.trigger.type === event.type);
    if (!candidates.length) return;
    const rec = await loadRecord(event.orgId, event.appKey, event.recordId);
    if (!rec) return;
    const now = new Date();
    for (const rule of candidates) {
      if (matches(rule, event, rec, now)) await runRule(rule, rec, event.depth ?? 0, `${cdmxDay(now)} ${crypto.randomUUID()}`, now);
    }
  } catch {
    // El motor nunca hace fallar el guardado que lo disparó.
  }
}

/**
 * Los disparadores de tiempo ("fecha" y "sin_actividad") de todas las empresas. Lo corre el cron una
 * vez al día; no corre en nombre de nadie. Una regla actúa a lo más una vez por día sobre cada
 * registro: lo que ya tiene corrida de hoy se salta.
 */
export async function runTimeTriggers(now = new Date()): Promise<{ rules: number; runs: number }> {
  const rules = await db
    .select()
    .from(automationRule)
    .where(and(inArray(automationRule.status, ["prueba", "activa"]), sql`${automationRule.trigger}->>'type' in ('fecha','sin_actividad')`));
  const day = cdmxDay(now);
  let runs = 0;
  for (const rule of rules) {
    const [records, done, activity] = await Promise.all([
      loadRecords(rule.orgId, rule.appKey),
      db
        .select({ recordId: automationRun.recordId })
        .from(automationRun)
        .where(and(eq(automationRun.ruleId, rule.id), eq(automationRun.day, day), eq(automationRun.depth, 0), ne(automationRun.outcome, "error"))),
      rule.trigger.type === "sin_actividad"
        ? db
            .select({ recordId: recordActivity.recordId, last: max(recordActivity.createdAt) })
            .from(recordActivity)
            .where(and(eq(recordActivity.orgId, rule.orgId), eq(recordActivity.appKey, rule.appKey)))
            .groupBy(recordActivity.recordId)
        : Promise.resolve([]),
    ]);
    const skip = new Set(done.map((d) => d.recordId));
    const lastActivity = new Map(activity.map((a) => [a.recordId, a.last]));
    for (const rec of records) {
      if (skip.has(rec.id)) continue;
      // La última actividad cuenta como "tocado": una nota de ayer reinicia la cuenta.
      const last = lastActivity.get(rec.id);
      const seen = last && last > rec.updatedAt ? { ...rec, updatedAt: last } : rec;
      if (!matches(rule, { type: "tiempo" }, seen, now)) continue;
      // ponytail: el salto de arriba más onConflictDoNothing cubren un cron al día; dos corridas
      // simultáneas podrían actuar dos veces antes de escribir. Reclamar la fila primero si pasa.
      await runRule(rule, rec, 0, day, now);
      runs++;
    }
  }
  return { rules: rules.length, runs };
}
