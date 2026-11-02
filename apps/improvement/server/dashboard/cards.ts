// El tablero del inicio: las tarjetas de cada persona (una fila de dashboard_card por tarjeta) y los
// datos de cada una. Los datos salen de las mismas funciones con guard que usan las pantallas
// (listRecords, listInbox, celebrations), así que una tarjeta nunca enseña lo que la persona no ve.
import { and, asc, eq, max } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { dashboardCard, orgKpi, DASHBOARD_CARD_KINDS } from "@jotapuntoce/db/schema";
import { assertMembership, findOwnerMembership } from "../auth/guard.ts";
import { getAppMeta, listRecords } from "../apps/records.ts";
import { listFields } from "../apps/fields.ts";
import { loadSidebar } from "../apps/sidebar.ts";
import { listInbox, type InboxItem } from "../tasks/inbox.ts";
import { celebrations, type Celebration } from "../people/culture.ts";
import { computeKpiValues } from "../kpis/sources.ts";
import { listAlerts, type Alert } from "../insights/alerts.ts";
import { forecast, revenueVsGoal, type Forecast, type RevenueRow } from "../insights/forecast.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
const fail = (message: string, code = "VALIDATION_ERROR"): { ok: false; error: { code: string; message: string } } => ({ ok: false, error: { code, message } });

export type CardKind = (typeof DASHBOARD_CARD_KINDS)[number];
export interface Card { id: string; kind: CardKind; title: string; config: Record<string, unknown>; position: number }

const appKey = z.string().trim().min(1).max(40);
const title = z.string().trim().min(1).max(60).optional();
/** Lo que se puede pedir por tipo. Los tipos sin config ("hoy", "alertas"…) solo llevan título. */
export const cardInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("numero"), title, config: z.union([
    z.object({ kpiId: z.uuid() }),
    // "monto" es el monto del registro (Ventas); otra llave es un campo número o dinero de la app.
    z.object({ app: appKey, op: z.enum(["contar", "sumar"]), field: z.string().max(40).optional(), stage: z.string().max(60).optional() }),
  ]) }),
  // `by`: "etapa" o la llave de un campo de tipo opción.
  z.object({ kind: z.literal("barras"), title, config: z.object({ app: appKey, by: z.string().max(40).default("etapa") }) }),
  z.object({ kind: z.literal("embudo"), title, config: z.object({ app: appKey }) }),
  z.object({ kind: z.literal("lista"), title, config: z.object({ app: appKey, stage: z.string().max(60).optional() }) }),
  // Metas en centavos por opción del campo; sin campo, la llave "total".
  z.object({ kind: z.literal("ingresos_meta"), title, config: z.object({ field: z.string().max(40).optional(), goals: z.record(z.string().max(60), z.number().int().min(0)).default({}) }) }),
  ...(["hoy", "alertas", "momentos", "pronostico", "que_falta"] as const).map((k) => z.object({ kind: z.literal(k), title, config: z.object({}).default({}) })),
]);
export type CardInput = z.input<typeof cardInput>;

/** Lo que solo ve el dueño: el dinero de toda la empresa y la configuración del proceso. */
const OWNER_ONLY = new Set<CardKind>(["ingresos_meta", "pronostico", "que_falta"]);
const DEFAULT_TITLE: Record<CardKind, string> = {
  numero: "Número", barras: "Por etapa", embudo: "Embudo", lista: "Lista", hoy: "Lo que toca hoy", alertas: "Alertas",
  momentos: "Momentos importantes", ingresos_meta: "Ingresos del mes contra meta", pronostico: "Pronóstico de ventas", que_falta: "Qué falta en tu proceso",
};

export async function listCards(userId: string, orgId: string): Promise<Result<Card[]>> {
  await assertMembership(userId, orgId);
  const rows = await db
    .select({ id: dashboardCard.id, kind: dashboardCard.kind, title: dashboardCard.title, config: dashboardCard.config, position: dashboardCard.position })
    .from(dashboardCard)
    .where(and(eq(dashboardCard.orgId, orgId), eq(dashboardCard.userId, userId)))
    .orderBy(asc(dashboardCard.position), asc(dashboardCard.createdAt));
  return { ok: true, data: rows.map((r) => ({ ...r, config: r.config as Record<string, unknown> })) };
}

/** Valida que la persona pueda ver lo que la tarjeta pide; devuelve el título por defecto. */
async function check(userId: string, orgId: string, input: z.infer<typeof cardInput>): Promise<Result<string>> {
  const owner = await findOwnerMembership(userId, orgId);
  if (OWNER_ONLY.has(input.kind) && !owner) return fail("Esa tarjeta es solo para el dueño.", "FORBIDDEN");
  const cfg = input.config as Record<string, unknown>;
  if ("kpiId" in cfg) {
    if (!owner) return fail("Los indicadores de la empresa son solo para el dueño.", "FORBIDDEN");
    const [k] = await db.select({ label: orgKpi.label }).from(orgKpi).where(and(eq(orgKpi.id, cfg.kpiId as string), eq(orgKpi.orgId, orgId)));
    return k ? { ok: true, data: k.label } : fail("Ese indicador no existe.", "NOT_FOUND");
  }
  if (typeof cfg.app === "string") {
    const seen = await listRecords(userId, orgId, cfg.app);
    if (!seen.ok) return seen;
    const app = await getAppMeta(orgId, cfg.app);
    return { ok: true, data: `${DEFAULT_TITLE[input.kind]} · ${app!.name}` };
  }
  return { ok: true, data: DEFAULT_TITLE[input.kind] };
}

