// Fotos → borrador de oficina (oficinas-digitales paso 9) con proveedor y storage falsos; la base es
// la de desarrollo.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, officePlan, organization, profile } from "@jotapuntoce/db/schema";
import { analyzeSpace } from "../server/office/analyze.ts";
import type { SpaceStorage } from "../server/office/photos.ts";
import type { SuggestionCompletion, SuggestionProvider } from "../server/ai/gateway.ts";

const PROPUESTA = {
  areas: [
    { name: "Cocina", color: "#22aa66", seats: [{ title: "Chef" }] },
    { name: "Caja", color: "#3366ff", seats: [] },
  ],
  theme: null,
  logo: { present: true, description: "Un círculo verde con una hoja." },
  notes: "Local pequeño con barra al frente.",
};

class FakeProvider implements SuggestionProvider {
  calls = 0;
  constructor(private readonly text: string) {}
  async complete(): Promise<SuggestionCompletion> {
    this.calls++;
    return {
      text: this.text,
      usage: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0 },
      finishReason: "end_turn",
    };
  }
}

const storage: SpaceStorage = {
  async upload() {
    return { error: null };
  },
  async download() {
    return { data: { bytes: new Uint8Array([1, 2, 3]), contentType: "image/jpeg" }, error: null };
  },
};

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function orgConGente() {
  const [org] = await db
    .insert(organization)
    .values({ name: "t-analisis", slug: `t-analisis-${crypto.randomUUID()}`, industry: "restaurante" })
    .returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  orgIds.push(org.id);
  const ids = { owner: crypto.randomUUID(), employee: crypto.randomUUID() };
  for (const role of ["owner", "employee"] as const) {
    await db.insert(profile).values({ id: ids[role], email: `${ids[role]}@example.com` });
    profileIds.push(ids[role]);
    await db.insert(membership).values({ userId: ids[role], orgId: org.id, role, acceptedAt: new Date() });
  }
  return { orgId: org.id, ownerId: ids.owner, employeeId: ids.employee };
}

const ruta = (orgId: string) => `${orgId}/${crypto.randomUUID()}.jpg`;
const planes = (orgId: string) => db.select().from(officePlan).where(eq(officePlan.orgId, orgId));

describe("analyzeSpace", () => {
  it("WHEN la propuesta es válida THE SYSTEM SHALL guardar un draft con las rutas y la propuesta", async () => {
    const { orgId, ownerId } = await orgConGente();
    const paths = [ruta(orgId), ruta(orgId)];
    const res = await analyzeSpace(ownerId, orgId, paths, { storage, provider: new FakeProvider(JSON.stringify(PROPUESTA)) });
    if (!res.ok) throw new Error(res.error.message);
    const [plan] = await planes(orgId);
    expect(plan).toMatchObject({ id: res.data.planId, status: "draft", sourcePhotos: paths, proposal: PROPUESTA, createdBy: ownerId });
  });

  it("WHEN se analiza dos veces THE SYSTEM SHALL dejar un solo draft, el de la segunda corrida", async () => {
    const { orgId, ownerId } = await orgConGente();
    const provider = new FakeProvider(JSON.stringify(PROPUESTA));
    await analyzeSpace(ownerId, orgId, [ruta(orgId)], { storage, provider });
    const segunda = await analyzeSpace(ownerId, orgId, [ruta(orgId)], { storage, provider });
    if (!segunda.ok) throw new Error(segunda.error.message);
    const rows = await planes(orgId);
    expect(rows.map((r) => r.id)).toEqual([segunda.data.planId]);
  });

  it("WHEN el proveedor devuelve dos veces JSON inválido THE SYSTEM SHALL dar VALIDATION_ERROR sin escribir", async () => {
    const { orgId, ownerId } = await orgConGente();
    const provider = new FakeProvider(JSON.stringify({ ...PROPUESTA, areas: [] }));
    const res = await analyzeSpace(ownerId, orgId, [ruta(orgId)], { storage, provider });
    expect(res).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(provider.calls).toBe(2);
    expect(await planes(orgId)).toHaveLength(0);
  });

  it("WHEN un empleado analiza THE SYSTEM SHALL devolver NOT_FOUND sin llamar al proveedor", async () => {
    const { orgId, employeeId } = await orgConGente();
    const provider = new FakeProvider(JSON.stringify(PROPUESTA));
    const res = await analyzeSpace(employeeId, orgId, [ruta(orgId)], { storage, provider });
    expect(res).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(provider.calls).toBe(0);
  });
});
