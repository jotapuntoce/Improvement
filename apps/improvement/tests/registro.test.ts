// Registro abierto: alguien nuevo crea su negocio y queda como dueño, con sus apps base.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { appModel, membership, organization, orgProfile, profile } from "@jotapuntoce/db/schema";
import { createOwnBusiness } from "../server/registro/business.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});
const user = () => {
  const id = crypto.randomUUID();
  profileIds.push(id);
  return { id, email: `${id}@example.com` };
};
const input = { fullName: "Ana Pérez", name: "Clínica Sonrisa", industry: "salud", teamSize: "2-5", city: "Monterrey" };

describe("registro de un negocio propio", () => {
  it("WHEN alguien nuevo registra su negocio THE SYSTEM SHALL crearlo con él como dueño, su perfil y sus apps base", async () => {
    const u = user();
    const r = await createOwnBusiness(u, input);
    if (!r.ok) throw new Error(r.error.message);
    orgIds.push(r.data.orgId);
    const [m] = await db.select().from(membership).where(eq(membership.orgId, r.data.orgId));
    expect(m).toMatchObject({ userId: u.id, role: "owner" });
    expect(m!.acceptedAt).not.toBeNull();
    const [o] = await db.select().from(organization).where(eq(organization.id, r.data.orgId));
    expect(o).toMatchObject({ name: "Clínica Sonrisa", industry: "salud", kind: "barco" });
    const [p] = await db.select().from(orgProfile).where(eq(orgProfile.orgId, r.data.orgId));
    expect(p).toMatchObject({ teamSize: "2-5", city: "Monterrey", templateKey: "salud", onboardedAt: null });
    expect((await db.select().from(appModel).where(eq(appModel.orgId, r.data.orgId))).length).toBe(4);
  });

  it("WHEN el giro o el tamaño no son válidos THE SYSTEM SHALL rechazarlo sin crear nada", async () => {
    const u = user();
    expect((await createOwnBusiness(u, { ...input, industry: "astronautas" })).ok).toBe(false);
    expect((await createOwnBusiness(u, { ...input, teamSize: "mil" })).ok).toBe(false);
    expect(await db.select().from(membership).where(eq(membership.userId, u.id))).toEqual([]);
  });

  it("WHEN la misma persona registra un segundo negocio THE SYSTEM SHALL permitirlo con su mismo perfil", async () => {
    const u = user();
    const a = await createOwnBusiness(u, input);
    const b = await createOwnBusiness(u, { ...input, name: "Clínica Norte" });
    if (!a.ok || !b.ok) throw new Error("falló el alta");
    orgIds.push(a.data.orgId, b.data.orgId);
    expect(a.data.orgId).not.toBe(b.data.orgId);
  });
});
