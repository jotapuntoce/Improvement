// Apps propias del dueño: crearlas, verlas en la barra y trabajar sus registros con el mismo motor.
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, profile } from "@jotapuntoce/db/schema";
import { createCustomApp } from "../server/apps/custom.ts";
import { addField } from "../server/apps/fields.ts";
import { createRecord, getRecord, listRecords, moveRecord, saveCustomValues } from "../server/apps/records.ts";
import { loadSidebar } from "../server/apps/sidebar.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});
async function person(orgId: string, role: "owner" | "employee") {
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com` });
  profileIds.push(id);
  await db.insert(membership).values({ userId: id, orgId, role, acceptedAt: new Date() });
  return id;
}
async function setup() {
  const [o] = await db.insert(organization).values({ name: "t-cus", slug: `t-cus-${crypto.randomUUID()}` }).returning();
  orgIds.push(o!.id);
  return { orgId: o!.id, owner: await person(o!.id, "owner"), emp: await person(o!.id, "employee") };
}

describe("apps propias", () => {
  it("WHEN el dueño crea una app THE SYSTEM SHALL darle llave, etapas y lugar en la barra", async () => {
    const { orgId, owner } = await setup();
    const r = await createCustomApp(owner, orgId, { name: "Mascotas atendidas", groupName: "Operación", stages: ["Nuevo", "En consulta", "Alta"] });
    if (!r.ok) throw new Error(r.error.message);
    expect(r.data.key).toBe("mascotas-atendidas");
    const bar = await loadSidebar(owner, orgId);
    expect(bar.groups.find((g) => g.name === "Operación")?.apps.map((a) => a.key)).toContain("mascotas-atendidas");
    const list = await listRecords(owner, orgId, r.data.key);
    expect(list.ok && list.data.stages.map((s) => s.key)).toEqual(["nuevo", "en-consulta", "alta"]);
  });

  it("WHEN se repite el nombre o lo intenta un empleado THE SYSTEM SHALL negarlo", async () => {
    const { orgId, owner, emp } = await setup();
    expect((await createCustomApp(owner, orgId, { name: "Mascotas", groupName: "Operación", stages: ["A"] })).ok).toBe(true);
    const dup = await createCustomApp(owner, orgId, { name: "mascotas", groupName: "Ventas", stages: ["A"] });
    expect(!dup.ok && dup.error.code).toBe("CONFLICT");
    expect((await createCustomApp(emp, orgId, { name: "Otra", groupName: "Ventas", stages: ["A"] })).ok).toBe(false);
  });

  it("WHEN se crea, mueve y llena un registro propio THE SYSTEM SHALL guardarlo con sus campos", async () => {
    const { orgId, owner } = await setup();
    const app = await createCustomApp(owner, orgId, { name: "Mascotas", groupName: "Operación", stages: ["Nuevo", "Alta"] });
    if (!app.ok) throw new Error(app.error.message);
    await addField(owner, orgId, "mascotas", { label: "Raza", type: "texto" });
    const rec = await createRecord(owner, orgId, "mascotas", "Firulais");
    if (!rec.ok) throw new Error(rec.error.message);
    expect((await moveRecord(owner, orgId, "mascotas", rec.data.id, "alta")).ok).toBe(true);
    expect((await moveRecord(owner, orgId, "mascotas", rec.data.id, "inventada")).ok).toBe(false);
    expect((await saveCustomValues(owner, orgId, "mascotas", rec.data.id, { raza: "Pastor" })).ok).toBe(true);
    const got = await getRecord(owner, orgId, "mascotas", rec.data.id);
    expect(got.ok && got.data).toMatchObject({ title: "Firulais", stage: "alta", custom: { raza: "Pastor" } });
  });

  it("WHEN se crea un registro en una app base THE SYSTEM SHALL mandarlo a su pantalla de siempre", async () => {
    const { orgId, owner } = await setup();
    expect((await createRecord(owner, orgId, "ventas", "Boda")).ok).toBe(false);
  });

  it("WHEN un empleado sin la sección aplicaciones lista una app propia THE SYSTEM SHALL negarlo", async () => {
    const { orgId, owner, emp } = await setup();
    await createCustomApp(owner, orgId, { name: "Mascotas", groupName: "Operación", stages: ["Nuevo"] });
    expect((await listRecords(emp, orgId, "mascotas")).ok).toBe(false);
  });
});
