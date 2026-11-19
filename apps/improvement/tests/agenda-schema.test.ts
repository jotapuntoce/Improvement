// calendar_event, calendar_connection, booking_page y booking: checks, doble reserva y RLS personal contra
// el Supabase de desarrollo (patrón asUser de tests/erp-ordenes-schema.test.ts).
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { booking, bookingPage, calendarConnection, calendarEvent, membership, organization, profile } from "@jotapuntoce/db/schema";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function org() {
  const [o] = await db.insert(organization).values({ name: "t-agenda", slug: `t-agenda-${crypto.randomUUID()}` }).returning();
  if (!o) throw new Error("insert de organization no devolvió fila");
  orgIds.push(o.id);
  const ids = { owner: crypto.randomUUID(), empleado: crypto.randomUUID() };
  await db.insert(profile).values(Object.values(ids).map((id) => ({ id, email: `${id}@example.com` })));
  profileIds.push(...Object.values(ids));
  await db.insert(membership).values([
    { userId: ids.owner, orgId: o.id, role: "owner", acceptedAt: new Date() },
    { userId: ids.empleado, orgId: o.id, role: "employee", acceptedAt: new Date() },
  ]);
  return { orgId: o.id, ...ids };
}

async function asUser<T>(userId: string, query: string): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('role', 'authenticated', true)`);
    await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId })}, true)`);
    const rows = await tx.execute(sql.raw(query));
    await tx.execute(sql`select set_config('role', 'none', true)`);
    return rows as T[];
  });
}

const slug = () => `t-${crypto.randomUUID().slice(0, 8)}`;
const t0 = new Date("2030-01-07T16:00:00Z");
const t1 = new Date("2030-01-07T16:30:00Z");

describe("Agenda — checks", () => {
  it("WHEN dos reservas confirmadas chocan THE SYSTEM SHALL rechazar la segunda; cancelada la primera, acepta la nueva", async () => {
    const { orgId, empleado } = await org();
    const [page] = await db.insert(bookingPage).values({ orgId, userId: empleado, slug: slug(), title: "Citas", weeklyHours: {} }).returning();
    const reserva = () => ({ orgId, bookingPageId: page!.id, startsAt: t0, endsAt: t1, guestName: "Ana", guestEmail: "ana@example.com", cancelToken: crypto.randomUUID() });
    const [first] = await db.insert(booking).values(reserva()).returning();
    await expect(db.insert(booking).values(reserva())).rejects.toThrow();
    await db.update(booking).set({ status: "cancelada" }).where(eq(booking.id, first!.id));
    await expect(db.insert(booking).values(reserva())).resolves.toBeDefined();
  });

  it("WHEN un evento termina cuando empieza o un slug trae mayúsculas y espacio THE SYSTEM SHALL rechazar cada insert", async () => {
    const { orgId, empleado } = await org();
    await expect(db.insert(calendarEvent).values({ orgId, userId: empleado, title: "x", startsAt: t0, endsAt: t0, kind: "tarea" })).rejects.toThrow();
    await expect(db.insert(bookingPage).values({ orgId, userId: empleado, slug: "Mi Agenda", title: "x", weeklyHours: {} })).rejects.toThrow();
  });
});

describe("Agenda — RLS", () => {
  it("WHEN el dueño consulta la agenda de un empleado THE SYSTEM SHALL dar 0 filas; el empleado ve la suya", async () => {
    const { orgId, owner, empleado } = await org();
    await db.insert(calendarEvent).values({ orgId, userId: empleado, title: "Junta", startsAt: t0, endsAt: t1, kind: "evento" });
    const q = `select id from calendar_event where org_id = '${orgId}'`;
    expect(await asUser(owner, q)).toHaveLength(0);
    expect(await asUser(empleado, q)).toHaveLength(1);
  });

  it("WHEN el usuario pide refresh_token_enc de su conexión THE SYSTEM SHALL fallar por permiso; status sí lo devuelve", async () => {
    const { orgId, empleado } = await org();
    await db.insert(calendarConnection).values({ orgId, userId: empleado, refreshTokenEnc: "v1.a.b.c" });
    // drizzle envuelve el error de Postgres ("Failed query: …"); el 42501 viene en `cause`.
    await expect(asUser(empleado, `select refresh_token_enc from calendar_connection where user_id = '${empleado}'`)).rejects.toMatchObject({
      cause: { code: "42501" },
    });
    expect(await asUser<{ status: string }>(empleado, `select status from calendar_connection where user_id = '${empleado}'`)).toEqual([{ status: "activa" }]);
  });
});
