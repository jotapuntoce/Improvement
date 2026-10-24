// La recepción enlaza Dirección con UNA sola puerta (el hub), y solo a quien ve alguna de sus secciones.
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, permissionType, profile } from "@jotapuntoce/db/schema";
import { loadLobby } from "../server/lobby/loadLobby.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];

afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function org() {
  const [row] = await db
    .insert(organization)
    .values({ name: "t-direccion-lobby", slug: `t-direccion-lobby-${crypto.randomUUID()}` })
    .returning();
  if (!row) throw new Error("insert de organization no devolvió fila");
  orgIds.push(row.id);
  return row.id;
}

async function person(orgId: string, role: "owner" | "employee", grants?: Record<string, string>) {
  let permissionTypeId: string | null = null;
  if (grants) {
    const [pt] = await db.insert(permissionType).values({ orgId, name: "t", grants }).returning();
    permissionTypeId = pt?.id ?? null;
  }
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com` });
  profileIds.push(id);
  await db.insert(membership).values({ userId: id, orgId, role, permissionTypeId, acceptedAt: new Date() });
  return id;
}

describe("loadLobby — puerta de Dirección", () => {
  it("WHEN corre para el dueño THE SYSTEM SHALL incluir exactamente una suelta direccion", async () => {
    const o = await org();
    const owner = await person(o, "owner");
    const lobby = await loadLobby(owner, o);
    const direccion = lobby.sueltas.filter((s) => s.slug === "direccion");
    expect(direccion).toEqual([{ slug: "direccion", label: "Dirección" }]);
  });

  it('WHEN corre para un empleado con solo {"objetivos":"propio"} THE SYSTEM SHALL no incluirla', async () => {
    const o = await org();
    await person(o, "owner");
    const emp = await person(o, "employee", { objetivos: "propio" });
    const lobby = await loadLobby(emp, o);
    expect(lobby.sueltas.map((s) => s.slug)).not.toContain("direccion");
  });
});
