// apps/improvement/tests/apps-records.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { client, deal, membership, organization, profile } from "@jotapuntoce/db/schema";
import { addField } from "../server/apps/fields.ts";
import { addNote, listActivity, listRecords, moveRecord, saveCustomValues } from "../server/apps/records.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});
async function person(orgId: string, role: "owner" | "employee", fullName: string) {
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com`, fullName });
  profileIds.push(id);
  await db.insert(membership).values({ userId: id, orgId, role, acceptedAt: new Date() });
  return id;
}
async function setup() {
  const [o] = await db.insert(organization).values({ name: "t-rec", slug: `t-rec-${crypto.randomUUID()}` }).returning();
  orgIds.push(o!.id);
  const owner = await person(o!.id, "owner", "Dueña Rec");
  const [c] = await db.insert(client).values({ orgId: o!.id, name: "Familia García" }).returning();
  const [d] = await db.insert(deal).values({ orgId: o!.id, clientId: c!.id, title: "Boda García", amountCents: 8000000 }).returning();
  return { orgId: o!.id, owner, dealId: d!.id };
}

describe("registros normalizados de ventas", () => {
  it("WHEN se listan THE SYSTEM SHALL dar título, cliente, etapa y monto, y filtrar por q", async () => {
    const { orgId, owner } = await setup();
    const r = await listRecords(owner, orgId, "ventas");
    if (!r.ok) throw new Error(r.error.message);
    expect(r.data.records[0]).toMatchObject({ title: "Boda García", subtitle: "Familia García", stage: "prospecto", amountCents: 8000000 });
    expect(r.data.stages.map((s) => s.key)[0]).toBe("prospecto");
    const none = await listRecords(owner, orgId, "ventas", { q: "XV años" });
    expect(none.ok && none.data.records).toEqual([]);
  });

  it("WHEN se mueve de etapa THE SYSTEM SHALL actualizar deal.stage y dejar el cambio en la bitácora", async () => {
    const { orgId, owner, dealId } = await setup();
    expect((await moveRecord(owner, orgId, "ventas", dealId, "propuesta")).ok).toBe(true);
    const [row] = await db.select({ stage: deal.stage }).from(deal).where(eq(deal.id, dealId));
    expect(row!.stage).toBe("propuesta");
    await addNote(owner, orgId, "ventas", dealId, "Llamar el lunes");
    const act = await listActivity(owner, orgId, "ventas", dealId);
    expect(act.ok && act.data.map((a) => a.kind).sort()).toEqual(["cambio", "nota"]);
  });

  it("WHEN se guardan valores extra THE SYSTEM SHALL validarlos con app_field y guardarlos en custom", async () => {
    const { orgId, owner, dealId } = await setup();
    await addField(owner, orgId, "ventas", { label: "Anticipo", type: "dinero" });
    const bad = await saveCustomValues(owner, orgId, "ventas", dealId, { anticipo: "-5" });
    expect(bad.ok ? null : bad.error.code).toBe("VALIDATION_ERROR");
    const good = await saveCustomValues(owner, orgId, "ventas", dealId, { anticipo: "2000" });
    expect(good.ok && good.data).toEqual({ anticipo: 200000 });
    const [row] = await db.select({ custom: deal.custom }).from(deal).where(eq(deal.id, dealId));
    expect(row!.custom).toEqual({ anticipo: 200000 });
  });

  it("WHEN un empleado sin la sección clientes lista ventas THE SYSTEM SHALL dar FORBIDDEN", async () => {
    const { orgId } = await setup();
    const emp = await person(orgId, "employee", "Empleado Rec");
    const r = await listRecords(emp, orgId, "ventas");
    expect(r.ok ? null : r.error.code).toBe("FORBIDDEN");
  });
});
