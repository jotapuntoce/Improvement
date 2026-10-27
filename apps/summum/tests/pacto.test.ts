// El Pacto (server/pacto/pacto.ts) contra el Supabase de desarrollo: consentimiento, registros, posada y el
// 404 de assertPactoAccess.
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { affiliate, organization, pactoConsent, pactoEntry, pactoPillar, profile } from "@jotapuntoce/db/schema";
import { giveConsent, logEntry, pausePacto, revokeConsent } from "../server/pacto/pacto.ts";
import { mxDate } from "../server/pacto/streak.ts";

const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function person() {
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com` });
  profileIds.push(id);
  return id;
}

/** Muelle con una afiliada activa y un pilar activo. */
async function network() {
  const [dock] = await db.insert(organization).values({ name: "m", slug: `m-${crypto.randomUUID()}`, kind: "muelle" }).returning();
  orgIds.push(dock!.id);
  const ana = await person();
  await db.insert(affiliate).values({ profileId: ana, muelleOrgId: dock!.id, displayName: "Ana", publicSlug: `ana-${ana}` });
  const [pillar] = await db.insert(pactoPillar).values({ muelleOrgId: dock!.id, name: "Movimiento" }).returning();
  return { muelle: dock!.id, ana, pillarId: pillar!.id };
}

const entriesOf = (profileId: string) => db.select().from(pactoEntry).where(eq(pactoEntry.profileId, profileId));

describe("Pacto", () => {
  it("WHEN registra sin consentimiento THE SYSTEM SHALL pedirlo sin escribir; ya aceptado, dos registros el mismo día dejan una fila", async () => {
    const n = await network();
    expect(await logEntry(n.ana, n.muelle, { pillarId: n.pillarId, note: null })).toEqual({ ok: false, error: "Primero acepta el Pacto." });
    expect(await entriesOf(n.ana)).toEqual([]);

    expect(await giveConsent(n.ana, n.muelle)).toEqual({ ok: true, data: true });
    const now = new Date();
    expect(await logEntry(n.ana, n.muelle, { pillarId: n.pillarId, note: "Caminé" }, now)).toEqual({ ok: true, data: true });
    expect(await logEntry(n.ana, n.muelle, { pillarId: n.pillarId, note: "Caminé más" }, now)).toEqual({ ok: true, data: true });
    const rows = await entriesOf(n.ana);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entryDate: mxDate(now), note: "Caminé más" });
  });

  it("WHEN revoca con borrar THE SYSTEM SHALL dejar 0 registros y revoked_at; una posada de 31 días es inválida", async () => {
    const n = await network();
    await giveConsent(n.ana, n.muelle);
    expect((await pausePacto(n.ana, { startsOn: "2026-11-01", endsOn: "2026-12-01", reason: null })).ok).toBe(false);
    expect((await pausePacto(n.ana, { startsOn: "2026-11-01", endsOn: "2026-11-30", reason: null })).ok).toBe(true);
    await logEntry(n.ana, n.muelle, { pillarId: n.pillarId, note: null });

    expect(await revokeConsent(n.ana, { borrar: true })).toEqual({ ok: true, data: true });
    expect(await entriesOf(n.ana)).toEqual([]);
    const [consent] = await db.select().from(pactoConsent).where(eq(pactoConsent.profileId, n.ana));
    expect(consent?.revokedAt).not.toBeNull();
  });

  it("WHEN un perfil sin relación con el muelle da su consentimiento THE SYSTEM SHALL lanzar 404", async () => {
    const n = await network();
    await expect(giveConsent(await person(), n.muelle)).rejects.toMatchObject(NOT_FOUND);
  });
});