export async function addCard(userId: string, orgId: string, input: unknown): Promise<Result<{ id: string }>> {
  await assertMembership(userId, orgId);
  const parsed = cardInput.safeParse(input);
  if (!parsed.success) return fail("Esa tarjeta no es válida.");
  const ok = await check(userId, orgId, parsed.data);
  if (!ok.ok) return ok;
  const [last] = await db.select({ top: max(dashboardCard.position) }).from(dashboardCard).where(and(eq(dashboardCard.orgId, orgId), eq(dashboardCard.userId, userId)));
  const [row] = await db
    .insert(dashboardCard)
    .values({ orgId, userId, kind: parsed.data.kind, title: parsed.data.title ?? ok.data, config: parsed.data.config, position: (last?.top ?? -1) + 1 })
    .returning({ id: dashboardCard.id });
  return { ok: true, data: { id: row!.id } };
}

/** Cambia de lugar con la vecina de arriba o de abajo. */
export async function moveCard(userId: string, orgId: string, id: string, dir: "arriba" | "abajo"): Promise<Result<true>> {
  const cards = await listCards(userId, orgId);
  if (!cards.ok) return cards;
  const i = cards.data.findIndex((c) => c.id === id);
  if (i < 0) return fail("Esa tarjeta no es tuya.", "NOT_FOUND");
  const j = dir === "arriba" ? i - 1 : i + 1;
  if (j < 0 || j >= cards.data.length) return { ok: true, data: true };
  const order = [...cards.data];
  [order[i], order[j]] = [order[j]!, order[i]!];
  // Renumera todo: las posiciones viejas pueden venir repetidas (empate roto por created_at).
  await db.transaction(async (tx) => {
    for (const [position, c] of order.entries()) await tx.update(dashboardCard).set({ position, updatedAt: new Date() }).where(eq(dashboardCard.id, c.id));
  });
  return { ok: true, data: true };
}

export async function removeCard(userId: string, orgId: string, id: string): Promise<Result<true>> {
  await assertMembership(userId, orgId);
  const [row] = await db
    .delete(dashboardCard)
    .where(and(eq(dashboardCard.id, id), eq(dashboardCard.orgId, orgId), eq(dashboardCard.userId, userId)))
    .returning({ id: dashboardCard.id });
  return row ? { ok: true, data: true } : fail("Esa tarjeta no es tuya.", "NOT_FOUND");
}

/**
 * La primera vez que alguien abre su inicio sin tarjetas, le arma uno según su rol (G4): el dueño ve
 * el negocio; el empleado, lo suyo. Sin IA: el rol alcanza y cada entrada costaría una llamada.
 */
export async function seedDefaultCards(userId: string, orgId: string): Promise<Result<Card[]>> {
  const current = await listCards(userId, orgId);
  if (!current.ok || current.data.length) return current;
  const owner = await findOwnerMembership(userId, orgId);
  const first = owner ? null : (await loadSidebar(userId, orgId)).groups[0]?.apps[0];
  const picks: { kind: CardKind; config: Record<string, unknown> }[] = owner
    ? [{ kind: "hoy", config: {} }, { kind: "alertas", config: {} }, { kind: "ingresos_meta", config: { goals: {} } }, { kind: "embudo", config: { app: "ventas" } }, { kind: "pronostico", config: {} }]
    : [{ kind: "hoy", config: {} }, { kind: "momentos", config: {} }, ...(first ? [{ kind: "lista" as const, config: { app: first.key } }] : [])];
  // Una que no se pueda ver (p. ej. Ventas apagada) se salta en silencio: es una sugerencia. Un solo
  // insert: sembrar con addCard una por una son decenas de viajes a la base.
  const values = [];
  for (const p of picks) {
    const app = typeof p.config.app === "string" ? await getAppMeta(orgId, p.config.app) : null;
    if (typeof p.config.app === "string" && (!app || !(await listRecords(userId, orgId, p.config.app)).ok)) continue;
    values.push({ orgId, userId, kind: p.kind, title: app ? `${DEFAULT_TITLE[p.kind]} · ${app.name}` : DEFAULT_TITLE[p.kind], config: p.config, position: values.length });
  }
  if (values.length) await db.insert(dashboardCard).values(values);
  return listCards(userId, orgId);
}

