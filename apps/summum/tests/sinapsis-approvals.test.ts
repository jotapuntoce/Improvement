// Firma de dos socios sobre las propuestas de especialista (server/sinapsis/approvals.ts) contra el Supabase
// de desarrollo. Patrón dockWithOwners de tests/seal-approvals.test.ts.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { affiliate, membership, organization, orgNeed, profile, specialistProposal } from "@jotapuntoce/db/schema";
import { approveProposal, listProposals, rejectProposal } from "../server/sinapsis/approvals.ts";

const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };
const OTRA_FIRMA = { ok: false, error: "Necesita la firma del otro dueño." };
const YA_DECIDIDO = { ok: false, error: "Este cambio ya se decidió." };

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0).reverse()) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function newProfile() {
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com` });
  profileIds.push(id);
  return id;
}

async function dockWithOwners(n: number) {
  const [dock] = await db.insert(organization).values({ name: "m", slug: `m-${crypto.randomUUID()}`, kind: "muelle" }).returning();
  if (!dock) throw new Error("sin fila");
  orgIds.push(dock.id);
  const owners: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = await newProfile();
    await db.insert(membership).values({ userId: id, orgId: dock.id, role: "owner", acceptedAt: new Date() });
    owners.push(id);
  }
  return { dock, owners };
}

/** Una propuesta `propuesta` para una necesidad abierta de un barco del muelle. */
async function proposal(muelleId: string) {
  const [barco] = await db
    .insert(organization)
    .values({ name: "b", slug: `b-${crypto.randomUUID()}`, kind: "barco", parentOrgId: muelleId })
    .returning();
  orgIds.push(barco!.id);
  const [need] = await db.insert(orgNeed).values({ orgId: barco!.id, title: "Sin cierres", severity: 3 }).returning();
  const [aff] = await db
    .insert(affiliate)
    .values({ profileId: await newProfile(), muelleOrgId: muelleId, displayName: "Ana", publicSlug: `ana-${crypto.randomUUID()}` })
    .returning();
  const [row] = await db
    .insert(specialistProposal)
    .values({ muelleOrgId: muelleId, orgId: barco!.id, orgNeedId: need!.id, affiliateId: aff!.id, sealScore: 80, matchScore: 50 })
    .returning();
  return { id: row!.id, needId: need!.id };
}

const proposalOf = async (id: string) => (await db.select().from(specialistProposal).where(eq(specialistProposal.id, id)))[0];

describe("approveProposal", () => {
  it("WHEN firman el mismo socio dos veces y luego el otro THE SYSTEM SHALL pedir la otra firma y luego dejarla aprobada_socios", async () => {
    const { dock, owners } = await dockWithOwners(2);
    const p = await proposal(dock.id);
    expect(await approveProposal(owners[0]!, p.id)).toEqual({ ok: true, data: { status: "propuesta" } });
    expect(await proposalOf(p.id)).toMatchObject({ firstPartnerId: owners[0], status: "propuesta" });
    expect(await approveProposal(owners[0]!, p.id)).toEqual(OTRA_FIRMA);
    expect(await approveProposal(owners[1]!, p.id)).toEqual({ ok: true, data: { status: "aprobada_socios" } });
    const after = await proposalOf(p.id);
    expect(after?.status).toBe("aprobada_socios");
    expect(after?.partnersApprovedAt).not.toBeNull();
    const [need] = await db.select().from(orgNeed).where(eq(orgNeed.id, p.needId));
    expect(need?.status).toBe("abierta");
  });

  it("WHEN un socio rechaza THE SYSTEM SHALL dejarla rechazada y aprobar después da ya decidido", async () => {
    const { dock, owners } = await dockWithOwners(2);
    const p = await proposal(dock.id);
    expect(await rejectProposal(owners[0]!, p.id)).toEqual({ ok: true, data: true });
    expect((await proposalOf(p.id))?.status).toBe("rechazada");
    expect(await approveProposal(owners[1]!, p.id)).toEqual(YA_DECIDIDO);
  });

  it("WHEN un dueño de otro muelle aprueba o lista THE SYSTEM SHALL lanzar 404", async () => {
    const { dock } = await dockWithOwners(1);
    const p = await proposal(dock.id);
    const other = await dockWithOwners(1);
    await expect(approveProposal(other.owners[0]!, p.id)).rejects.toMatchObject(NOT_FOUND);
    await expect(listProposals(other.owners[0]!, dock.id)).rejects.toMatchObject(NOT_FOUND);
  });
});
