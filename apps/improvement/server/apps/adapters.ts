// Un adaptador por app base: traduce su tabla real a AppRecord y delega el cambio de etapa en la
// función que ya cuida esa regla (moveDeal, moveTicket, authorizeProject). Solo lo usa records.ts,
// que pasa el guard de la sección antes de llamarlo.
import { and, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { client, deal, project, ticket } from "@jotapuntoce/db/schema";
import { moveDeal } from "../crm/deals.ts";
import { moveTicket } from "../erp/tickets.ts";
import { authorizeProject } from "../erp/projects.ts";
import type { BaseAppKey } from "./catalog.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
type Custom = Record<string, unknown>;

export interface AppRecord {
  id: string;
  title: string;
  subtitle: string | null;
  stage: string;
  amountCents: number | null;
  custom: Custom;
  updatedAt: Date;
}

export interface Adapter {
  list(orgId: string, q?: string): Promise<AppRecord[]>;
  get(orgId: string, id: string): Promise<AppRecord | undefined>;
  move(userId: string, orgId: string, id: string, stage: string): Promise<Result<true>>;
  /** Guarda los valores extra ya validados; devuelve lo guardado o undefined si no existe. */
  saveCustom(orgId: string, id: string, values: Custom): Promise<Custom | undefined>;
}

const like = (q: string | undefined, ...cols: Parameters<typeof ilike>[0][]): SQL | undefined =>
  q ? or(...cols.map((c) => ilike(c, `%${q}%`))) : undefined;

// ponytail: get reusa list (tope 200 filas); cambia a un `where id` cuando un org pase de ese tamaño.
const getFrom = (list: Adapter["list"]) => async (orgId: string, id: string) => (await list(orgId)).find((r) => r.id === id);

const HEALTH = ["healthy", "neutral", "at_risk"] as const;

async function listClients(orgId: string, q?: string): Promise<AppRecord[]> {
  const rows = await db.select().from(client).where(and(eq(client.orgId, orgId), like(q, client.name))).orderBy(desc(client.updatedAt)).limit(200);
  return rows.map((r) => ({ id: r.id, title: r.name, subtitle: null, stage: r.healthStatus, amountCents: null, custom: r.custom, updatedAt: r.updatedAt }));
}

async function listDeals(orgId: string, q?: string): Promise<AppRecord[]> {
  const rows = await db
    .select({ d: deal, clientName: client.name })
    .from(deal)
    .innerJoin(client, eq(client.id, deal.clientId))
    .where(and(eq(deal.orgId, orgId), like(q, deal.title, client.name)))
    .orderBy(desc(deal.updatedAt))
    .limit(200);
  return rows.map(({ d, clientName }) => ({ id: d.id, title: d.title, subtitle: clientName, stage: d.stage, amountCents: d.amountCents, custom: d.custom, updatedAt: d.updatedAt }));
}

async function listProjects(orgId: string, q?: string): Promise<AppRecord[]> {
  const rows = await db.select().from(project).where(and(eq(project.orgId, orgId), like(q, project.name))).orderBy(desc(project.updatedAt)).limit(200);
  return rows.map((r) => ({ id: r.id, title: r.name, subtitle: r.detail, stage: r.authorizationStatus, amountCents: null, custom: r.custom, updatedAt: r.updatedAt }));
}

async function listTickets(orgId: string, q?: string): Promise<AppRecord[]> {
  const rows = await db
    .select({ t: ticket, clientName: client.name })
    .from(ticket)
    .leftJoin(client, eq(client.id, ticket.clientId))
    .where(and(eq(ticket.orgId, orgId), like(q, ticket.title)))
    .orderBy(desc(ticket.updatedAt))
    .limit(200);
  return rows.map(({ t, clientName }) => ({ id: t.id, title: t.title, subtitle: clientName, stage: t.status, amountCents: null, custom: t.custom, updatedAt: t.updatedAt }));
}

export const ADAPTERS: Record<BaseAppKey, Adapter> = {
  clientes: {
    list: listClients,
    get: getFrom(listClients),
    async move(_userId, orgId, id, stage) {
      const health = HEALTH.find((h) => h === stage);
      if (!health) return { ok: false, error: { code: "VALIDATION_ERROR", message: "Esa etapa no existe." } };
      const [row] = await db.update(client).set({ healthStatus: health, updatedAt: new Date() }).where(and(eq(client.id, id), eq(client.orgId, orgId))).returning({ id: client.id });
      return row ? { ok: true, data: true } : { ok: false, error: { code: "NOT_FOUND", message: "Ese cliente no existe en esta empresa." } };
    },
    async saveCustom(orgId, id, values) {
      const [row] = await db.update(client).set({ custom: values, updatedAt: new Date() }).where(and(eq(client.id, id), eq(client.orgId, orgId))).returning({ custom: client.custom });
      return row?.custom;
    },
  },
  ventas: {
    list: listDeals,
    get: getFrom(listDeals),
    move: (userId, orgId, id, stage) => moveDeal(userId, orgId, id, stage),
    async saveCustom(orgId, id, values) {
      const [row] = await db.update(deal).set({ custom: values, updatedAt: new Date() }).where(and(eq(deal.id, id), eq(deal.orgId, orgId))).returning({ custom: deal.custom });
      return row?.custom;
    },
  },
  proyectos: {
    list: listProjects,
    get: getFrom(listProjects),
    // Las etapas de proyectos son su autorización: authorizeProject ya acepta 'autorizado' | 'rechazado'.
    move: (userId, orgId, id, stage) => authorizeProject(userId, orgId, id, stage),
    async saveCustom(orgId, id, values) {
      const [row] = await db.update(project).set({ custom: values, updatedAt: new Date() }).where(and(eq(project.id, id), eq(project.orgId, orgId))).returning({ custom: project.custom });
      return row?.custom;
    },
  },
  postventa: {
    list: listTickets,
    get: getFrom(listTickets),
    move: (userId, orgId, id, stage) => moveTicket(userId, orgId, id, stage),
    async saveCustom(orgId, id, values) {
      const [row] = await db.update(ticket).set({ custom: values, updatedAt: new Date() }).where(and(eq(ticket.id, id), eq(ticket.orgId, orgId))).returning({ custom: ticket.custom });
      return row?.custom;
    },
  },
};
