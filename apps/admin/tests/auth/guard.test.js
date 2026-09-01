// Integración real contra el proyecto Supabase de desarrollo — mismo patrón que
// apps/improvement/tests/auth/guard.test.ts. Solo prueba las funciones puras (findProfile,
// assertPlatformAdmin): requirePlatformAdmin() depende de cookies() de next/headers, que lanza fuera
// de un request real de Next — mismo límite que requireOrgMembership() en el guard de improvement,
// que tampoco se prueba directo ahí.
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../lib/db.js";
import { profile } from "@jotapuntoce/db/schema";
import { findProfile, assertPlatformAdmin } from "../../lib/auth.js";

const createdProfileIds = [];

async function makeProfile(isPlatformAdmin) {
  const id = crypto.randomUUID();
  const [p] = await db
    .insert(profile)
    .values({ id, email: `${id}@example.com`, isPlatformAdmin })
    .returning();
  if (!p) throw new Error("insert de profile no devolvió fila");
  createdProfileIds.push(id);
  return p;
}

afterEach(async () => {
  for (const id of createdProfileIds.splice(0)) {
    await db.delete(profile).where(eq(profile.id, id));
  }
});

describe("findProfile", () => {
  it("WHEN el userId tiene profile THE SYSTEM SHALL devolver la fila", async () => {
    const p = await makeProfile(true);

    const row = await findProfile(p.id);

    expect(row).not.toBeNull();
    expect(row?.id).toBe(p.id);
  });

  it("WHEN el userId no tiene profile THE SYSTEM SHALL devolver null", async () => {
    const row = await findProfile(crypto.randomUUID());

    expect(row).toBeNull();
  });
});

describe("assertPlatformAdmin", () => {
  it("WHEN el profile tiene is_platform_admin=true THE SYSTEM SHALL devolver la fila", async () => {
    const p = await makeProfile(true);

    const row = await assertPlatformAdmin(p.id);

    expect(row.id).toBe(p.id);
    expect(row.isPlatformAdmin).toBe(true);
  });

  it("WHEN el profile tiene is_platform_admin=false THE SYSTEM SHALL lanzar notFound (404)", async () => {
    const p = await makeProfile(false);

    await expect(assertPlatformAdmin(p.id)).rejects.toThrow();
  });

  it("WHEN el userId no tiene profile THE SYSTEM SHALL lanzar notFound (404)", async () => {
    await expect(assertPlatformAdmin(crypto.randomUUID())).rejects.toThrow();
  });
});
