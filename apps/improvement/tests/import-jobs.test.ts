// Importaciones de punta a punta contra el Supabase de desarrollo: borrador, mapeo, vista previa con
// errores por renglón, confirmación y deshacer. La IA se simula siempre; nunca se llama a la API real.
import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { client, deal, importJob, membership, organization, profile, recordOrigin } from "@jotapuntoce/db/schema";
import type { SuggestionCompletion, SuggestionProvider } from "../server/ai/gateway.ts";
import { createCustomApp } from "../server/apps/custom.ts";
import { addField } from "../server/apps/fields.ts";
import { listRecords } from "../server/apps/records.ts";
import { confirmImport, createImportJob, getImportJob, listImports, previewImport, undoImport } from "../server/import/jobs.ts";
import { mapByName } from "../server/import/mapping.ts";

const orgIds: string[] = [];
const profileIds: string[] = [];
afterEach(async () => {
  for (const id of orgIds.splice(0)) await db.delete(organization).where(sql`${organization.id} = ${id}`);
  for (const id of profileIds.splice(0)) await db.delete(profile).where(sql`${profile.id} = ${id}`);
});
async function person(orgId: string, role: "owner" | "employee") {
  const id = crypto.randomUUID();
  await db.insert(profile).values({ id, email: `${id}@example.com` });
  profileIds.push(id);
  await db.insert(membership).values({ userId: id, orgId, role, acceptedAt: new Date() });
  return id;
}
async function setup() {
  const [o] = await db.insert(organization).values({ name: "t-impj", slug: `t-impj-${crypto.randomUUID()}` }).returning();
  orgIds.push(o!.id);
  return { orgId: o!.id, owner: await person(o!.id, "owner"), emp: await person(o!.id, "employee") };
}
const csvFile = (text: string, name = "clientes.csv") => ({ name, type: "text/csv", bytes: new TextEncoder().encode(text) });

/** Proveedor simulado: responde lo que se le pase o falla, para probar el respaldo por nombre. */
class FakeAi implements SuggestionProvider {
  calls = 0;
  constructor(private readonly reply: unknown) {}
  async complete(): Promise<SuggestionCompletion> {
    this.calls++;
    if (this.reply instanceof Error) throw this.reply;
    return { text: JSON.stringify(this.reply), usage: { inputTokens: 10, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 }, finishReason: "end_turn" };
  }
}
const sinIa = new FakeAi(new Error("sin IA"));

async function borrador(orgId: string, owner: string, text: string, appKey = "clientes", provider: SuggestionProvider = sinIa) {
  const r = await createImportJob(owner, orgId, appKey, csvFile(text), { provider });
  if (!r.ok) throw new Error(r.error.message);
  return r.data.jobId;
}

describe("mapeo por nombre", () => {
  it("WHEN los encabezados se parecen a los campos THE SYSTEM SHALL emparejarlos sin acentos ni mayúsculas", () => {
    const fields = [{ key: "telefono", label: "Teléfono", type: "texto" as const, options: [], required: false }];
    expect(mapByName(["Correo", "NOMBRE", "telefono"], fields)).toEqual({ "0": "ignorar", "1": "titulo", "2": "telefono" });
    expect(mapByName(["Folio", "Monto"], [])).toEqual({ "0": "titulo", "1": "ignorar" });
  });
});

