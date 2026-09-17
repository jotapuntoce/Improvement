// Integración real contra el proyecto Supabase de desarrollo — mismo patrón que
// tests/company-requests.test.ts: cada test limpia sus propias filas en afterEach.
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { profile } from "@jotapuntoce/db/schema";
import { getMyProfile, updateMyFullName } from "../server/profile/mutations.ts";

const createdProfileIds: string[] = [];

afterEach(async () => {
  for (const userId of createdProfileIds.splice(0)) {
    await db.delete(profile).where(eq(profile.id, userId));
  }
});

async function makeProfile() {
  const userId = crypto.randomUUID();
  const [p] = await db.insert(profile).values({ id: userId, email: `${userId}@example.com` }).returning();
  if (!p) throw new Error("insert de profile no devolvió fila");
  createdProfileIds.push(userId);
  return userId;
}

describe("updateMyFullName", () => {
  it("WHEN el nombre viene solo con espacios THE SYSTEM SHALL rechazarlo y dejar el valor anterior", async () => {
    const userId = await makeProfile();

    const result = await updateMyFullName(userId, "   ");

    expect(result.ok).toBe(false);
    expect((await getMyProfile(userId))?.fullName).toBeNull();
  });

  it("WHEN el nombre es válido THE SYSTEM SHALL guardarlo sin espacios de sobra", async () => {
    const userId = await makeProfile();

    const result = await updateMyFullName(userId, "  Jaime Salinas  ");

    expect(result.ok).toBe(true);
    expect((await getMyProfile(userId))?.fullName).toBe("Jaime Salinas");
  });

  it("WHEN el profile no existe THE SYSTEM SHALL devolver ok:false, nunca lanzar", async () => {
    const result = await updateMyFullName(crypto.randomUUID(), "Nadie");

    expect(result.ok).toBe(false);
  });
});
