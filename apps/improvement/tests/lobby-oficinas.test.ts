// El Lobby no cambia con Oficinas digitales (paso 11): sus secciones (oficina, canal, erp, agenda,
// butacas) nunca se vuelven puertas. Corre en cada `pnpm test`, así que vuelve a comprobarlo cuando
// cada slug entra a SECTION_SLUGS (pasos 13, 21, 26, 37 y 41).
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, profile } from "@jotapuntoce/db/schema";
import { loadLobby } from "../server/lobby/loadLobby.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

describe("loadLobby con Oficinas digitales", () => {
  it("WHEN el dueño de un org sin section_labels entra THE SYSTEM SHALL dar las mismas puertas de antes", async () => {
    const [org] = await db
      .insert(organization)
      .values({ name: "t-lobby-oficinas", slug: `t-lobby-oficinas-${crypto.randomUUID()}` })
      .returning();
    if (!org) throw new Error("insert de organization no devolvió fila");
    orgIds.push(org.id);
    const ownerId = crypto.randomUUID();
    await db.insert(profile).values({ id: ownerId, email: `${ownerId}@example.com` });
    profileIds.push(ownerId);
    await db.insert(membership).values({ userId: ownerId, orgId: org.id, role: "owner", acceptedAt: new Date() });

    const lobby = await loadLobby(ownerId, org.id);
    expect(lobby.sueltas.map((s) => s.slug).sort()).toEqual(["cobros", "direccion", "mapa", "postventa", "proyectos"]);
    expect(lobby.puertas.map((p) => p.slug).sort()).toEqual(["clientes", "equipo", "objetivos", "powerups"]);
  });
});
