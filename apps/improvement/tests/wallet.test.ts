// Monedero (server/crm/wallet.ts) contra el Supabase de desarrollo: token de 32 caracteres que se
// reemplaza al reemitir, y una lectura pública con llaves exactas y sin montos ni ids.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { client, experienceGrant, loyaltyProgram, membership, organization, profile } from "@jotapuntoce/db/schema";
import { issueWalletToken, loadWallet } from "../server/crm/wallet.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];

afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function setup() {
  const [org] = await db.insert(organization).values({ name: "t-monedero", slug: `t-monedero-${crypto.randomUUID()}` }).returning();
  orgIds.push(org!.id);
  const owner = crypto.randomUUID();
  await db.insert(profile).values({ id: owner, email: `${owner}@example.com` });
  profileIds.push(owner);
  await db.insert(membership).values({ userId: owner, orgId: org!.id, role: "owner", acceptedAt: new Date() });
  const [c] = await db.insert(client).values({ orgId: org!.id, name: "Clienta Monedero" }).returning();
  await db.insert(loyaltyProgram).values({ orgId: org!.id, features: { vip: true } });
  return { orgId: org!.id, owner, clientId: c!.id };
}

describe("issueWalletToken", () => {
  it("WHEN se emite dos veces THE SYSTEM SHALL guardar 32 caracteres base64url y el anterior deja de abrir", async () => {
    const { orgId, owner, clientId } = await setup();
    const first = await issueWalletToken(owner, orgId, clientId);
    if (!first.ok) throw new Error(first.error.message);
    expect(first.data).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const [row] = await db.select({ t: client.walletToken }).from(client).where(eq(client.id, clientId));
    expect(row?.t).toBe(first.data);
    const second = await issueWalletToken(owner, orgId, clientId);
    if (!second.ok) throw new Error(second.error.message);
    expect(second.data).not.toBe(first.data);
    expect(await loadWallet(first.data)).toBeNull();
    expect(await loadWallet(second.data)).not.toBeNull();
  });
});

describe("loadWallet", () => {
  it("WHEN el token es válido THE SYSTEM SHALL devolver exactamente orgName, clientName, tierName, perks y experiences", async () => {
    const { orgId, owner, clientId } = await setup();
    await db.insert(experienceGrant).values({ orgId, clientId, title: "Cena de aniversario", valueCents: 50000, grantedOn: "2026-10-01" });
    const issued = await issueWalletToken(owner, orgId, clientId);
    if (!issued.ok) throw new Error(issued.error.message);
    const wallet = await loadWallet(issued.data);
    expect(Object.keys(wallet!).sort()).toEqual(["clientName", "experiences", "orgName", "perks", "tierName"]);
    expect(wallet!.experiences).toEqual([{ title: "Cena de aniversario", grantedOn: "2026-10-01" }]);
    expect(JSON.stringify(wallet)).not.toMatch(new RegExp(`50000|${clientId}|${orgId}`));
  });

  it("WHEN el token no tiene forma o el programa está apagado THE SYSTEM SHALL devolver null", async () => {
    const { orgId, owner, clientId } = await setup();
    expect(await loadWallet("corto")).toBeNull();
    const issued = await issueWalletToken(owner, orgId, clientId);
    if (!issued.ok) throw new Error(issued.error.message);
    await db.update(loyaltyProgram).set({ features: { vip: false } }).where(eq(loyaltyProgram.orgId, orgId));
    expect(await loadWallet(issued.data)).toBeNull();
  });
});
