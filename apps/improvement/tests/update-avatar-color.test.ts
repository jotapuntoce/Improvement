import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { profile } from "@jotapuntoce/db/schema";
import { setAvatarColorForUser } from "../server/profile/updateAvatarColor.ts";

const createdProfileIds: string[] = [];

afterEach(async () => {
  for (const userId of createdProfileIds.splice(0)) {
    await db.delete(profile).where(eq(profile.id, userId));
  }
});

async function insertTestProfile() {
  const userId = crypto.randomUUID();
  await db.insert(profile).values({ id: userId, email: `${userId}@example.com`, fullName: "Test User" });
  createdProfileIds.push(userId);
  return userId;
}

describe("setAvatarColorForUser", () => {
  it("WHEN el preset es uno de los 4 válidos THE SYSTEM SHALL actualizar avatar_color de ese userId", async () => {
    const userId = await insertTestProfile();

    const result = await setAvatarColorForUser(userId, "esmeralda");
    expect(result).toEqual({ ok: true });

    const [row] = await db.select().from(profile).where(eq(profile.id, userId)).limit(1);
    expect(row!.avatarColor).toBe("esmeralda");
  });

  it("WHEN el preset no es uno de los 4 válidos THE SYSTEM SHALL rechazarlo y no tocar la fila", async () => {
    const userId = await insertTestProfile();

    const result = await setAvatarColorForUser(userId, "morado-invalido");
    expect(result.ok).toBe(false);

    const [row] = await db.select().from(profile).where(eq(profile.id, userId)).limit(1);
    expect(row!.avatarColor).toBeNull();
  });
});
