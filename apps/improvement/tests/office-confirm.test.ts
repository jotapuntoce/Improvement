// Confirmar el plano de oficina (oficinas-digitales paso 11) contra la base de desarrollo.
import { afterEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { area, membership, officePlan, officeZone, organization, profile, seat } from "@jotapuntoce/db/schema";
import { confirmOfficePlan } from "../server/office/confirm.ts";
import { loadOffice } from "../server/office/loadOffice.ts";
import type { OfficeProposal } from "../server/office/proposal.ts";

const PROPUESTA: OfficeProposal = {
  areas: [
    { name: "Cocina", color: "#22aa66", seats: [{ title: "Chef" }, { title: "Ayudante" }] },
    { name: "Caja", color: "#3366ff", seats: [{ title: "Cajero" }] },
  ],
  theme: null,
  logo: { present: false, description: "" },
  notes: "",
};

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function orgConGente() {
  const [org] = await db
    .insert(organization)
    .values({ name: "t-confirmar", slug: `t-confirmar-${crypto.randomUUID()}`, industry: "restaurante" })
    .returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  orgIds.push(org.id);
  const ids = { owner: crypto.randomUUID(), employee: crypto.randomUUID() };
  for (const role of ["owner", "employee"] as const) {
    await db.insert(profile).values({ id: ids[role], email: `${ids[role]}@example.com` });
    profileIds.push(ids[role]);
    await db.insert(membership).values({ userId: ids[role], orgId: org.id, role, acceptedAt: new Date() });
  }
  return { orgId: org.id, ownerId: ids.owner, employeeId: ids.employee };
}

async function borrador(orgId: string, ownerId: string, proposal: OfficeProposal = PROPUESTA) {
  await db.delete(officePlan).where(and(eq(officePlan.orgId, orgId), eq(officePlan.status, "draft")));
  const [row] = await db.insert(officePlan).values({ orgId, status: "draft", proposal, createdBy: ownerId }).returning();
  return row!.id;
}

const confirmados = (orgId: string) =>
  db.select().from(officePlan).where(and(eq(officePlan.orgId, orgId), eq(officePlan.status, "confirmed")));

describe("confirmOfficePlan", () => {
  it("WHEN el dueño confirma Cocina y Caja en un restaurante sin áreas THE SYSTEM SHALL crear áreas, puestos y 5 zonas", async () => {
    const { orgId, ownerId } = await orgConGente();
    const planId = await borrador(orgId, ownerId);
    const res = await confirmOfficePlan(ownerId, orgId, planId, PROPUESTA);
    if (!res.ok) throw new Error(res.error.message);
    expect(res.data.themeSkipped).toBe(false);

    expect((await db.select().from(area).where(eq(area.orgId, orgId))).map((a) => a.name).sort()).toEqual(["Caja", "Cocina"]);
    expect(await db.select().from(seat).where(eq(seat.orgId, orgId))).toHaveLength(3);
    const zonas = await db.select().from(officeZone).where(eq(officeZone.planId, planId));
    expect(zonas).toHaveLength(5);
    expect(zonas.filter((z) => z.kind === "area").every((z) => z.areaId)).toBe(true);
    expect((await confirmados(orgId)).map((p) => p.id)).toEqual([planId]);
  });

  it("WHEN el org ya tiene un área cocina THE SYSTEM SHALL reusarla", async () => {
    const { orgId, ownerId } = await orgConGente();
    const [cocina] = await db.insert(area).values({ orgId, name: "cocina", color: "verde" }).returning();
    const res = await confirmOfficePlan(ownerId, orgId, await borrador(orgId, ownerId), PROPUESTA);
    if (!res.ok) throw new Error(res.error.message);
    const areas = await db.select().from(area).where(eq(area.orgId, orgId));
    expect(areas).toHaveLength(2);
    expect(res.data.zones.find((z) => z.label === "cocina")?.areaId).toBe(cocina!.id);
  });

  it("WHEN el tema falla AA THE SYSTEM SHALL confirmar sin escribirlo y devolver themeSkipped", async () => {
    const { orgId, ownerId } = await orgConGente();
    const malo = { ...PROPUESTA, theme: { bg: "#05060b", textPrimary: "#6b7386", accent1: "#1fbe79", accent2: "#98e33b" } };
    const res = await confirmOfficePlan(ownerId, orgId, await borrador(orgId, ownerId, malo), malo);
    expect(res).toMatchObject({ ok: true, data: { themeSkipped: true } });
    const [org] = await db.select({ theme: organization.theme }).from(organization).where(eq(organization.id, orgId));
    expect(org?.theme).toBeNull();
  });

  it("WHEN se confirma un segundo borrador THE SYSTEM SHALL dejar un solo confirmado con las zonas del segundo", async () => {
    const { orgId, ownerId } = await orgConGente();
    await confirmOfficePlan(ownerId, orgId, await borrador(orgId, ownerId), PROPUESTA);
    const segundo = { ...PROPUESTA, areas: [...PROPUESTA.areas, { name: "Barra", color: "#aa3366", seats: [] }] };
    const planId = await borrador(orgId, ownerId, segundo);
    const res = await confirmOfficePlan(ownerId, orgId, planId, segundo);
    if (!res.ok) throw new Error(res.error.message);
    expect((await confirmados(orgId)).map((p) => p.id)).toEqual([planId]);
    expect(await db.select().from(officeZone).where(eq(officeZone.orgId, orgId))).toHaveLength(6);
  });

  it("WHEN un empleado confirma THE SYSTEM SHALL dar NOT_FOUND sin escribir; sin plano loadOffice da null", async () => {
    const { orgId, ownerId, employeeId } = await orgConGente();
    const planId = await borrador(orgId, ownerId);
    expect(await confirmOfficePlan(employeeId, orgId, planId, PROPUESTA)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await confirmados(orgId)).toHaveLength(0);
    expect(await db.select().from(area).where(eq(area.orgId, orgId))).toHaveLength(0);
    expect(await loadOffice(employeeId, orgId)).toBeNull();
  });
});
