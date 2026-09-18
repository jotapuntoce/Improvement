// El panel del dueño: cuál empresa manda el rastreador, cómo se ordenan sus pendientes, que el
// conteo de equipo no delate a los platform admins y que cada indicador salga de su propia fuente.
// Las pruebas puras no tocan la base; las últimas sí, contra el proyecto Supabase de desarrollo
// (mismo patrón que tests/dashboard-scene.test.ts).
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { organization, profile, membership, objective, orgKpi, payment } from "@jotapuntoce/db/schema";
import { listMyPayments } from "../server/billing/payments.ts";
import { defaultSelection, type PanelCompany } from "../server/companies/loadOwnerPanel.ts";
import { loadOrgKpis } from "../server/kpis/loadKpis.ts";
import { paretoCut, taskPriority, type OwnerTask } from "../server/tasks/loadOwnerTasks.ts";

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

async function newOrg(name: string) {
  const [org] = await db
    .insert(organization)
    .values({ name, slug: `${name.toLowerCase().replace(/\W+/g, "-")}-${Date.now()}` })
    .returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  createdOrgIds.push(org.id);
  return org;
}

async function addMember(orgId: string, role: "owner" | "employee") {
  const userId = crypto.randomUUID();
  await db.insert(profile).values({ id: userId, email: `${userId}@example.com` });
  createdProfileIds.push(userId);
  await db.insert(membership).values({ userId, orgId, role, acceptedAt: new Date() });
  return userId;
}

function company(overrides: Partial<PanelCompany>): PanelCompany {
  return {
    key: "k",
    orgId: "org",
    name: "Empresa",
    industry: null,
    status: "activa",
    stages: [],
    currentIndex: 0,
    kpis: null,
    ...overrides,
  };
}

describe("defaultSelection", () => {
  it(
    "WHEN el dueño tiene una empresa en espera THE SYSTEM SHALL mostrarla siempre, aunque tenga " +
      "otras activas — se construye una empresa a la vez por cliente",
    () => {
      const espera = company({ key: "solicitud:1", orgId: null, status: "pendiente", currentIndex: 0 });
      const activa = company({ key: "org-a", currentIndex: 3 });
      expect(defaultSelection([espera, activa])?.key).toBe("solicitud:1");
    },
  );

  it("WHEN todas están activas THE SYSTEM SHALL mostrar la menos avanzada", () => {
    const adelante = company({ key: "org-a", currentIndex: 6 });
    const atras = company({ key: "org-b", currentIndex: 2 });
    expect(defaultSelection([adelante, atras])?.key).toBe("org-b");
  });

  it("WHEN no hay ninguna empresa THE SYSTEM SHALL devolver null, no lanzar", () => {
    expect(defaultSelection([])).toBeNull();
  });
});

describe("taskPriority", () => {
  const now = new Date("2026-09-15T12:00:00Z");
  const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000);

  it(
    "WHEN un pendiente ya venció THE SYSTEM SHALL ponerlo por encima de cualquiera que no haya " +
      "vencido, aunque el vencido pese mucho menos — lo vencido ya está costando",
    () => {
      const trivialVencido = taskPriority(1, inDays(-1), now);
      const importantísimoAlDía = taskPriority(100, inDays(1), now);
      expect(trivialVencido).toBeGreaterThan(importantísimoAlDía);
    },
  );

  it("WHEN dos pendientes pesan igual THE SYSTEM SHALL priorizar el que vence antes", () => {
    expect(taskPriority(50, inDays(2), now)).toBeGreaterThan(taskPriority(50, inDays(20), now));
  });

  it(
    "WHEN la fecha está a más de 60 días THE SYSTEM SHALL dejar que mande el peso — lo que vence en " +
      "tres meses no compite con lo de esta semana",
    () => {
      expect(taskPriority(40, inDays(90), now)).toBe(40);
      expect(taskPriority(40, inDays(61), now)).toBe(40);
    },
  );

  it("WHEN el pendiente no tiene fecha THE SYSTEM SHALL usar solo su peso, no tratarlo como vencido", () => {
    expect(taskPriority(45, null, now)).toBe(45);
  });
});

describe("listMyPayments", () => {
  it(
    "WHEN un empleado del mismo org pide los pagos THE SYSTEM SHALL devolver cero filas — lo que el " +
      "dueño le debe a Improvement no es asunto de su equipo (mismo criterio que la política RLS)",
    async () => {
      const org = await newOrg("Test Org Pagos");
      const ownerId = await addMember(org.id, "owner");
      const employeeId = await addMember(org.id, "employee");

      await db.insert(payment).values({
        orgId: org.id,
        concept: "Construcción",
        amount: "25000.00",
        dueDate: new Date(),
      });

      expect(await listMyPayments(ownerId)).toHaveLength(1);
      expect(await listMyPayments(employeeId)).toEqual([]);
    },
  );
});

