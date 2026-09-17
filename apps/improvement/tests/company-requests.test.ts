// Integración real contra el proyecto Supabase de desarrollo — mismo patrón que
// tests/auth/guard.test.ts: cada test limpia sus propias filas en afterEach.
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { profile, companyRequest } from "@jotapuntoce/db/schema";
import { createCompanyRequest, listMyCompanyRequests } from "../server/companyRequests/mutations.ts";

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

describe("createCompanyRequest", () => {
  it("WHEN el nombre viene vacío THE SYSTEM SHALL rechazarla sin insertar fila", async () => {
    const userId = await makeProfile();
    const result = await createCompanyRequest(userId, { companyName: "   " });
    expect(result.ok).toBe(false);
  });

  it("WHEN industry no es uno de los 8 giros válidos THE SYSTEM SHALL guardarla como null, nunca lanzar", async () => {
    const userId = await makeProfile();
    const result = await createCompanyRequest(userId, { companyName: "Camibel", industry: "no-existe" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.industry).toBeNull();
  });

  it("WHEN se crea con datos válidos THE SYSTEM SHALL quedar en status pending", async () => {
    const userId = await makeProfile();
    const result = await createCompanyRequest(userId, { companyName: "Afianza", industry: "servicios" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.status).toBe("pending");
      expect(result.data.industry).toBe("servicios");
    }
  });
});

describe("listMyCompanyRequests", () => {
  it("WHEN una solicitud ya está approved THE SYSTEM SHALL excluirla del resultado", async () => {
    const userId = await makeProfile();
    const created = await createCompanyRequest(userId, { companyName: "Ya aprobada" });
    if (!created.ok) throw new Error("setup falló");
    await db.update(companyRequest).set({ status: "approved" }).where(eq(companyRequest.id, created.data.id));

    const rows = await listMyCompanyRequests(userId);
    expect(rows.find((r) => r.id === created.data.id)).toBeUndefined();
  });

  it("WHEN hay solicitudes pending o rejected THE SYSTEM SHALL incluirlas, más recientes primero", async () => {
    const userId = await makeProfile();
    const first = await createCompanyRequest(userId, { companyName: "Primera" });
    const second = await createCompanyRequest(userId, { companyName: "Segunda" });
    if (!first.ok || !second.ok) throw new Error("setup falló");

    const rows = await listMyCompanyRequests(userId);
    expect(rows.map((r) => r.id)).toEqual([second.data.id, first.data.id]);
  });
});
