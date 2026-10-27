// La V/TO en el servidor contra el Supabase de desarrollo: solo el dueño escribe, ver depende del tipo
// de permiso, y lo inválido no toca la base.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, orgVision, organization, permissionType, profile } from "@jotapuntoce/db/schema";
import { getVision, updateVisionSection } from "../server/direccion/vision/vision.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];

afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function org() {
  const [row] = await db
    .insert(organization)
    .values({ name: "t-vision", slug: `t-vision-${crypto.randomUUID()}` })
    .returning();
  if (!row) throw new Error("insert de organization no devolvió fila");
  orgIds.push(row.id);
  return row.id;
}

async function person(orgId: string, role: "owner" | "employee", grants?: Record<string, string>) {
  let permissionTypeId: string | null = null;
  if (grants) {
    const [pt] = await db.insert(permissionType).values({ orgId, name: "t", grants }).returning();
    permissionTypeId = pt?.id ?? null;
  }
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com` });
  profileIds.push(id);
  await db.insert(membership).values({ userId: id, orgId, role, permissionTypeId, acceptedAt: new Date() });
  return id;
}

const rows = (orgId: string) => db.select().from(orgVision).where(eq(orgVision.orgId, orgId));

describe("updateVisionSection", () => {
  it("WHEN el dueño guarda core_values y luego core_focus THE SYSTEM SHALL crear una sola fila y actualizarla", async () => {
    const o = await org();
    const owner = await person(o, "owner");

    const first = await updateVisionSection(owner, o, "core_values", ["Servir", "Cumplir"]);
    expect(first.ok).toBe(true);
    let saved = await rows(o);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ coreValues: ["Servir", "Cumplir"], updatedBy: owner });

    const second = await updateVisionSection(owner, o, "core_focus", { purpose: "Ayudar", niche: "Servicios" });
    expect(second.ok && second.data.coreFocus).toEqual({ purpose: "Ayudar", niche: "Servicios" });
    saved = await rows(o);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.coreValues).toEqual(["Servir", "Cumplir"]);
  });

  it('WHEN un empleado con {"vision":"empresa"} escribe THE SYSTEM SHALL devolver FORBIDDEN sin escribir', async () => {
    const o = await org();
    const emp = await person(o, "employee", { vision: "empresa" });
    const res = await updateVisionSection(emp, o, "core_values", ["Servir"]);
    expect(res).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await rows(o)).toHaveLength(0);
  });

  it("WHEN llegan 8 valores o una sección desconocida THE SYSTEM SHALL devolver VALIDATION_ERROR sin escribir", async () => {
    const o = await org();
    const owner = await person(o, "owner");
    const eight = Array.from({ length: 8 }, (_, i) => `Valor ${i}`);
    expect(await updateVisionSection(owner, o, "core_values", eight)).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: expect.stringContaining("máximo 7 valores") },
    });
    expect(await updateVisionSection(owner, o, "mision", ["x"])).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
    expect(await rows(o)).toHaveLength(0);
  });
});

describe("getVision", () => {
  it('WHEN un empleado con {"vision":"empresa"} lee THE SYSTEM SHALL devolver la visión, y sin la sección SHALL devolver null', async () => {
    const o = await org();
    const owner = await person(o, "owner");
    await updateVisionSection(owner, o, "core_values", ["Servir"]);
    const reader = await person(o, "employee", { vision: "empresa" });
    const outsider = await person(o, "employee");

    const view = await getVision(reader, o);
    expect(view).toMatchObject({ coreValues: ["Servir"], canEdit: false });
    expect(await getVision(outsider, o)).toBeNull();
    expect((await getVision(owner, o))?.canEdit).toBe(true);
  });

  it("WHEN alguien sin membresía lee THE SYSTEM SHALL lanzar el 404", async () => {
    const o = await org();
    await expect(getVision(crypto.randomUUID(), o)).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
  });
});
