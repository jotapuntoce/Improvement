// Qué falta en tu proceso contra el Supabase de desarrollo: faltantes contra la plantilla del giro,
// agregar con un clic y que solo el dueño lo vea.
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, profile } from "@jotapuntoce/db/schema";
import { createCustomApp } from "../server/apps/custom.ts";
import { addField } from "../server/apps/fields.ts";
import { applyGap, processGaps } from "../server/insights/gaps.ts";

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
async function restaurante() {
  const [o] = await db.insert(organization).values({ name: "t-gaps", slug: `t-gaps-${crypto.randomUUID()}`, industry: "restaurante" }).returning();
  orgIds.push(o!.id);
  return { orgId: o!.id, owner: await person(o!.id, "owner") };
}

describe("qué falta en tu proceso", () => {
  it("WHEN un restaurante no tiene Reservaciones THE SYSTEM SHALL listarla como faltante con sus etapas", async () => {
    const { orgId, owner } = await restaurante();
    const r = await processGaps(owner, orgId);
    const app = r.ok ? r.data.find((g) => g.id === "app:reservaciones") : undefined;
    expect(app?.title).toContain("Solicitada → Confirmada");
  });

  it("WHEN tiene Reservaciones sin el campo Personas THE SYSTEM SHALL listar solo ese campo de esa app", async () => {
    const { orgId, owner } = await restaurante();
    await createCustomApp(owner, orgId, { name: "Reservaciones", groupName: "Ventas", stages: ["Solicitada", "Confirmada", "Atendida", "No llegó"] });
    await addField(owner, orgId, "reservaciones", { label: "Fecha", type: "fecha" });
    const r = await processGaps(owner, orgId);
    const mine = r.ok ? r.data.filter((g) => g.id.includes("reservaciones")).map((g) => g.id) : null;
    expect(mine).toEqual(["campo:reservaciones:personas"]);
  });

  it("WHEN el dueño pulsa Agregar THE SYSTEM SHALL crearlo y quitarlo de la lista", async () => {
    const { orgId, owner } = await restaurante();
    expect((await applyGap(owner, orgId, "app:reservaciones")).ok).toBe(true);
    await createCustomApp(owner, orgId, { name: "Inventario", groupName: "Operación", stages: ["Suficiente", "Pedido"] });
    expect((await applyGap(owner, orgId, "etapa:inventario:por-pedir")).ok).toBe(true);
    const r = await processGaps(owner, orgId);
    const ids = r.ok ? r.data.map((g) => g.id) : [];
    expect(ids).not.toContain("app:reservaciones");
    expect(ids.filter((i) => i.startsWith("campo:reservaciones") || i.startsWith("etapa:reservaciones"))).toEqual([]);
    expect(ids).not.toContain("etapa:inventario:por-pedir");
  });

  it("WHEN un empleado pide lo que falta THE SYSTEM SHALL responder FORBIDDEN", async () => {
    const { orgId } = await restaurante();
    const ana = await person(orgId, "employee");
    const r = await processGaps(ana, orgId);
    expect(r.ok ? null : r.error.code).toBe("FORBIDDEN");
  });
});
