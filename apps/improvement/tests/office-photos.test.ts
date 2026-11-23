// Fotos del espacio (oficinas-digitales paso 7): validación, guard de dueño y prefijo de ruta, con un
// SpaceStorage falso en memoria. La membresía sí va contra la base de desarrollo.
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, profile } from "@jotapuntoce/db/schema";
import { readSpacePhotos, uploadSpacePhotos, type SpaceStorage } from "../server/office/photos.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];

afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});

async function orgConGente() {
  const [org] = await db
    .insert(organization)
    .values({ name: "t-fotos", slug: `t-fotos-${crypto.randomUUID()}` })
    .returning();
  if (!org) throw new Error("insert de organization no devolvió fila");
  orgIds.push(org.id);
  const ids = { owner: crypto.randomUUID(), employee: crypto.randomUUID() };
  for (const role of ["owner", "employee"] as const) {
    await db.insert(profile).values({ id: ids[role], email: `${ids[role]}@example.com` });
    profileIds.push(ids[role]);
    await db.insert(membership).values({ userId: ids[role], orgId: org.id, role, acceptedAt: new Date() });
  }
  return { orgId: org.id, ownerId: ids.owner, employeeId: ids.employee };
}

function fakeStorage() {
  const files = new Map<string, { bytes: Uint8Array; contentType: string }>();
  const calls = { upload: 0, download: 0 };
  const storage: SpaceStorage = {
    async upload(path, bytes, contentType) {
      calls.upload++;
      files.set(path, { bytes, contentType });
      return { error: null };
    },
    async download(path) {
      calls.download++;
      return { data: files.get(path) ?? null, error: files.has(path) ? null : "no existe" };
    },
  };
  return { storage, calls };
}

const foto = (type = "image/jpeg", size = 10) => new File([new Uint8Array(size).fill(7)], "f", { type });

describe("uploadSpacePhotos", () => {
  it("WHEN son 7 fotos, un gif o una de 6 MB THE SYSTEM SHALL devolver VALIDATION_ERROR sin subir", async () => {
    const { orgId, ownerId } = await orgConGente();
    const { storage, calls } = fakeStorage();
    for (const files of [
      Array.from({ length: 7 }, () => foto()),
      [foto("image/gif")],
      [foto("image/png", 6 * 1024 * 1024)],
    ]) {
      expect(await uploadSpacePhotos(ownerId, orgId, files, storage)).toMatchObject({
        ok: false,
        error: { code: "VALIDATION_ERROR" },
      });
    }
    expect(calls.upload).toBe(0);
  });

  it("WHEN el dueño sube 2 fotos válidas THE SYSTEM SHALL devolver 2 rutas bajo <orgId>/ con su extensión", async () => {
    const { orgId, ownerId } = await orgConGente();
    const { storage } = fakeStorage();
    const res = await uploadSpacePhotos(ownerId, orgId, [foto("image/png"), foto("image/webp")], storage);
    if (!res.ok) throw new Error(res.error.message);
    expect(res.data).toHaveLength(2);
    expect(res.data[0]).toMatch(new RegExp(`^${orgId}/.+\\.png$`));
    expect(res.data[1]).toMatch(new RegExp(`^${orgId}/.+\\.webp$`));

    const leidas = await readSpacePhotos(ownerId, orgId, res.data, storage);
    expect(leidas).toMatchObject({ ok: true, data: [{ mediaType: "image/png" }, { mediaType: "image/webp" }] });
  });

  it("WHEN un empleado sube o lee THE SYSTEM SHALL devolver NOT_FOUND sin tocar el storage", async () => {
    const { orgId, employeeId } = await orgConGente();
    const { storage, calls } = fakeStorage();
    expect(await uploadSpacePhotos(employeeId, orgId, [foto()], storage)).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    expect(await readSpacePhotos(employeeId, orgId, [`${orgId}/${crypto.randomUUID()}.jpg`], storage)).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    expect(calls).toEqual({ upload: 0, download: 0 });
  });
});

describe("readSpacePhotos", () => {
  it("WHEN una ruta es de otro org THE SYSTEM SHALL devolver VALIDATION_ERROR sin descargarla", async () => {
    const { orgId, ownerId } = await orgConGente();
    const { storage, calls } = fakeStorage();
    for (const path of [`${crypto.randomUUID()}/${crypto.randomUUID()}.jpg`, `${orgId}/../otro/x.jpg`]) {
      expect(await readSpacePhotos(ownerId, orgId, [path], storage)).toMatchObject({
        ok: false,
        error: { code: "VALIDATION_ERROR" },
      });
    }
    expect(calls.download).toBe(0);
  });
});
