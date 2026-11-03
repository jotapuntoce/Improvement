// apps/improvement/tests/apps-sidebar.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, permissionType, profile } from "@jotapuntoce/db/schema";
import { loadSidebar } from "../server/apps/sidebar.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});
async function org(name: string) {
  const [o] = await db.insert(organization).values({ name, slug: `t-sb-${crypto.randomUUID()}` }).returning();
  orgIds.push(o!.id);
  return o!.id;
}

describe("loadSidebar", () => {
  it("WHEN el dueño tiene dos empresas THE SYSTEM SHALL listar ambas y las 4 apps en 2 grupos", async () => {
    const a = await org("Camibel");
    const b = await org("Segunda");
    const owner = crypto.randomUUID();
    await db.insert(profile).values({ id: owner, email: `${owner}@example.com` });
    profileIds.push(owner);
    await db.insert(membership).values([{ userId: owner, orgId: a, role: "owner", acceptedAt: new Date() }, { userId: owner, orgId: b, role: "owner", acceptedAt: new Date() }]);
    const s = await loadSidebar(owner, a);
    expect(s.orgs.map((o) => o.name).sort()).toEqual(["Camibel", "Segunda"]);
    expect(s.groups.map((g) => g.name)).toEqual(["Ventas", "Operación"]);
    expect(s.groups.flatMap((g) => g.apps.map((x) => x.href))).toContain(`/${a}/a/ventas`);
    expect(s.permissionTypes).toEqual([]);
  });

  it("WHEN el dueño ve como un tipo que solo tiene postventa THE SYSTEM SHALL mostrar solo Postventa", async () => {
    const a = await org("Vista");
    const owner = crypto.randomUUID();
    await db.insert(profile).values({ id: owner, email: `${owner}@example.com` });
    profileIds.push(owner);
    await db.insert(membership).values({ userId: owner, orgId: a, role: "owner", acceptedAt: new Date() });
    const [pt] = await db.insert(permissionType).values({ orgId: a, name: "Soporte", grants: { postventa: "empresa" } }).returning();
    const s = await loadSidebar(owner, a, pt!.grants as Record<string, string>);
    expect(s.groups.flatMap((g) => g.apps.map((x) => x.key))).toEqual(["postventa"]);
  });
});
