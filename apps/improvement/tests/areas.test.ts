// Las áreas de la empresa las crea el dueño. Existe porque el formulario de invitación le pide al
// empleado elegir su área de esta lista — sin esta pantalla, la lista siempre está vacía.
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { area, membership, objective, organization, profile } from "@jotapuntoce/db/schema";
import { createArea, removeArea, renameArea } from "../server/areas/mutations.ts";

const createdOrgIds: string[] = [];
const createdProfileIds: string[] = [];

afterEach(async () => {
  for (const orgId of createdOrgIds.splice(0)) {
    await db.delete(organization).where(sql`${organization.id} = ${orgId}`);
  }
  for (const userId of createdProfileIds.splice(0)) {
    await db.delete(profile).where(sql`${profile.id} = ${userId}`);
  }
});

async function orgConDueno(name: string) {
  const [org] = await db
    .insert(organization)
    .values({ name, slug: `${name.toLowerCase().replace(/\W+/g, "-")}-${Date.now()}` })
    .returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  createdOrgIds.push(org.id);

  const ownerId = crypto.randomUUID();
  const employeeId = crypto.randomUUID();
  await db.insert(profile).values([
    { id: ownerId, email: `${ownerId}@example.com` },
    { id: employeeId, email: `${employeeId}@example.com` },
  ]);
  createdProfileIds.push(ownerId, employeeId);
  await db.insert(membership).values([
    { userId: ownerId, orgId: org.id, role: "owner", acceptedAt: new Date() },
    { userId: employeeId, orgId: org.id, role: "employee", acceptedAt: new Date() },
  ]);

  return { org, ownerId, employeeId };
}

describe("createArea", () => {
  it("WHEN el dueño crea un área THE SYSTEM SHALL guardarla en su empresa", async () => {
    const { org, ownerId } = await orgConDueno("Test Org Areas");
    const result = await createArea(ownerId, org.id, "Construcción", "#f59e0b");
    expect(result.ok).toBe(true);

    const rows = await db.select().from(area).where(sql`${area.orgId} = ${org.id}`);
    expect(rows.map((r) => r.name)).toEqual(["Construcción"]);
  });

  it("WHEN quien la crea es un empleado THE SYSTEM SHALL rechazarlo — el organigrama es del dueño", async () => {
    const { org, employeeId } = await orgConDueno("Test Org Areas Empleado");
    const result = await createArea(employeeId, org.id, "Inventada", "#f59e0b");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe("FORBIDDEN");
  });

  it("WHEN el nombre viene vacío THE SYSTEM SHALL rechazarlo", async () => {
    const { org, ownerId } = await orgConDueno("Test Org Areas Vacio");
    expect((await createArea(ownerId, org.id, "   ", "#f59e0b")).ok).toBe(false);
  });

  it(
    "WHEN el dueño crea dos áreas con el mismo nombre en la misma empresa THE SYSTEM SHALL rechazar " +
      "la segunda con un Result tipado, no dejarla duplicarse en silencio",
    async () => {
      const { org, ownerId } = await orgConDueno("Test Org Areas Duplicada");
      const primera = await createArea(ownerId, org.id, "Ventas", "#f59e0b");
      expect(primera.ok).toBe(true);

      const result = await createArea(ownerId, org.id, "Ventas", "#22d3ee");
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error.code).toBe("DUPLICATE_NAME");

      const rows = await db.select().from(area).where(sql`${area.orgId} = ${org.id}`);
      expect(rows.length).toBe(1);
    },
  );

  it(
    "WHEN el mismo nombre existe en OTRA empresa THE SYSTEM SHALL permitirlo — el nombre solo se " +
      "cuida dentro de una misma empresa",
    async () => {
      const a = await orgConDueno("Test Org Areas Mismo Nombre A");
      const b = await orgConDueno("Test Org Areas Mismo Nombre B");
      expect((await createArea(a.ownerId, a.org.id, "Ventas", "#f59e0b")).ok).toBe(true);
      expect((await createArea(b.ownerId, b.org.id, "Ventas", "#f59e0b")).ok).toBe(true);
    },
  );
});

