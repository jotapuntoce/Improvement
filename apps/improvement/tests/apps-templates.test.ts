// Plantillas por giro: cuál toca a cada giro y que aplicarla sea idempotente.
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, profile } from "@jotapuntoce/db/schema";
import { applyTemplate, templateFor } from "../server/apps/templates.ts";
import { listFields } from "../server/apps/fields.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});
async function setup() {
  const [o] = await db.insert(organization).values({ name: "t-tpl", slug: `t-tpl-${crypto.randomUUID()}` }).returning();
  orgIds.push(o!.id);
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com` });
  profileIds.push(id);
  await db.insert(membership).values({ userId: id, orgId: o!.id, role: "owner", acceptedAt: new Date() });
  return { orgId: o!.id, owner: id };
}

describe("plantillas por giro", () => {
  it("WHEN el giro no existe o es null THE SYSTEM SHALL usar la plantilla general", () => {
    expect(templateFor(null).key).toBe("general");
    expect(templateFor("inventado").key).toBe("general");
    expect(templateFor("restaurante").key).toBe("restaurante");
  });

  it("WHEN se lee la plantilla de cada giro THE SYSTEM SHALL traer apps con etapas y campos que addField acepta", () => {
    for (const giro of ["restaurante", "retail", "servicios", "salud", "construccion", "tecnologia", "manufactura", "otro"]) {
      for (const app of templateFor(giro).apps) {
        expect(app.stages.length).toBeGreaterThan(0);
        for (const f of app.fields) {
          expect(f.label.length).toBeGreaterThanOrEqual(2);
          if (f.type === "opcion") expect(f.options?.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("WHEN se aplica la plantilla de restaurante THE SYSTEM SHALL crear sus apps con sus campos", async () => {
    const { orgId, owner } = await setup();
    const r = await applyTemplate(owner, orgId, templateFor("restaurante").apps);
    if (!r.ok) throw new Error(r.error.message);
    const fields = await listFields(owner, orgId, "reservaciones");
    expect(fields.map((f) => f.label)).toEqual(["Fecha", "Personas"]);
  });

  it("WHEN el dueño aplica dos veces la misma plantilla THE SYSTEM SHALL crear las apps una sola vez", async () => {
    const { orgId, owner } = await setup();
    const picks = templateFor("salud").apps;
    const first = await applyTemplate(owner, orgId, picks);
    expect(first.ok && first.data.created).toEqual(["pacientes", "citas", "tareas-del-equipo"]);
    const again = await applyTemplate(owner, orgId, picks);
    expect(again.ok && again.data.created).toEqual([]);
  });

  it("WHEN lo intenta un empleado THE SYSTEM SHALL negarlo", async () => {
    const { orgId } = await setup();
    const emp = crypto.randomUUID();
    await db.insert(profile).values({ id: emp, email: `${emp}@example.com` });
    profileIds.push(emp);
    await db.insert(membership).values({ userId: emp, orgId, role: "employee", acceptedAt: new Date() });
    expect((await applyTemplate(emp, orgId, templateFor("salud").apps)).ok).toBe(false);
  });
});