describe("importaciones", () => {
  it("WHEN el dueño sube un CSV a Clientes y la IA falla THE SYSTEM SHALL crear un borrador mapeado por nombre", async () => {
    const { orgId, owner } = await setup();
    await addField(owner, orgId, "clientes", { label: "Teléfono", type: "texto" });
    const jobId = await borrador(orgId, owner, "Nombre,Teléfono\nAna,555\nLuis,556");
    const j = await getImportJob(owner, orgId, jobId);
    if (!j.ok) throw new Error(j.error.message);
    expect(j.data.job).toMatchObject({ status: "borrador", source: "csv", mappedBy: "nombre", mapping: { "0": "titulo", "1": "telefono" } });
    expect(j.data.app.key).toBe("clientes");
  });

  it("WHEN la IA propone un mapeo válido THE SYSTEM SHALL usarlo, y si nombra un campo que no existe lo descarta", async () => {
    const { orgId, owner } = await setup();
    await addField(owner, orgId, "clientes", { label: "Teléfono", type: "texto" });
    const buena = new FakeAi({ mapping: { "0": "telefono", "1": "titulo" } });
    const j1 = await getImportJob(owner, orgId, await borrador(orgId, owner, "Cel,Cliente\n555,Ana", "clientes", buena));
    expect(j1.ok && j1.data.job).toMatchObject({ mappedBy: "ia", mapping: { "0": "telefono", "1": "titulo" } });
    const inventada = new FakeAi({ mapping: { "0": "titulo", "1": "rfc" } });
    const j2 = await getImportJob(owner, orgId, await borrador(orgId, owner, "Nombre,RFC\nAna,X", "clientes", inventada));
    expect(j2.ok && j2.data.job.mappedBy).toBe("nombre");
  });

  it("WHEN una fila no cumple su campo o no trae nombre THE SYSTEM SHALL reportar su renglón y no frenar las demás", async () => {
    const { orgId, owner } = await setup();
    await addField(owner, orgId, "clientes", { label: "Visitas", type: "numero" });
    const jobId = await borrador(orgId, owner, "Nombre,Visitas\nAna,3\nLuis,muchas\n,4");
    const p = await previewImport(owner, orgId, jobId, { "0": "titulo", "1": "visitas" });
    if (!p.ok) throw new Error(p.error.message);
    expect(p.data.valid).toBe(1);
    expect(p.data.errors.map((e) => e.row)).toEqual([3, 4]);
    expect(p.data.errors[1]!.message).toBe("Falta el nombre.");
    expect(p.data.sample).toEqual([{ title: "Ana", values: { visitas: 3 } }]);
  });

  it("WHEN el dueño confirma THE SYSTEM SHALL crear los clientes, ligarlos al job y vaciar las filas guardadas", async () => {
    const { orgId, owner } = await setup();
    await addField(owner, orgId, "clientes", { label: "Teléfono", type: "texto" });
    const jobId = await borrador(orgId, owner, "Nombre,Teléfono\nAna,555\nLuis,556");
    expect(await confirmImport(owner, orgId, jobId)).toEqual({ ok: true, data: { imported: 2, skipped: 0 } });
    const list = await listRecords(owner, orgId, "clientes");
    expect(list.ok && list.data.records.map((r) => [r.title, r.custom.telefono]).sort()).toEqual([["Ana", "555"], ["Luis", "556"]]);
    expect(await db.select().from(recordOrigin).where(eq(recordOrigin.importJobId, jobId))).toHaveLength(2);
    const [job] = await db.select().from(importJob).where(eq(importJob.id, jobId));
    expect(job).toMatchObject({ status: "importado", importedCount: 2, rows: [] });
    expect((await confirmImport(owner, orgId, jobId)).ok).toBe(false);
    const hist = await listImports(owner, orgId, "clientes");
    expect(hist.ok && hist.data.map((h) => h.status)).toEqual(["importado"]);
  });

  it("WHEN se importa a una app propia THE SYSTEM SHALL crear sus registros en la primera etapa", async () => {
    const { orgId, owner } = await setup();
    const app = await createCustomApp(owner, orgId, { name: "Pacientes", groupName: "Operación", stages: ["Nuevo", "En consulta"] });
    if (!app.ok) throw new Error(app.error.message);
    const jobId = await borrador(orgId, owner, "Paciente\nFirulais\nMichi", app.data.key);
    expect((await confirmImport(owner, orgId, jobId)).ok).toBe(true);
    const list = await listRecords(owner, orgId, app.data.key);
    expect(list.ok && list.data.records.map((r) => r.stage)).toEqual(["nuevo", "nuevo"]);
  });

  it("WHEN se deshace THE SYSTEM SHALL borrar lo importado, salvo lo editado después y los clientes con ventas", async () => {
    const { orgId, owner } = await setup();
    const jobId = await borrador(orgId, owner, "Nombre\nAna\nLuis\nEva");
    await confirmImport(owner, orgId, jobId);
    const ids = (await db.select({ id: recordOrigin.recordId }).from(recordOrigin).where(eq(recordOrigin.importJobId, jobId))).map((r) => r.id);
    const rows = await db.select().from(client).where(inArray(client.id, ids));
    const byName = (n: string) => rows.find((r) => r.name === n)!.id;
    await db.insert(deal).values({ orgId, clientId: byName("Luis"), title: "Venta", amountCents: 1000 });
    await db.update(client).set({ notes: "editado", updatedAt: new Date(Date.now() + 5000) }).where(eq(client.id, byName("Eva")));
    expect(await undoImport(owner, orgId, jobId)).toEqual({ ok: true, data: { removed: 1, kept: { edited: 1, withActivity: 1 } } });
    expect((await db.select({ name: client.name }).from(client).where(inArray(client.id, ids))).map((r) => r.name).sort()).toEqual(["Eva", "Luis"]);
    const [job] = await db.select().from(importJob).where(eq(importJob.id, jobId));
    expect(job!.status).toBe("deshecho");
  });

  it("WHEN un empleado, otra empresa o una app base distinta de Clientes intentan importar THE SYSTEM SHALL negarlo", async () => {
    const { orgId, owner, emp } = await setup();
    expect(await createImportJob(emp, orgId, "clientes", csvFile("Nombre\nAna"), { provider: sinIa })).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await createImportJob(owner, orgId, "ventas", csvFile("Nombre\nAna"), { provider: sinIa })).toMatchObject({ ok: false, error: { message: "Por ahora se importa a Clientes y a tus apps propias." } });
    const jobId = await borrador(orgId, owner, "Nombre\nAna");
    const otra = await setup();
    expect(await getImportJob(otra.owner, otra.orgId, jobId)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await getImportJob(owner, orgId, "no-es-uuid")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});
