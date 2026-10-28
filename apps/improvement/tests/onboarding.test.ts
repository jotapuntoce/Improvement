// Arranque guiado: la propuesta según el giro y su cierre con las apps que el dueño eligió.
import { afterEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { appModel, organization, profile } from "@jotapuntoce/db/schema";
import { createOwnBusiness } from "../server/registro/business.ts";
import { finishOnboarding, loadProposal, needsOnboarding } from "../server/registro/onboarding.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});
async function business(industry: string) {
  const u = { id: crypto.randomUUID(), email: `${crypto.randomUUID()}@example.com` };
  profileIds.push(u.id);
  const r = await createOwnBusiness(u, { fullName: "Ana", name: "Negocio", industry, teamSize: "solo", city: "León" });
  if (!r.ok) throw new Error(r.error.message);
  orgIds.push(r.data.orgId);
  return { owner: u.id, orgId: r.data.orgId };
}

describe("arranque guiado", () => {
  it("WHEN el dueño abre la propuesta THE SYSTEM SHALL darle la plantilla de su giro", async () => {
    const { owner, orgId } = await business("restaurante");
    const p = await loadProposal(owner, orgId);
    expect(p.ok && p.data.apps.map((a) => a.name)).toContain("Reservaciones");
  });

  it("WHEN el dueño acepta una app renombrada THE SYSTEM SHALL crear solo esa y cerrar el arranque", async () => {
    const { owner, orgId } = await business("restaurante");
    expect(await needsOnboarding(owner, orgId)).toBe(true);
    const p = await loadProposal(owner, orgId);
    if (!p.ok) throw new Error(p.error.message);
    expect((await finishOnboarding(owner, orgId, [{ ...p.data.apps[0]!, name: "Mesas apartadas" }])).ok).toBe(true);
    const custom = await db.select({ key: appModel.key }).from(appModel).where(and(eq(appModel.orgId, orgId), eq(appModel.kind, "custom")));
    expect(custom.map((c) => c.key)).toEqual(["mesas-apartadas"]);
    expect(await needsOnboarding(owner, orgId)).toBe(false);
  });
});
