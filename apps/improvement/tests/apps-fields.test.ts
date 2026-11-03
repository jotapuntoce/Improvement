// apps/improvement/tests/apps-fields.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, profile } from "@jotapuntoce/db/schema";
import { addField, listFields, schemaFor, type FieldDef } from "../server/apps/fields.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});
async function setup(role: "owner" | "employee") {
  const [o] = await db.insert(organization).values({ name: "t-f", slug: `t-f-${crypto.randomUUID()}` }).returning();
  orgIds.push(o!.id);
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com` });
  profileIds.push(id);
  await db.insert(membership).values({ userId: id, orgId: o!.id, role, acceptedAt: new Date() });
  return { orgId: o!.id, userId: id };
}

const FIELDS: FieldDef[] = [
  { key: "fecha_boda", label: "Fecha de boda", type: "fecha", options: [], required: true },
  { key: "anticipo", label: "Anticipo", type: "dinero", options: [], required: false },
  { key: "paquete", label: "Paquete", type: "opcion", options: ["Oro", "Plata"], required: false },
];

describe("schemaFor", () => {
  it("WHEN falta un obligatorio o la opción no existe THE SYSTEM SHALL rechazar; con datos válidos convierte dinero a centavos enteros", () => {
    const s = schemaFor(FIELDS);
    expect(s.safeParse({ anticipo: "100" }).success).toBe(false);
    expect(s.safeParse({ fecha_boda: "2027-03-01", paquete: "Bronce" }).success).toBe(false);
    expect(s.parse({ fecha_boda: "2027-03-01", anticipo: "1500.50", paquete: "Oro" })).toEqual({ fecha_boda: "2027-03-01", anticipo: 150050, paquete: "Oro" });
  });
});

describe("addField", () => {
  it("WHEN el dueño agrega un campo THE SYSTEM SHALL guardarlo; un empleado recibe FORBIDDEN y una llave repetida VALIDATION_ERROR", async () => {
    const { orgId, userId } = await setup("owner");
    const r = await addField(userId, orgId, "ventas", { label: "Fecha de boda", type: "fecha", required: true });
    expect(r.ok && r.data.key).toBe("fecha_de_boda");
    const dup = await addField(userId, orgId, "ventas", { label: "Fecha de boda", type: "fecha" });
    expect(dup.ok ? null : dup.error.code).toBe("VALIDATION_ERROR");
    const emp = await setup("employee");
    const f = await addField(emp.userId, emp.orgId, "ventas", { label: "X campo", type: "texto" });
    expect(f.ok ? null : f.error.code).toBe("FORBIDDEN");
  });

  it("WHEN un usuario ajeno al org llama listFields THE SYSTEM SHALL negarle los campos; un miembro los recibe", async () => {
    const { orgId, userId } = await setup("owner");
    await addField(userId, orgId, "ventas", { label: "Paquete", type: "texto" });
    expect((await listFields(userId, orgId, "ventas")).map((f) => f.key)).toEqual(["paquete"]);
    const outsider = await setup("owner");
    await expect(listFields(outsider.userId, orgId, "ventas")).rejects.toThrow();
  });
});
