// CRM ligero de clientes — CRUD estándar org-scoped. Cada función empieza validando tenencia con
// assertMembership(userId, orgId), igual que server/objectives/mutations.ts.
import { and, desc, eq, lt, or } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { client } from "@jotapuntoce/db/schema";
import { assertMembership } from "../auth/guard.ts";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

type ClientRow = typeof client.$inferSelect;
export type HealthStatus = "healthy" | "neutral" | "at_risk";

function decodeCursor(cursor?: string | null): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const [createdAtIso, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    if (!createdAtIso || !id) return null;
    const createdAt = new Date(createdAtIso);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

function encodeCursor(row: ClientRow): string {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`, "utf8").toString("base64url");
}

/**
 * WHEN un miembro del org A solicita la lista de clientes del org B THE SYSTEM SHALL devolver 404
 * (criterio #1, vía assertMembership). WHEN se filtra por health_status='at_risk' THE SYSTEM SHALL
 * devolver solo esas filas (criterio #3).
 */
export async function listClients(
  userId: string,
  orgId: string,
  opts: { cursor?: string | null; limit?: number; healthStatus?: HealthStatus } = {},
) {
  await assertMembership(userId, orgId);

  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const cursor = decodeCursor(opts.cursor);

  const conditions = [eq(client.orgId, orgId)];
  if (opts.healthStatus) conditions.push(eq(client.healthStatus, opts.healthStatus));
  if (cursor) {
    const beforeCursor = or(
      lt(client.createdAt, cursor.createdAt),
      and(eq(client.createdAt, cursor.createdAt), lt(client.id, cursor.id)),
    );
    if (beforeCursor) conditions.push(beforeCursor);
  }

  const rows = await db
    .select()
    .from(client)
    .where(and(...conditions))
    .orderBy(desc(client.createdAt), desc(client.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last) : null;

  return { ok: true as const, data: { clients: page, nextCursor } };
}

/**
 * WHEN se crea un cliente sin health_status explícito THE SYSTEM SHALL almacenarlo como neutral
 * por default (criterio #2) — se omite el campo del insert cuando no viene, así el default vive
 * solo en el esquema (packages/db/src/schema.ts), nunca duplicado aquí.
 */
export async function createClient(
  userId: string,
  orgId: string,
  input: { name: string; healthStatus?: HealthStatus; notes?: string | null },
) {
  await assertMembership(userId, orgId);

  const [row] = await db
    .insert(client)
    .values({
      orgId,
      name: input.name,
      notes: input.notes ?? null,
      ...(input.healthStatus ? { healthStatus: input.healthStatus } : {}),
    })
    .returning();
  if (!row) throw new Error("insert de client no devolvió fila");

  return { ok: true as const, data: row };
}

export async function updateClient(
  userId: string,
  orgId: string,
  clientId: string,
  patch: { name?: string; healthStatus?: HealthStatus; notes?: string | null },
) {
  await assertMembership(userId, orgId);

  const [row] = await db
    .update(client)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(client.id, clientId), eq(client.orgId, orgId)))
    .returning();
  if (!row) {
    return {
      ok: false as const,
      error: { code: "NOT_FOUND" as const, message: "El cliente no existe en este org." },
    };
  }

  return { ok: true as const, data: row };
}

export async function deleteClient(userId: string, orgId: string, clientId: string) {
  await assertMembership(userId, orgId);

  const [row] = await db
    .delete(client)
    .where(and(eq(client.id, clientId), eq(client.orgId, orgId)))
    .returning();

  return { ok: Boolean(row) };
}
