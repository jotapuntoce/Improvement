// Pronóstico, ingresos contra meta y la base de "¿Qué pasa si?" (G5, G6, G10). Solo Ventas (`deal`):
// es la única app con ganado/perdido. Los números salen de consultas; nada aquí llama a la IA.
// Solo el dueño: son cifras de dinero de toda la empresa.
import { and, eq, gte, inArray, like, notInArray } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { deal, recordActivity } from "@jotapuntoce/db/schema";
import { findOwnerMembership } from "../auth/guard.ts";
import { listFields } from "../apps/fields.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
const FORBIDDEN = { ok: false as const, error: { code: "FORBIDDEN", message: "Solo el dueño ve estas cifras." } };

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 180;
const MIN_CASES = 5;
const OPEN_STAGES = ["prospecto", "propuesta", "negociacion"] as const;
const CLOSED = ["ganado", "perdido"] as const;

/** Inicio del mes en CDMX (sin horario de verano desde 2022: UTC-6 fijo). */
function monthStart(now: Date): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(now);
  return new Date(`${ymd.slice(0, 7)}-01T00:00:00-06:00`);
}

export type Forecast =
  | { sinHistoria: true }
  | { sinHistoria: false; byStage: { stage: string; openCents: number; rate: number; source: "etapa" | "global" }[]; totalCents: number };

/** Pipeline abierto × tasa real de cierre por etapa de los últimos 6 meses. */
export async function forecast(userId: string, orgId: string, now = new Date()): Promise<Result<Forecast>> {
  if (!(await findOwnerMembership(userId, orgId))) return FORBIDDEN;
  const since = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);
  const closed = await db.select({ id: deal.id, stage: deal.stage }).from(deal).where(and(eq(deal.orgId, orgId), gte(deal.closedAt, since)));
  if (!closed.length) return { ok: true, data: { sinHistoria: true } };
  // "Pasó por" una etapa = aparece en su historial "Etapa: a → b".
  const moves = await db
    .select({ recordId: recordActivity.recordId, body: recordActivity.body })
    .from(recordActivity)
    .where(and(eq(recordActivity.orgId, orgId), eq(recordActivity.appKey, "ventas"), inArray(recordActivity.recordId, closed.map((d) => d.id)), like(recordActivity.body, "Etapa:%")));
  const passed = new Map<string, Set<string>>();
  for (const m of moves) {
    const set = passed.get(m.recordId) ?? new Set<string>();
    for (const s of m.body.slice("Etapa:".length).split("→")) set.add(s.trim());
    passed.set(m.recordId, set);
  }
  const globalRate = closed.filter((d) => d.stage === "ganado").length / closed.length;
  const open = await db.select({ stage: deal.stage, amountCents: deal.amountCents }).from(deal).where(and(eq(deal.orgId, orgId), notInArray(deal.stage, [...CLOSED])));
  const byStage = OPEN_STAGES.map((stage) => {
    const cases = closed.filter((d) => passed.get(d.id)?.has(stage));
    const own = cases.length >= MIN_CASES;
    const rate = own ? cases.filter((d) => d.stage === "ganado").length / cases.length : globalRate;
    const openCents = open.filter((d) => d.stage === stage).reduce((s, d) => s + d.amountCents, 0);
    return { stage, openCents, rate, source: own ? ("etapa" as const) : ("global" as const) };
  });
  const totalCents = byStage.reduce((s, b) => s + Math.round(b.openCents * b.rate), 0);
  return { ok: true, data: { sinHistoria: false, byStage, totalCents } };
}

export type RevenueRow = { label: string; wonCents: number; goalCents: number };

/** Tratos ganados del mes, por opción de un campo de Ventas (o en total), contra la meta de cada una. */
export async function revenueVsGoal(userId: string, orgId: string, config: { field?: string; goals: Record<string, number> }, now = new Date()): Promise<Result<RevenueRow[]>> {
  if (!(await findOwnerMembership(userId, orgId))) return FORBIDDEN;
  const won = await db
    .select({ amountCents: deal.amountCents, custom: deal.custom })
    .from(deal)
    .where(and(eq(deal.orgId, orgId), eq(deal.stage, "ganado"), gte(deal.closedAt, monthStart(now))));
  const sum = (rows: typeof won) => rows.reduce((s, d) => s + d.amountCents, 0);
  const field = config.field ? (await listFields(userId, orgId, "ventas")).find((f) => f.key === config.field && f.type === "opcion") : undefined;
  if (!field) return { ok: true, data: [{ label: "Total", wonCents: sum(won), goalCents: config.goals.total ?? 0 }] };
  return {
    ok: true,
    data: field.options.map((o) => ({ label: o, wonCents: sum(won.filter((d) => d.custom[field.key] === o)), goalCents: config.goals[o] ?? 0 })),
  };
}

export type WhatIfBase = { ticketCents: number; winRate: number; dealsPerMonth: number; monthCents: number; sinHistoria: boolean };

/** Los números reales de hoy con los que arranca "¿Qué pasa si?". */
export async function whatIfBase(userId: string, orgId: string, now = new Date()): Promise<Result<WhatIfBase>> {
  if (!(await findOwnerMembership(userId, orgId))) return FORBIDDEN;
  const since = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);
  const closed = await db.select({ stage: deal.stage, amountCents: deal.amountCents }).from(deal).where(and(eq(deal.orgId, orgId), gte(deal.closedAt, since)));
  const created = await db.select({ id: deal.id }).from(deal).where(and(eq(deal.orgId, orgId), gte(deal.createdAt, since)));
  const wonRows = closed.filter((d) => d.stage === "ganado");
  const month = await revenueVsGoal(userId, orgId, { goals: {} }, now);
  return {
    ok: true,
    data: {
      ticketCents: wonRows.length ? Math.round(wonRows.reduce((s, d) => s + d.amountCents, 0) / wonRows.length) : 0,
      winRate: closed.length ? wonRows.length / closed.length : 0,
      dealsPerMonth: Math.round((created.length / 6) * 10) / 10,
      monthCents: month.ok ? month.data[0]!.wonCents : 0,
      sinHistoria: closed.length === 0,
    },
  };
}