export type CardData =
  | { kind: "numero"; value: number; format: "numero" | "dinero" | "porcentaje" }
  | { kind: "barras" | "embudo"; bars: { label: string; count: number; amountCents: number }[] }
  | { kind: "lista"; items: { title: string; href: string }[]; more: number }
  | { kind: "hoy"; items: InboxItem[] }
  | { kind: "momentos"; items: Celebration[] }
  | { kind: "alertas"; items: Alert[]; more: number }
  | { kind: "pronostico"; forecast: Forecast }
  | { kind: "ingresos_meta"; rows: RevenueRow[] };

const NO_ACCESS = () => fail("Ya no tienes acceso a esta app.", "NO_ACCESS");
const numeric = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : 0);

/** Los datos de una tarjeta, calculados con los permisos de quien la ve hoy (no de cuando la agregó). */
export async function cardData(userId: string, orgId: string, card: Card): Promise<Result<CardData>> {
  const cfg = card.config;
  if (OWNER_ONLY.has(card.kind) && !(await findOwnerMembership(userId, orgId))) return NO_ACCESS();
  switch (card.kind) {
    case "hoy": {
      const r = await listInbox(userId, orgId);
      return r.ok ? { ok: true, data: { kind: "hoy", items: r.data.slice(0, 8) } } : r;
    }
    case "momentos":
      return { ok: true, data: { kind: "momentos", items: await celebrations(userId, orgId) } };
    case "alertas": {
      const r = await listAlerts(userId, orgId);
      return r.ok ? { ok: true, data: { kind: "alertas", items: r.data.slice(0, 5), more: Math.max(0, r.data.length - 5) } } : r;
    }
    case "numero": {
      if (typeof cfg.kpiId === "string") {
        if (!(await findOwnerMembership(userId, orgId))) return NO_ACCESS();
        const [k] = await db.select().from(orgKpi).where(and(eq(orgKpi.id, cfg.kpiId), eq(orgKpi.orgId, orgId)));
        if (!k) return fail("Ese indicador ya no existe.", "NOT_FOUND");
        const value = (await computeKpiValues([k])).get(k.id) ?? 0;
        return { ok: true, data: { kind: "numero", value, format: k.format as "numero" | "dinero" | "porcentaje" } };
      }
      const r = await listRecords(userId, orgId, cfg.app as string);
      if (!r.ok) return NO_ACCESS();
      const recs = cfg.stage ? r.data.records.filter((x) => x.stage === cfg.stage) : r.data.records;
      if (cfg.op === "contar") return { ok: true, data: { kind: "numero", value: recs.length, format: "numero" } };
      const field = (cfg.field as string | undefined) ?? "monto";
      const type = field === "monto" ? "dinero" : (await listFields(userId, orgId, cfg.app as string)).find((f) => f.key === field)?.type;
      const value = recs.reduce((s, x) => s + (field === "monto" ? (x.amountCents ?? 0) : numeric(x.custom[field])), 0);
      return { ok: true, data: { kind: "numero", value, format: type === "dinero" ? "dinero" : "numero" } };
    }
    case "barras":
    case "embudo": {
      const r = await listRecords(userId, orgId, cfg.app as string);
      if (!r.ok) return NO_ACCESS();
      const by = card.kind === "embudo" ? "etapa" : ((cfg.by as string | undefined) ?? "etapa");
      const groups = by === "etapa"
        ? r.data.stages.map((s) => ({ key: s.key, label: s.name }))
        : ((await listFields(userId, orgId, cfg.app as string)).find((f) => f.key === by)?.options ?? []).map((o) => ({ key: o, label: o }));
      const keyOf = (x: (typeof r.data.records)[number]) => (by === "etapa" ? x.stage : String(x.custom[by] ?? ""));
      const bars = groups.map((g) => {
        const inGroup = r.data.records.filter((x) => keyOf(x) === g.key);
        return { label: g.label, count: inGroup.length, amountCents: inGroup.reduce((s, x) => s + (x.amountCents ?? 0), 0) };
      });
      return { ok: true, data: { kind: card.kind, bars } };
    }
    case "lista": {
      const r = await listRecords(userId, orgId, cfg.app as string);
      if (!r.ok) return NO_ACCESS();
      const recs = cfg.stage ? r.data.records.filter((x) => x.stage === cfg.stage) : r.data.records;
      return { ok: true, data: { kind: "lista", items: recs.slice(0, 5).map((x) => ({ title: x.title, href: `/${orgId}/a/${cfg.app as string}/${x.id}` })), more: Math.max(0, recs.length - 5) } };
    }
    case "pronostico": {
      const r = await forecast(userId, orgId);
      return r.ok ? { ok: true, data: { kind: "pronostico", forecast: r.data } } : r;
    }
    case "ingresos_meta": {
      const r = await revenueVsGoal(userId, orgId, { field: cfg.field as string | undefined, goals: (cfg.goals as Record<string, number> | undefined) ?? {} });
      return r.ok ? { ok: true, data: { kind: "ingresos_meta", rows: r.data } } : r;
    }
    default:
      // que_falta llega en T7.
      return fail("Esta tarjeta todavía no está lista.", "PENDIENTE");
  }
}