describe("removeArea", () => {
  it(
    "WHEN el área todavía tiene objetivos colgando THE SYSTEM SHALL negarse a borrarla — borrarla " +
      "dejaría esos objetivos sin área y fuera del alcance de quien los trabaja",
    async () => {
      const { org, ownerId } = await orgConDueno("Test Org Areas Ocupada");
      const created = await createArea(ownerId, org.id, "Ventas", "#22d3ee");
      if (!created.ok) throw new Error("createArea falló");

      await db.insert(objective).values({
        orgId: org.id,
        areaId: created.data,
        title: "Cerrar venta",
        impactWeight: 50,
        dueDate: new Date(),
      });

      const result = await removeArea(ownerId, org.id, created.data);
      expect(result.ok).toBe(false);
    },
  );

  it(
    "WHEN el dueño de OTRA empresa manda el id de un área ocupada THE SYSTEM SHALL responder " +
      "NOT_FOUND, no la validación de \"todavía tiene objetivos\" — lo contrario le confirmaría a un " +
      "dueño que un área ajena existe y está ocupada",
    async () => {
      const a = await orgConDueno("Test Org Areas Cross A");
      const b = await orgConDueno("Test Org Areas Cross B");

      const creada = await createArea(b.ownerId, b.org.id, "Obra B", "#22d3ee");
      if (!creada.ok) throw new Error("createArea falló");

      await db.insert(objective).values({
        orgId: b.org.id,
        areaId: creada.data,
        title: "Objetivo de B",
        impactWeight: 50,
        dueDate: new Date(),
      });

      const result = await removeArea(a.ownerId, a.org.id, creada.data);
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error.code).toBe("NOT_FOUND");

      const [row] = await db.select().from(area).where(sql`${area.id} = ${creada.data}`);
      expect(row).toBeDefined();
    },
  );

  it(
    "WHEN el área todavía tiene una persona asignada THE SYSTEM SHALL negarse a borrarla — un " +
      "empleado con alcance `area` sin área deja de ver su propio trabajo",
    async () => {
      const { org, ownerId, employeeId } = await orgConDueno("Test Org Areas Con Gente");
      const created = await createArea(ownerId, org.id, "Soporte", "#10b981");
      if (!created.ok) throw new Error("createArea falló");

      await db
        .update(membership)
        .set({ areaId: created.data })
        .where(sql`${membership.userId} = ${employeeId} AND ${membership.orgId} = ${org.id}`);

      const result = await removeArea(ownerId, org.id, created.data);
      expect(result.ok).toBe(false);

      const [row] = await db.select().from(area).where(sql`${area.id} = ${created.data}`);
      expect(row).toBeDefined();
    },
  );
});

describe("renameArea", () => {
  it("WHEN el dueño renombra un área de OTRA empresa THE SYSTEM SHALL no tocarla", async () => {
    const a = await orgConDueno("Test Org Areas A");
    const b = await orgConDueno("Test Org Areas B");
    const creada = await createArea(b.ownerId, b.org.id, "Obra", "#f59e0b");
    if (!creada.ok) throw new Error("createArea falló");

    const result = await renameArea(a.ownerId, a.org.id, creada.data, "Secuestrada");
    expect(result.ok).toBe(false);

    const [row] = await db.select().from(area).where(sql`${area.id} = ${creada.data}`);
    expect(row?.name).toBe("Obra");
  });

  it(
    "WHEN el dueño renombra un área al nombre de OTRA área de la misma empresa THE SYSTEM SHALL " +
      "rechazarlo con DUPLICATE_NAME, sin tocar la fila",
    async () => {
      const { org, ownerId } = await orgConDueno("Test Org Areas Rename Duplicado");
      const uno = await createArea(ownerId, org.id, "Ventas", "#f59e0b");
      const dos = await createArea(ownerId, org.id, "Soporte", "#22d3ee");
      if (!uno.ok || !dos.ok) throw new Error("createArea falló");

      const result = await renameArea(ownerId, org.id, dos.data, "Ventas");
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error.code).toBe("DUPLICATE_NAME");

      const [row] = await db.select().from(area).where(sql`${area.id} = ${dos.data}`);
      expect(row?.name).toBe("Soporte");
    },
  );

  it(
    "WHEN el dueño renombra un área a SU PROPIO nombre actual THE SYSTEM SHALL permitirlo — no es un " +
      "duplicado, es la misma fila",
    async () => {
      const { org, ownerId } = await orgConDueno("Test Org Areas Rename Mismo Nombre");
      const creada = await createArea(ownerId, org.id, "Ventas", "#f59e0b");
      if (!creada.ok) throw new Error("createArea falló");

      const result = await renameArea(ownerId, org.id, creada.data, "Ventas");
      expect(result.ok).toBe(true);
    },
  );
});
