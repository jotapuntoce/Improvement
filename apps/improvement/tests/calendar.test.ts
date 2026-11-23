// Calendario de trabajo interno contra el Supabase de desarrollo: tareas con fecha y campos fecha de
// apps propias, solo de lo que la persona ve.
import { afterEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { appModel, appRecord, membership, organization, permissionType, profile } from "@jotapuntoce/db/schema";
import { createCustomApp } from "../server/apps/custom.ts";
import { addField } from "../server/apps/fields.ts";
import { createTask } from "../server/tasks/inbox.ts";
import { agenda } from "../server/calendar/agenda.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});
async function person(orgId: string, role: "owner" | "employee", grants?: Record<string, string>) {
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com` });
  profileIds.push(id);
  const [t] = grants ? await db.insert(permissionType).values({ orgId, name: `t-${id}`, grants }).returning() : [];
  await db.insert(membership).values({ userId: id, orgId, role, acceptedAt: new Date(), permissionTypeId: t?.id });
  return id;
}
const DAY = 86_400_000;
const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(d);

async function setup() {
  const [o] = await db.insert(organization).values({ name: "t-cal", slug: `t-cal-${crypto.randomUUID()}` }).returning();
  orgIds.push(o!.id);
  const orgId = o!.id;
  const owner = await person(orgId, "owner");
  await createCustomApp(owner, orgId, { name: "Citas", groupName: "Operación", stages: ["Agendada", "Atendida"] });
  await addField(owner, orgId, "citas", { label: "Fecha", type: "fecha" });
  const [app] = await db.select({ id: appModel.id }).from(appModel).where(and(eq(appModel.orgId, orgId), eq(appModel.key, "citas")));
  const enCinco = ymd(new Date(Date.now() + 5 * DAY));
  await db.insert(appRecord).values({ orgId, appId: app!.id, title: "Rosa", stage: "agendada", data: { fecha: enCinco }, createdBy: owner });
  return { orgId, owner, enCinco };
}

describe("calendario", () => {
  it("WHEN hay una tarea en 3 días y un registro en 5 THE SYSTEM SHALL listarlos en su día", async () => {
    const { orgId, owner, enCinco } = await setup();
    const en3 = new Date(Date.now() + 3 * DAY);
    await createTask(owner, orgId, { title: "Pagar renta", dueAt: en3.toISOString() });
    const days = await agenda(owner, orgId);
    expect(days.find((d) => d.day === ymd(en3))?.items.map((i) => i.title)).toEqual(["Pagar renta"]);
    expect(days.find((d) => d.day === enCinco)?.items.map((i) => i.title)).toEqual(["Rosa · Fecha"]);
  });

  it("WHEN el campo fecha es de una app que la persona no ve THE SYSTEM SHALL no listarlo", async () => {
    const { orgId } = await setup();
    const ana = await person(orgId, "employee", { aplicaciones: "ninguno" });
    const days = await agenda(ana, orgId);
    expect(days.flatMap((d) => d.items).filter((i) => i.kind === "registro")).toEqual([]);
  });
});
