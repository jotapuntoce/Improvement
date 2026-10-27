// Beneficios de la red y modo del catálogo (server/benefits/benefits.ts) contra el Supabase de desarrollo.
// Los premios se borran ANTES que el muelle: network_org_id es `set null` y un premio huérfano quedaría
// en el catálogo global.
import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { affiliate, membership, muelleSettings, organization, powerupPartner, profile } from "@jotapuntoce/db/schema";
import { publishBenefit, setCatalogMode } from "../server/benefits/benefits.ts";

const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };
const INVALIDO = { ok: false, error: "Revisa los datos del formulario." };

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  if (orgIds.length) await db.delete(powerupPartner).where(inArray(powerupPartner.networkOrgId, orgIds));
  for (const id of orgIds.splice(0).reverse()) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function newProfile() {
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com` });
  profileIds.push(id);
  return id;
}

async function ownedOrg(kind: "muelle" | "barco", owner: string, parentOrgId?: string) {
  const [row] = await db
    .insert(organization)
    .values({ name: `Org ${kind}`, slug: `${kind}-${crypto.randomUUID()}`, kind, parentOrgId })
    .returning();
  orgIds.push(row!.id);
  await db.insert(membership).values({ userId: owner, orgId: row!.id, role: "owner", acceptedAt: new Date() });
  return row!.id;
}

const benefit = { category: "Bienestar", discountDescription: "Masaje de la red", redemptionInstructions: "Agenda por WhatsApp", pointsCost: 300 };
const partnersOf = (muelleId: string) => db.select().from(powerupPartner).where(eq(powerupPartner.networkOrgId, muelleId));

describe("publishBenefit", () => {
  it("WHEN una afiliada activa publica como afiliada THE SYSTEM SHALL crear el premio de la red a su nombre", async () => {
    const muelle = await ownedOrg("muelle", await newProfile());
    const ana = await newProfile();
    const [aff] = await db
      .insert(affiliate)
      .values({ profileId: ana, muelleOrgId: muelle, displayName: "Ana Masajes", publicSlug: `ana-${ana}` })
      .returning();
    expect((await publishBenefit(ana, muelle, { ...benefit, as: "afiliada" })).ok).toBe(true);
    const [row] = await partnersOf(muelle);
    expect(row).toMatchObject({ networkOrgId: muelle, affiliateId: aff!.id, businessName: "Ana Masajes", isActive: true, publishedBy: ana });
  });

  it("WHEN el dueño de un barco del muelle publica como negocio THE SYSTEM SHALL guardar el barco; con un barco de otro muelle, inválido", async () => {
    const muelle = await ownedOrg("muelle", await newProfile());
    const owner = await newProfile();
    const barco = await ownedOrg("barco", owner, muelle);
    const otroMuelle = await ownedOrg("muelle", await newProfile());
    const ajeno = await ownedOrg("barco", owner, otroMuelle);

    expect((await publishBenefit(owner, muelle, { ...benefit, as: "negocio", barcoOrgId: barco })).ok).toBe(true);
    expect((await partnersOf(muelle))[0]).toMatchObject({ barcoOrgId: barco, businessName: "Org barco" });

    expect(await publishBenefit(owner, otroMuelle, { ...benefit, as: "negocio", barcoOrgId: barco })).toEqual(INVALIDO);
    expect(await publishBenefit(owner, muelle, { ...benefit, as: "negocio", barcoOrgId: ajeno })).toEqual(INVALIDO);
    expect(await partnersOf(otroMuelle)).toEqual([]);
    expect(await partnersOf(muelle)).toHaveLength(1);
  });
});

describe("setCatalogMode", () => {
  it("WHEN un dueño del muelle elige red THE SYSTEM SHALL guardarlo; alguien ajeno recibe 404", async () => {
    const owner = await newProfile();
    const muelle = await ownedOrg("muelle", owner);
    expect(await setCatalogMode(owner, muelle, "red")).toEqual({ ok: true, data: true });
    const [row] = await db.select().from(muelleSettings).where(eq(muelleSettings.muelleOrgId, muelle));
    expect(row?.catalogMode).toBe("red");
    await expect(setCatalogMode(await newProfile(), muelle, "global")).rejects.toMatchObject(NOT_FOUND);
  });
});
