// Alertas que explican (G7): reglas en código, genéricas, que detectan lo que se está cayendo con sus
// números sacados de consultas. La IA solo redacta el porqué y qué hacer, y solo cuando alguien pulsa
// "Explícame" (no se llama sola: costaría dinero aunque nadie la abra). Cada quien ve solo las
// alertas de lo que puede ver: cada regla pasa por el mismo guard que su pantalla.
import { and, desc, eq, inArray, lt, notInArray, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { aiSuggestion, client, deal, objective, ticket } from "@jotapuntoce/db/schema";
import { findOwnerMembership, resolveSection } from "../auth/guard.ts";
import { getAppMeta, listRecords } from "../apps/records.ts";
import { listFields } from "../apps/fields.ts";
import { loadSidebar } from "../apps/sidebar.ts";
import { generateStructured, type SuggestionProvider } from "../ai/gateway.ts";
import { ALERT_SYSTEM_PROMPT, alertSchema, alertText, buildAlertPrompt } from "../ai/prompts/alert.ts";
import { createNeed, referNeedToSummum } from "../needs/mutations.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
const fail = (message: string, code = "VALIDATION_ERROR"): { ok: false; error: { code: string; message: string } } => ({ ok: false, error: { code, message } });

export type AlertRule = "trato_quieto" | "cliente_en_riesgo" | "ticket_viejo" | "objetivo_vencido" | "fecha_vencida";
export interface Alert {
  /** `regla:id` — estable entre lecturas; con él se pide la explicación o se pasa a Summum. */
  key: string;
  rule: AlertRule;
  title: string;
  /** La regla en texto llano: lo que se ve sin IA. */
  detail: string;
  href: string;
  amountCents: number | null;
  days: number;
  explained: string | null;
}

const DAY_MS = 86_400_000;
const QUIET_DEAL_DAYS = 14;
const OLD_TICKET_DAYS = 7;
const OPEN_DEAL = notInArray(deal.stage, ["ganado", "perdido"]);
const MXN = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const daysSince = (d: Date, now: Date) => Math.floor((now.getTime() - d.getTime()) / DAY_MS);

async function ventasAlerts(userId: string, orgId: string, now: Date): Promise<Alert[]> {
  const { scope } = await resolveSection(userId, orgId, "clientes");
  if (scope === "ninguno") return [];
  const quiet = await db
    .select({ id: deal.id, title: deal.title, amountCents: deal.amountCents, updatedAt: deal.updatedAt, clientName: client.name })
    .from(deal)
    .innerJoin(client, eq(client.id, deal.clientId))
    .where(and(eq(deal.orgId, orgId), OPEN_DEAL, lt(deal.updatedAt, new Date(now.getTime() - QUIET_DEAL_DAYS * DAY_MS))));
  const risky = await db
    .select({ id: client.id, name: client.name, amountCents: sql<number>`sum(${deal.amountCents})::bigint`, deals: sql<number>`count(*)::int` })
    .from(client)
    .innerJoin(deal, and(eq(deal.clientId, client.id), OPEN_DEAL))
    .where(and(eq(client.orgId, orgId), eq(client.healthStatus, "at_risk")))
    .groupBy(client.id, client.name);
  return [
    ...quiet.map((d) => {
      const days = daysSince(d.updatedAt, now);
      return {
        key: `trato_quieto:${d.id}`, rule: "trato_quieto" as const, title: `«${d.title}» lleva ${days} días sin moverse`,
        detail: `Trato abierto con ${d.clientName} por ${MXN.format(d.amountCents / 100)} sin cambios en ${days} días.`,
        href: `/${orgId}/a/ventas/${d.id}`, amountCents: d.amountCents, days, explained: null,
      };
    }),
    ...risky.map((c) => ({
      key: `cliente_en_riesgo:${c.id}`, rule: "cliente_en_riesgo" as const, title: `${c.name} está en riesgo y tiene tratos abiertos`,
      detail: `Cliente marcado en riesgo con ${c.deals} ${c.deals === 1 ? "trato abierto" : "tratos abiertos"} por ${MXN.format(Number(c.amountCents) / 100)}.`,
      href: `/${orgId}/a/clientes/${c.id}`, amountCents: Number(c.amountCents), days: 0, explained: null,
    })),
  ];
}

async function ticketAlerts(userId: string, orgId: string, now: Date): Promise<Alert[]> {
  const { scope } = await resolveSection(userId, orgId, "postventa");
  if (scope === "ninguno") return [];
  const rows = await db
    .select({ id: ticket.id, title: ticket.title, openedAt: ticket.openedAt, clientName: client.name })
    .from(ticket)
    .leftJoin(client, eq(client.id, ticket.clientId))
    .where(and(eq(ticket.orgId, orgId), inArray(ticket.status, ["abierto", "en_proceso"]), lt(ticket.openedAt, new Date(now.getTime() - OLD_TICKET_DAYS * DAY_MS))));
  return rows.map((t) => {
    const days = daysSince(t.openedAt, now);
    return {
      key: `ticket_viejo:${t.id}`, rule: "ticket_viejo" as const, title: `Ticket «${t.title}» abierto hace ${days} días`,
      detail: `Ticket de postventa${t.clientName ? ` de ${t.clientName}` : ""} sin resolver desde hace ${days} días.`,
      href: `/${orgId}/a/postventa/${t.id}`, amountCents: null, days, explained: null,
    };
  });
}

async function objectiveAlerts(userId: string, orgId: string, now: Date): Promise<Alert[]> {
  // El dueño ve los vencidos de toda la empresa; cada empleado, los suyos.
  const owner = await findOwnerMembership(userId, orgId);
  const rows = await db
    .select({ id: objective.id, title: objective.title, dueDate: objective.dueDate })
    .from(objective)
    .where(and(eq(objective.orgId, orgId), inArray(objective.status, ["pending", "in_progress"]), lt(objective.dueDate, now), owner ? undefined : eq(objective.assignedEmployeeId, userId)));
  return rows.map((o) => {
    const days = daysSince(o.dueDate, now);
    return {
      key: `objetivo_vencido:${o.id}`, rule: "objetivo_vencido" as const, title: `Objetivo «${o.title}» vencido hace ${days} días`,
      detail: `Objetivo sin terminar ${days} días después de su fecha límite.`,
      href: `/${orgId}/objetivos`, amountCents: null, days, explained: null,
    };
  });
}

/** Registros de apps propias con un campo fecha ya pasado que no están en su última etapa (la de "hecho"). */
async function dateAlerts(userId: string, orgId: string, now: Date): Promise<Alert[]> {
  const today = now.toISOString().slice(0, 10);
  const apps = (await loadSidebar(userId, orgId)).groups.flatMap((g) => g.apps);
  const out: Alert[] = [];
  for (const a of apps) {
    const meta = await getAppMeta(orgId, a.key);
    if (meta?.kind !== "custom") continue;
    const dates = (await listFields(userId, orgId, a.key)).filter((f) => f.type === "fecha");
    if (!dates.length) continue;
    const r = await listRecords(userId, orgId, a.key);
    if (!r.ok) continue;
    const last = r.data.stages.at(-1)?.key;
    for (const rec of r.data.records) {
      if (rec.stage === last) continue;
      for (const f of dates) {
        const v = rec.custom[f.key];
        if (typeof v !== "string" || v >= today) continue;
        const days = daysSince(new Date(`${v}T00:00:00Z`), new Date(`${today}T00:00:00Z`));
        out.push({
          key: `fecha_vencida:${rec.id}:${f.key}`, rule: "fecha_vencida", title: `${rec.title}: «${f.label}» pasó hace ${days} días`,
          detail: `En ${a.name}, «${f.label}» era el ${v} y el registro sigue en su etapa.`,
          href: `/${orgId}/a/${a.key}/${rec.id}`, amountCents: rec.amountCents, days, explained: null,
        });
      }
    }
  }
  return out;
}

/** Todas las alertas que la persona puede ver, la de más dinero en juego primero y luego la más vieja. */
export async function listAlerts(userId: string, orgId: string, now = new Date()): Promise<Result<Alert[]>> {
  const groups = await Promise.all([ventasAlerts(userId, orgId, now), ticketAlerts(userId, orgId, now), objectiveAlerts(userId, orgId, now), dateAlerts(userId, orgId, now)]);
  const alerts = groups.flat().sort((a, b) => (b.amountCents ?? 0) - (a.amountCents ?? 0) || b.days - a.days);
  if (alerts.length) {
    const explained = await db
      .select({ text: aiSuggestion.suggestionText, keys: sql<string[]>`${aiSuggestion.basedOn}->'alertKeys'` })
      .from(aiSuggestion)
      .where(and(eq(aiSuggestion.orgId, orgId), eq(aiSuggestion.category, "alerta"), sql`${aiSuggestion.basedOn}->'alertKeys' ?| array[${sql.join(alerts.map((a) => sql`${a.key}`), sql`, `)}]::text[]`))
      .orderBy(desc(aiSuggestion.generatedAt));
    for (const a of alerts) a.explained = explained.find((e) => e.keys?.includes(a.key))?.text ?? null;
  }
  return { ok: true, data: alerts };
}

async function findAlert(userId: string, orgId: string, key: string): Promise<Alert | null> {
  const all = await listAlerts(userId, orgId);
  return all.ok ? (all.data.find((a) => a.key === key) ?? null) : null;
}

/** "Explícame": la IA redacta el porqué, lo que está en juego y qué hacer, con los números ya calculados. */
export async function explainAlert(userId: string, orgId: string, key: string, provider?: SuggestionProvider): Promise<Result<string>> {
  const alert = await findAlert(userId, orgId, key);
  if (!alert) return fail("Esa alerta ya no está.", "NOT_FOUND");
  const r = await generateStructured({
    orgId,
    purpose: "alerta",
    category: "alerta",
    system: ALERT_SYSTEM_PROMPT,
    prompt: buildAlertPrompt({ title: alert.title, detail: alert.detail, days: alert.days, amount: alert.amountCents === null ? null : MXN.format(alert.amountCents / 100) }),
    schema: alertSchema,
    toText: alertText,
    basedOn: { alertKeys: [alert.key] },
    provider,
  });
  if (!r.ok) return fail("Improvement no pudo explicarla ahora; la regla de arriba dice lo que pasa.", "AI_UNAVAILABLE");
  return { ok: true, data: r.data.suggestion.suggestionText };
}

/**
 * Puente a Summum (G11): lo que no se arregla dentro de Improvement se vuelve necesidad y se deriva.
 * Solo el dueño; createNeed y referNeedToSummum ya lo exigen y dejan la marca de derivada.
 */
export async function alertToSummum(userId: string, orgId: string, key: string, note: string | null): Promise<Result<{ needId: string }>> {
  if (!(await findOwnerMembership(userId, orgId))) return fail("Solo el dueño pide ayuda a Summum.", "FORBIDDEN");
  const alert = await findAlert(userId, orgId, key);
  if (!alert) return fail("Esa alerta ya no está.", "NOT_FOUND");
  const need = await createNeed(userId, orgId, {
    title: alert.title.slice(0, 200),
    detail: [alert.detail, alert.explained, note].filter(Boolean).join("\n\n").slice(0, 2000),
    areaId: null,
    severity: alert.amountCents ? 3 : 2,
    source: "improvement",
  });
  if (!need.ok) return need;
  const sent = await referNeedToSummum(userId, orgId, need.data.id, note);
  return sent.ok ? { ok: true, data: { needId: need.data.id } } : sent;
}
