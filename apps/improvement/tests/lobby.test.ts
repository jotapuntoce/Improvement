// La recepción, cargada con datos de verdad.
//
// Lo que se cuida aquí no es cómo se ve —eso lo cuida tests/lobby-plano.test.ts— sino qué sale del
// servidor hacia la pared: un mueble apagado no puede seguir cantando su número. El mueble se queda
// a la vista (una oficina no se reacomoda porque el dueño apague una sección), pero su cifra no
// viaja: si su pantalla da 404, la pared no puede decirlo de todos modos.
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { client, membership, organization, profile } from "@jotapuntoce/db/schema";
import { setSectionLabels } from "../server/companies/mutations.ts";
import { loadLobby } from "../server/lobby/loadLobby.ts";

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
  await db.insert(profile).values({ id: ownerId, email: `${ownerId}@example.com` });
  createdProfileIds.push(ownerId);
  await db
    .insert(membership)
    .values({ userId: ownerId, orgId: org.id, role: "owner", acceptedAt: new Date() });

  return { org, ownerId };
}

describe("loadLobby", () => {
  it("WHEN el dueño entra THE SYSTEM SHALL mandarle el número de cada mueble abierto", async () => {
    const { org, ownerId } = await orgConDueno("Test Org Recepcion Dueno");
    await db.insert(client).values({ orgId: org.id, name: "Cuenta uno" });

    const lobby = await loadLobby(ownerId, org.id);

    expect(lobby.clientsCount).toBe(1);
    expect(lobby.objectivesOpen).toBe(0);
    expect(typeof lobby.powerupsCount).toBe("number");
    expect(lobby.greeting).toContain("Hoy no traes pendientes.");
  });

  it(
    "WHEN el dueño apaga una sección THE SYSTEM SHALL dejar de mandar su cifra — el mueble se ve, " +
      "pero no delata un número que su propia pantalla ya niega con un 404",
    async () => {
      const { org, ownerId } = await orgConDueno("Test Org Recepcion Apagada");
      await db.insert(client).values({ orgId: org.id, name: "Cuenta que no se enseña" });

      const guardado = await setSectionLabels(ownerId, org.id, { clientes: { hidden: true } });
      expect(guardado.ok).toBe(true);

      const lobby = await loadLobby(ownerId, org.id);

      expect(lobby.clientsCount).toBeUndefined();
      expect(lobby.puertas.some((p) => p.zona === "clientes")).toBe(false);
      // Las demás no se ven afectadas: apagar una sección apaga una, no la recepción.
      expect(lobby.objectivesOpen).toBe(0);
      expect(lobby.puertas.some((p) => p.zona === "objetivos")).toBe(true);
    },
  );

  it("WHEN el dueño renombra una sección THE SYSTEM SHALL usar ese nombre como el del mueble", async () => {
    const { org, ownerId } = await orgConDueno("Test Org Recepcion Renombrada");

    const guardado = await setSectionLabels(ownerId, org.id, { clientes: { label: "Cartera" } });
    expect(guardado.ok).toBe(true);

    const lobby = await loadLobby(ownerId, org.id);

    expect(lobby.puertas.find((p) => p.zona === "clientes")?.label).toBe("Cartera");
  });

  it("WHEN una sección visible no tiene mueble THE SYSTEM SHALL mandarla aparte, nunca perderla", async () => {
    const { org, ownerId } = await orgConDueno("Test Org Recepcion Sueltas");

    const lobby = await loadLobby(ownerId, org.id);

    // El mapa de construcción lo cuenta el edificio desde afuera, así que no ocupa mueble — pero
    // sigue siendo una sección del dueño y tiene que llegarle por algún lado.
    expect(lobby.sueltas.map((s) => s.slug)).toContain("mapa");
    expect(lobby.puertas.map((p) => p.slug)).not.toContain("mapa");
  });
});
