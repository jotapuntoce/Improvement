// Las cuatro secciones de Dirección dentro del sistema de permisos, la navegación de Dirección y que
// la recepción no las enlace como rutas sueltas. Lo puro primero; loadDireccionNav y loadLobby contra
// el Supabase de desarrollo.
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, profile } from "@jotapuntoce/db/schema";
import { DIRECCION_SLUGS, SECTION_SLUGS, grantsSchema, scopeFor } from "../server/permissions/sections.ts";
import { loadDireccionNav } from "../server/direccion/nav.ts";
import { loadLobby } from "../server/lobby/loadLobby.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];

afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function orgConDueno() {
  const [org] = await db
    .insert(organization)
    .values({ name: "t-direccion-nav", slug: `t-direccion-nav-${crypto.randomUUID()}` })
    .returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  orgIds.push(org.id);
  const ownerId = crypto.randomUUID();
  await db.insert(profile).values({ id: ownerId, email: `${ownerId}@example.com` });
  profileIds.push(ownerId);
  await db.insert(membership).values({ userId: ownerId, orgId: org.id, role: "owner", acceptedAt: new Date() });
  return { orgId: org.id, ownerId };
}

describe("secciones de Dirección", () => {
  it("WHEN scopeFor corre para las cuatro THE SYSTEM SHALL dar empresa al dueño y ninguno al empleado sin tipo", () => {
    for (const slug of DIRECCION_SLUGS) {
      expect(scopeFor("owner", null, slug)).toBe("empresa");
      expect(scopeFor("employee", null, slug)).toBe("ninguno");
    }
  });

  it("WHEN grantsSchema valida alcances que la sección no sabe filtrar THE SYSTEM SHALL rechazarlos", () => {
    expect(grantsSchema.safeParse({ vision: "propio" }).success).toBe(false);
    expect(grantsSchema.safeParse({ junta: "area" }).success).toBe(false);
    expect(
      grantsSchema.safeParse({ vision: "empresa", scorecard: "propio", issues: "propio", junta: "empresa" }).success,
    ).toBe(true);
  });

  it("WHEN se lee SECTION_SLUGS THE SYSTEM SHALL tener las cuatro nuevas al final", () => {
    expect(SECTION_SLUGS).toEqual([
      "mapa", "objetivos", "equipo", "clientes", "powerups", "cobros",
      "vision", "scorecard", "issues", "junta",
    ]);
    expect(DIRECCION_SLUGS).toEqual(["vision", "scorecard", "issues", "junta"]);
  });
});

describe("loadDireccionNav", () => {
  it("WHEN corre para el dueño THE SYSTEM SHALL devolver las cuatro en el orden de DIRECCION_SLUGS", async () => {
    const { orgId, ownerId } = await orgConDueno();
    const nav = await loadDireccionNav(ownerId, orgId);
    expect(nav.map((s) => s.slug)).toEqual([...DIRECCION_SLUGS]);
  });

  it("WHEN corre para alguien sin membresía o con un orgId que no es uuid THE SYSTEM SHALL devolver [] sin lanzar", async () => {
    const { orgId } = await orgConDueno();
    await expect(loadDireccionNav(crypto.randomUUID(), orgId)).resolves.toEqual([]);
    await expect(loadDireccionNav(crypto.randomUUID(), "no-es-uuid")).resolves.toEqual([]);
  });
});

describe("loadLobby con Dirección", () => {
  it("WHEN corre para el dueño THE SYSTEM SHALL no incluir las cuatro en sueltas ni en puertas", async () => {
    const { orgId, ownerId } = await orgConDueno();
    const lobby = await loadLobby(ownerId, orgId);
    const slugs = [...lobby.sueltas, ...lobby.puertas].map((s) => s.slug);
    for (const slug of DIRECCION_SLUGS) expect(slugs).not.toContain(slug);
    expect(lobby.sueltas.map((s) => s.slug)).toContain("mapa");
  });
});
