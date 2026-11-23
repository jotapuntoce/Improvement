// apps/improvement/tests/brand.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, profile } from "@jotapuntoce/db/schema";
import { brandStyle, getBrand, saveBrand } from "../server/brand/brand.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});
async function setup(role: "owner" | "employee") {
  const [o] = await db.insert(organization).values({ name: "t-b", slug: `t-b-${crypto.randomUUID()}` }).returning();
  orgIds.push(o!.id);
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com` });
  profileIds.push(id);
  await db.insert(membership).values({ userId: id, orgId: o!.id, role, acceptedAt: new Date() });
  return { orgId: o!.id, userId: id };
}

describe("brandStyle", () => {
  it("WHEN hay colores THE SYSTEM SHALL mapearlos a --accent-1/--accent-2; sin colores no pisa nada", () => {
    expect(brandStyle({ logoUrl: null, coverUrl: null, primaryColor: "#aa0000", secondaryColor: "#00aa00" })).toEqual({ "--accent-1": "#aa0000", "--accent-2": "#00aa00" });
    expect(brandStyle({ logoUrl: null, coverUrl: null, primaryColor: null, secondaryColor: null })).toEqual({});
  });
});

describe("saveBrand", () => {
  it("WHEN el dueño guarda colores válidos THE SYSTEM SHALL leerlos de vuelta; un hex inválido es VALIDATION_ERROR y un empleado FORBIDDEN", async () => {
    const { orgId, userId } = await setup("owner");
    expect((await saveBrand(userId, orgId, { primaryColor: "#112233", secondaryColor: "#445566", logoUrl: "https://x.test/l.png" })).ok).toBe(true);
    expect((await getBrand(userId, orgId)).primaryColor).toBe("#112233");
    const bad = await saveBrand(userId, orgId, { primaryColor: "rojo" });
    expect(bad.ok ? null : bad.error.code).toBe("VALIDATION_ERROR");
    const emp = await setup("employee");
    const f = await saveBrand(emp.userId, emp.orgId, { primaryColor: "#112233" });
    expect(f.ok ? null : f.error.code).toBe("FORBIDDEN");
  });
});
