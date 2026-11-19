// Ficha 360 del cliente: tratos, órdenes de venta, tickets y preferencias en una sola carga.
// Mismo alcance que la ficha de hoy (`clientes`); las órdenes solo si la persona también ve el ERP.
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { client, clientPreference, deal, saleOrder, ticket } from "@jotapuntoce/db/schema";
import { findMembership, resolveSection } from "../auth/guard.ts";

const notFound = { ok: false as const, error: { code: "NOT_FOUND" as const, message: "No encontrado." } };

export async function loadClient360(userId: string, orgId: string, clientId: string) {
  if (!z.uuid().safeParse(orgId).success || !z.uuid().safeParse(clientId).success) return notFound;
  if (!(await findMembership(userId, orgId))) return notFound;
  const [clientes, erp] = await Promise.all([resolveSection(userId, orgId, "clientes"), resolveSection(userId, orgId, "erp")]);
  if (clientes.scope === "ninguno") return notFound;

  const [row] = await db.select().from(client).where(and(eq(client.id, clientId), eq(client.orgId, orgId)));
  if (!row) return notFound;

  const [deals, saleOrders, tickets, [preference]] = await Promise.all([
    db.select().from(deal).where(and(eq(deal.clientId, clientId), eq(deal.orgId, orgId))).orderBy(desc(deal.createdAt)),
    erp.scope === "ninguno"
      ? Promise.resolve([])
      : db
          .select()
          .from(saleOrder)
          .where(and(eq(saleOrder.clientId, clientId), eq(saleOrder.orgId, orgId)))
          .orderBy(desc(saleOrder.number)),
    db.select().from(ticket).where(and(eq(ticket.clientId, clientId), eq(ticket.orgId, orgId))).orderBy(desc(ticket.createdAt)),
    db.select().from(clientPreference).where(and(eq(clientPreference.clientId, clientId), eq(clientPreference.orgId, orgId))),
  ]);
  return { ok: true as const, data: { client: row, deals, saleOrders, tickets, preference: preference ?? null } };
}
