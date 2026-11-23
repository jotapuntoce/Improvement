// Mapas de recinto y funciones. Todo exige la sección `butacas` = empresa (el dueño siempre); si no, NOT_FOUND.
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { VENUE_KINDS, venueMap, venueSeat, venueSession } from "@jotapuntoce/db/schema";
import { empresaAccess } from "../permissions/empresaAccess.ts";
import { firstIssue } from "../validation.ts";
import { generateLayout, seatsInvalid, type SeatsFailure } from "./layouts.ts";

export const seatsNotFound: SeatsFailure = { ok: false, error: { code: "NOT_FOUND", message: "No encontrado." } };

export const seatsAccess = (userId: string, orgId: string) => empresaAccess(userId, orgId, "butacas");

const mapSchema = z.object({
  name: z.string().trim().min(1, "Ponle nombre al mapa.").max(80),
  kind: z.enum(VENUE_KINDS),
  params: z.record(z.string(), z.unknown()),
});

export async function createVenueMap(userId: string, orgId: string, input: unknown) {
  if (!(await seatsAccess(userId, orgId))) return seatsNotFound;
  const parsed = mapSchema.safeParse(input);
  if (!parsed.success) return seatsInvalid(firstIssue(parsed.error));
  const { name, kind, params } = parsed.data;
  const layout = generateLayout(kind, params);
  if (!layout.ok) return layout;

  return db.transaction(async (tx) => {
    const [map] = await tx.insert(venueMap).values({ orgId, name, kind, layout: params }).returning();
    await tx.insert(venueSeat).values(layout.data.map((s) => ({ orgId, mapId: map!.id, ...s })));
    return { ok: true as const, data: { ...map!, seats: layout.data.length } };
  });
}

const sessionSchema = z.object({
  mapId: z.uuid("Elige un mapa."),
  title: z.string().trim().min(1, "Ponle título a la función.").max(120),
  startsAt: z.coerce.date(),
  priceCents: z.coerce.number().int().min(0, "El precio no puede ser negativo."),
});

export async function createVenueSession(userId: string, orgId: string, input: unknown) {
  if (!(await seatsAccess(userId, orgId))) return seatsNotFound;
  const parsed = sessionSchema.safeParse(input);
  if (!parsed.success) return seatsInvalid(firstIssue(parsed.error));
  const { mapId, ...rest } = parsed.data;
  const [map] = await db.select({ id: venueMap.id }).from(venueMap).where(and(eq(venueMap.id, mapId), eq(venueMap.orgId, orgId)));
  if (!map) return seatsInvalid("Ese mapa no es de esta empresa.");
  const [row] = await db.insert(venueSession).values({ orgId, mapId, ...rest }).returning();
  return { ok: true as const, data: row! };
}

async function setStatus(userId: string, orgId: string, sessionId: string, from: "borrador" | "a_la_venta", to: "a_la_venta" | "cerrada") {
  if (!(await seatsAccess(userId, orgId)) || !z.uuid().safeParse(sessionId).success) return seatsNotFound;
  const [row] = await db
    .update(venueSession)
    .set({ status: to, updatedAt: new Date() })
    .where(and(eq(venueSession.id, sessionId), eq(venueSession.orgId, orgId), eq(venueSession.status, from)))
    .returning();
  if (row) return { ok: true as const, data: row };
  const [exists] = await db.select({ id: venueSession.id }).from(venueSession).where(and(eq(venueSession.id, sessionId), eq(venueSession.orgId, orgId)));
  return exists ? seatsInvalid(from === "borrador" ? "Solo se publica una función en borrador." : "Solo se cierra una función a la venta.") : seatsNotFound;
}

export const publishSession = (userId: string, orgId: string, sessionId: string) => setStatus(userId, orgId, sessionId, "borrador", "a_la_venta");
export const closeSession = (userId: string, orgId: string, sessionId: string) => setStatus(userId, orgId, sessionId, "a_la_venta", "cerrada");

export async function listSessions(userId: string, orgId: string) {
  if (!(await seatsAccess(userId, orgId))) return seatsNotFound;
  const rows = await db
    .select({
      id: venueSession.id,
      title: venueSession.title,
      startsAt: venueSession.startsAt,
      status: venueSession.status,
      priceCents: venueSession.priceCents,
      mapId: venueSession.mapId,
      mapName: venueMap.name,
    })
    .from(venueSession)
    .innerJoin(venueMap, eq(venueMap.id, venueSession.mapId))
    .where(eq(venueSession.orgId, orgId))
    .orderBy(asc(venueSession.startsAt));
  return { ok: true as const, data: rows };
}
