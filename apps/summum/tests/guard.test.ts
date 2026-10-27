import { afterEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { affiliate, membership, organization, profile } from "@jotapuntoce/db/schema";
import { assertBarcoOwner, assertDockOwner, assertNetworkMember, listMyBarcos, listMyDocks, requireBarcoOwnership, requireDockOwnership } from "../server/auth/guard.ts";

// Sin cookie de sesión: getSessionUserId() devuelve null.
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };
const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0).reverse()) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function org(kind: "muelle" | "barco", parentOrgId: string | null = null) {
  const [row] = await db.insert(organization).values({ name: `t-${kind}`, slug: `t-${crypto.randomUUID()}`, kind, parentOrgId }).returning();
  if (!row) throw new Error("sin fila");
  orgIds.push(row.id);
  return row;
}
async function person(orgId?: string, role: "owner" | "employee" = "owner") {
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com` });
  profileIds.push(id);
  if (orgId) await db.insert(membership).values({ userId: id, orgId, role, acceptedAt: new Date() });
  return id;
}

describe("assertDockOwner", () => {
  it("WHEN es dueño del muelle THE SYSTEM SHALL devolverlo", async () => {
    const dock = await org("muelle");
    const u = await person(dock.id);
    await expect(assertDockOwner(u, dock.id)).resolves.toEqual({ userId: u, muelleId: dock.id });
  });
  it("WHEN es dueño de un barco y pide el muelle THE SYSTEM SHALL responder 404", async () => {
    const dock = await org("muelle");
    const boat = await org("barco", dock.id);
    const u = await person(boat.id);
    await expect(assertDockOwner(u, dock.id)).rejects.toMatchObject(NOT_FOUND);
  });
  it("WHEN es dueño pero la empresa no es muelle THE SYSTEM SHALL responder 404", async () => {
    const boat = await org("barco");
    const u = await person(boat.id);
    await expect(assertDockOwner(u, boat.id)).rejects.toMatchObject(NOT_FOUND);
  });
  it("WHEN es empleado del muelle THE SYSTEM SHALL responder 404", async () => {
    const dock = await org("muelle");
    const u = await person(dock.id, "employee");
    await expect(assertDockOwner(u, dock.id)).rejects.toMatchObject(NOT_FOUND);
  });
});

describe("ids mal formados", () => {
  it("WHEN el id no es uuid THE SYSTEM SHALL responder 404, no 500", async () => {
    const u = await person();
    await expect(assertDockOwner(u, "no-es-uuid")).rejects.toMatchObject(NOT_FOUND);
    await expect(assertBarcoOwner(u, "no-es-uuid")).rejects.toMatchObject(NOT_FOUND);
  });
});

describe("assertBarcoOwner", () => {
  it("WHEN es dueño de un barco colgado THE SYSTEM SHALL devolver su muelle", async () => {
    const dock = await org("muelle");
    const boat = await org("barco", dock.id);
    const u = await person(boat.id);
    await expect(assertBarcoOwner(u, boat.id)).resolves.toEqual({ userId: u, barcoId: boat.id, muelleId: dock.id });
  });
  it("WHEN el barco no tiene muelle THE SYSTEM SHALL responder 404", async () => {
    const boat = await org("barco");
    const u = await person(boat.id);
    await expect(assertBarcoOwner(u, boat.id)).rejects.toMatchObject(NOT_FOUND);
  });
});

describe("listMyDocks", () => {
  it("WHEN es dueño de un muelle y de un barco THE SYSTEM SHALL listar solo el muelle", async () => {
    const dock = await org("muelle");
    const boat = await org("barco", dock.id);
    const u = await person(dock.id);
    await db.insert(membership).values({ userId: u, orgId: boat.id, role: "owner", acceptedAt: new Date() });
    expect((await listMyDocks(u)).map((d) => d.id)).toEqual([dock.id]);
  });
});

describe("listMyBarcos", () => {
  it("WHEN es dueño de un muelle y de un barco THE SYSTEM SHALL listar solo el barco", async () => {
    const dock = await org("muelle");
    const boat = await org("barco", dock.id);
    const u = await person(dock.id);
    await db.insert(membership).values({ userId: u, orgId: boat.id, role: "owner", acceptedAt: new Date() });
    expect((await listMyBarcos(u)).map((b) => b.id)).toEqual([boat.id]);
  });
  it("WHEN su barco aún no cuelga de un muelle THE SYSTEM SHALL no listarlo (su panel daría 404)", async () => {
    const orphan = await org("barco");
    const u = await person(orphan.id);
    expect(await listMyBarcos(u)).toEqual([]);
  });
});

describe("sin sesión", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  it("WHEN no hay sesión THE SYSTEM SHALL redirigir al login con returnTo", async () => {
    await expect(requireBarcoOwnership(id, `/barco/${id}`)).rejects.toMatchObject({
      digest: expect.stringContaining(`/login?returnTo=${encodeURIComponent(`/barco/${id}`)}`),
    });
    await expect(requireDockOwnership(id, "/muelle/x/dinero")).rejects.toMatchObject({
      digest: expect.stringContaining("/login?returnTo=%2Fmuelle%2Fx%2Fdinero"),
    });
  });
  it("WHEN no hay sesión y no hay ruta THE SYSTEM SHALL redirigir a /login a secas", async () => {
    await expect(requireDockOwnership(id)).rejects.toMatchObject({ digest: expect.stringMatching(/NEXT_REDIRECT.*\/login;/) });
  });
});

describe("assertNetworkMember", () => {
  it("WHEN es dueño del muelle o afiliada activa THE SYSTEM SHALL dejar pasar; empleado de barco y suspendida reciben 404", async () => {
    const dock = await org("muelle");
    const boat = await org("barco", dock.id);
    const owner = await person(dock.id);
    const empleado = await person(boat.id, "employee");
    const ana = await person();
    const sus = await person();
    await db.insert(affiliate).values([
      { profileId: ana, muelleOrgId: dock.id, displayName: "Ana", publicSlug: `ana-${ana}` },
      { profileId: sus, muelleOrgId: dock.id, displayName: "Sus", publicSlug: `sus-${sus}`, status: "suspendida" },
    ]);
    await expect(assertNetworkMember(owner, dock.id)).resolves.toBeUndefined();
    await expect(assertNetworkMember(ana, dock.id)).resolves.toBeUndefined();
    await expect(assertNetworkMember(empleado, dock.id)).rejects.toMatchObject(NOT_FOUND);
    await expect(assertNetworkMember(sus, dock.id)).rejects.toMatchObject(NOT_FOUND);
  });
});