describe("loadOrgKpis", () => {
  it(
    "WHEN dos indicadores usan el mismo adaptador con distinta config THE SYSTEM SHALL darles " +
      "números distintos — cada fila trae su propia conexión, no la de su fuente",
    async () => {
      const org = await newOrg("Test Org Conexiones");
      const ownerId = await addMember(org.id, "owner");

      await db.insert(objective).values([
        {
          orgId: org.id,
          title: "Abierto",
          impactWeight: 10,
          status: "pending",
          assignedEmployeeId: ownerId,
          dueDate: new Date(Date.now() + 86_400_000),
        },
        {
          orgId: org.id,
          title: "Cerrado",
          impactWeight: 10,
          status: "completed",
          assignedEmployeeId: ownerId,
          completedAt: new Date(),
          dueDate: new Date(Date.now() + 86_400_000),
        },
      ]);

      await db.insert(orgKpi).values([
        { orgId: org.id, label: "Abiertos", source: "objetivos", config: { estado: "abiertos" }, position: 0 },
        { orgId: org.id, label: "Cerrados", source: "objetivos", config: { estado: "completados" }, position: 1 },
      ]);

      const kpis = (await loadOrgKpis([org.id])).get(org.id) ?? [];

      expect(kpis.map((k) => [k.label, k.value])).toEqual([
        ["Abiertos", 1],
        ["Cerrados", 1],
      ]);
    },
  );

  it(
    "WHEN un platform admin tiene membership en el org THE SYSTEM SHALL excluirlo del indicador de " +
      "equipo — cuarto lugar que cuenta personas para el cliente, igual que listTeamForOwner y " +
      "loadDashboardScene",
    async () => {
      const org = await newOrg("Test Org Equipo");
      await addMember(org.id, "owner");

      // Platform admin real, no uno temporal: crear y borrar un profile con is_platform_admin=true
      // compite contra apps/admin leyendo esa misma lista en paralelo (ver tests/auth/guard.test.ts).
      const [admin] = await db.select().from(profile).where(eq(profile.isPlatformAdmin, true)).limit(1);
      if (!admin) throw new Error("este entorno no tiene ningún profile con is_platform_admin=true");
      await db.insert(membership).values({ userId: admin.id, orgId: org.id, role: "owner", acceptedAt: new Date() });

      await db.insert(orgKpi).values({ orgId: org.id, label: "Equipo", source: "equipo", position: 0 });

      const kpis = (await loadOrgKpis([org.id])).get(org.id) ?? [];
      expect(kpis[0]?.value).toBe(1);
    },
  );

  it(
    "WHEN la empresa no tiene ninguna fila de la tabla que alimenta un indicador THE SYSTEM SHALL " +
      "devolverlo en 0, no omitirlo — un hueco en la tarjeta se leería como un error del panel",
    async () => {
      const org = await newOrg("Test Org Vacio");
      await db.insert(orgKpi).values([
        { orgId: org.id, label: "Clientes", source: "clientes", position: 0 },
        { orgId: org.id, label: "Áreas", source: "areas", position: 1 },
      ]);

      const kpis = (await loadOrgKpis([org.id])).get(org.id) ?? [];
      expect(kpis.map((k) => k.value)).toEqual([0, 0]);
    },
  );

  it("WHEN el indicador se captura a mano THE SYSTEM SHALL devolver su valor sin consultar nada", async () => {
    const org = await newOrg("Test Org Manual");
    await db.insert(orgKpi).values({
      orgId: org.id,
      label: "Ventas",
      source: "manual",
      manualValue: 1_240_000,
      format: "dinero",
      position: 0,
    });

    const kpis = (await loadOrgKpis([org.id])).get(org.id) ?? [];
    expect(kpis[0]?.value).toBe(1_240_000);
    expect(kpis[0]?.format).toBe("dinero");
  });
});

describe("paretoCut", () => {
  // Solo la prioridad importa aquí; el resto del OwnerTask es relleno para que compile.
  const tarea = (priority: number): OwnerTask => ({
    id: `t-${priority}-${Math.random()}`,
    kind: "objetivo",
    title: "x",
    context: "y",
    dueDate: null,
    overdue: false,
    priority,
    href: null,
  });

  it("WHEN no hay pendientes THE SYSTEM SHALL devolver cero, no lanzar", () => {
    expect(paretoCut([])).toBe(0);
  });

  it(
    "WHEN unos pocos pendientes concentran el 80% del peso THE SYSTEM SHALL cortar ahí y dejar " +
      "la cola afuera",
    () => {
      // 1000 de 1120 = 89% en el primero: el corte cae en 1.
      const tareas = [tarea(1000), tarea(40), tarea(40), tarea(20), tarea(20)];
      expect(paretoCut(tareas)).toBe(1);
    },
  );

  it("WHEN todos pesan lo mismo THE SYSTEM SHALL no privilegiar a ninguno de más", () => {
    const tareas = Array.from({ length: 10 }, () => tarea(50));
    // 8 de 10 son el 80% exacto.
    expect(paretoCut(tareas)).toBe(8);
  });

  it("WHEN todo pesa cero THE SYSTEM SHALL tratarlos a todos como vitales, no dividir entre cero", () => {
    const tareas = [tarea(0), tarea(0), tarea(0)];
    expect(paretoCut(tareas)).toBe(3);
  });
});
