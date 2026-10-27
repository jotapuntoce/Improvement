// Integración contra el Supabase de desarrollo con la IA y el PDF simulados: nunca llama a Anthropic.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db, supabaseAdmin } from "../lib/db.js";
import { chequeo, chequeoEvento } from "@jotapuntoce/db/schema";
import { crearChequeoPropio } from "../lib/chequeos.js";
import { aprobarChequeo, armarChequeo, automaticosUltimoDia, gastoDelMes } from "../lib/motor/armar.js";
import { contenidoMuestra } from "../lib/motor/muestra.js";

const ids = [];
const marca = `m${Date.now()}`;
const USO = { input: 1000, output: 500, cacheRead: 0, cacheWrite: 0, busquedas: 1, paginas: 2 };
const responde = (...textos) => {
  const llamadas = [];
  const fn = async (params) => {
    llamadas.push(params);
    return { ok: true, data: { texto: textos.shift(), mensajes: [...params.mensajes, { role: "assistant", content: [] }], modelo: "claude-opus-5-5" }, uso: USO };
  };
  fn.llamadas = llamadas;
  return fn;
};
const pdfFalso = async () => Buffer.from("%PDF-1.4 prueba");
const valido = () => JSON.stringify(contenidoMuestra("creciendo"));

beforeAll(() => {
  process.env.AVISOS_WHATSAPP_A = "";
  process.env.CHEQUEOS_MOTOR_TOPE_DIA = "1000";
});

afterEach(async () => {
  for (const id of ids) {
    const { data } = await supabaseAdmin.storage.from("chequeos").list(id);
    if (data?.length) await supabaseAdmin.storage.from("chequeos").remove(data.map((f) => `${id}/${f.name}`));
  }
  if (ids.length) await db.delete(chequeo).where(inArray(chequeo.id, ids.splice(0)));
});

let n = 0;
async function propio() {
  n += 1;
  const r = await crearChequeoPropio({ tipo: "negocio", negocio: `Motor ${marca} ${n}`, giro: "café", ciudad: "SLP", canal: "directo" });
  ids.push(r.data.id);
  return r.data.id;
}
const fila = async (id) => (await db.select().from(chequeo).where(eq(chequeo.id, id)))[0];
const motor = async (id) =>
  (await db.select().from(chequeoEvento).where(eq(chequeoEvento.chequeoId, id))).filter((e) => e.tipo === "motor").map((e) => e.detalle.accion);

describe("armarChequeo", () => {
  it("sin_empezar → borrador → aprobado, con costo en la bitácora", async () => {
    const id = await propio();
    const r = await armarChequeo(id, { manual: true }, { investigar: responde(valido()), aPdf: pdfFalso });
    expect(r.ok).toBe(true);
    const f = await fila(id);
    expect(f).toMatchObject({ motorEstado: "borrador", etapaProspecto: "creciendo", pdfPath: `${id}/borrador-1.pdf` });
    expect(f.notasInternas.siguientePaso).toBeTruthy();
    expect(f.contenido.notasInternas).toBeUndefined();
    const [ev] = (await db.select().from(chequeoEvento).where(eq(chequeoEvento.chequeoId, id))).filter((e) => e.tipo === "motor");
    expect(ev.detalle).toMatchObject({ accion: "armado", automatico: false, modelo: "claude-opus-5-5" });
    expect(ev.detalle.costoUsd).toBeGreaterThan(0);
    expect(await gastoDelMes()).toBeGreaterThan(0);
    expect((await aprobarChequeo(id)).ok).toBe(true);
    expect((await fila(id)).motorEstado).toBe("aprobado");
    expect((await aprobarChequeo(id)).error.code).toBe("SIN_BORRADOR");
  }, 20_000);

  it("JSON inválido → un reintento con la corrección → borrador", async () => {
    const id = await propio();
    const inv = responde("{}", valido());
    expect((await armarChequeo(id, { manual: true }, { investigar: inv, aPdf: pdfFalso })).ok).toBe(true);
    expect(inv.llamadas).toHaveLength(2);
    expect(inv.llamadas[1].mensajes.at(-1).content).toContain("no pasó la validación");
  }, 20_000);

  it("inválido dos veces → error con motivo, sin PDF", async () => {
    const id = await propio();
    const r = await armarChequeo(id, { manual: true }, { investigar: responde("{}", "nada"), aPdf: pdfFalso });
    expect(r.error.code).toBe("MOTOR");
    const f = await fila(id);
    expect(f.motorEstado).toBe("error");
    expect(f.motorError).toMatch(/piezas del Chequeo/);
    expect(f.pdfPath).toBeNull();
    expect(await motor(id)).toEqual(["error"]);
  }, 20_000);

  it("rehacer con nota crea borrador-2 y no pisa el 1", async () => {
    const id = await propio();
    await armarChequeo(id, { manual: true }, { investigar: responde(valido()), aPdf: pdfFalso });
    const inv = responde(valido());
    await armarChequeo(id, { manual: true, nota: "Sin precios" }, { investigar: inv, aPdf: pdfFalso });
    expect(inv.llamadas[0].mensajes[0].content).toContain("Sin precios");
    expect((await fila(id)).pdfPath).toBe(`${id}/borrador-2.pdf`);
    expect(await motor(id)).toEqual(expect.arrayContaining(["armado", "rehecho"]));
  }, 20_000);

  it("tope lleno → en_fila; el manual sí pasa", async () => {
    process.env.CHEQUEOS_MOTOR_TOPE_DIA = "0";
    try {
      const id = await propio();
      expect((await armarChequeo(id, {}, { investigar: responde(valido()), aPdf: pdfFalso })).error.code).toBe("EN_FILA");
      expect((await fila(id)).motorEstado).toBe("en_fila");
      expect((await armarChequeo(id, { manual: true }, { investigar: responde(valido()), aPdf: pdfFalso })).ok).toBe(true);
    } finally {
      process.env.CHEQUEOS_MOTOR_TOPE_DIA = "1000";
    }
  }, 20_000);

  it("un automático fallido cuenta para el tope", async () => {
    // La base es compartida (local, CI, otras pruebas): el tope se fija a lo ya gastado + 1, no a 1 fijo.
    process.env.CHEQUEOS_MOTOR_TOPE_DIA = String((await automaticosUltimoDia()) + 1);
    try {
      const a = await propio();
      expect((await armarChequeo(a, {}, { investigar: responde("{}", "nada"), aPdf: pdfFalso })).error.code).toBe("MOTOR");
      const b = await propio();
      expect((await armarChequeo(b, {}, { investigar: responde(valido()), aPdf: pdfFalso })).error.code).toBe("EN_FILA");
    } finally {
      process.env.CHEQUEOS_MOTOR_TOPE_DIA = "1000";
    }
  }, 20_000);

  it("dos armados a la vez: solo uno corre", async () => {
    const id = await propio();
    const [a, b] = await Promise.all([
      armarChequeo(id, { manual: true }, { investigar: responde(valido()), aPdf: pdfFalso }),
      armarChequeo(id, { manual: true }, { investigar: responde(valido()), aPdf: pdfFalso }),
    ]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect([a, b].find((r) => !r.ok).error.code).toBe("YA_ARMANDO");
  }, 20_000);

  it("un tipo distinto al del chequeo es error", async () => {
    const id = await propio();
    const r = await armarChequeo(id, { manual: true }, { investigar: responde(JSON.stringify(contenidoMuestra("idea"))), aPdf: pdfFalso });
    expect(r.error.code).toBe("MOTOR");
  }, 20_000);

  it("si el PDF lanza → error, y el costo ya gastado queda en la bitácora", async () => {
    const id = await propio();
    const r = await armarChequeo(id, { manual: true }, { investigar: responde(valido()), aPdf: async () => { throw new Error("chromium"); } });
    expect(r.error.code).toBe("MOTOR");
    expect((await fila(id)).motorEstado).toBe("error");
    const ev = (await db.select().from(chequeoEvento).where(eq(chequeoEvento.chequeoId, id))).find((e) => e.detalle?.accion === "error");
    expect(ev.detalle.costoUsd).toBeGreaterThan(0);
  }, 20_000);

  it("armando atorado (>15 min) se retoma; uno reciente da YA_ARMANDO", async () => {
    const id = await propio();
    await db.update(chequeo).set({ motorEstado: "armando", updatedAt: new Date(Date.now() - 20 * 60_000) }).where(eq(chequeo.id, id));
    expect((await armarChequeo(id, { manual: true }, { investigar: responde(valido()), aPdf: pdfFalso })).ok).toBe(true);
    await db.update(chequeo).set({ motorEstado: "armando", updatedAt: new Date() }).where(eq(chequeo.id, id));
    expect((await armarChequeo(id, { manual: true }, { investigar: responde(valido()), aPdf: pdfFalso })).error.code).toBe("YA_ARMANDO");
  }, 20_000);

  it("recolecta, guarda el expediente, lo manda a la IA y lo reusa al rehacer", async () => {
    const id = await propio();
    let veces = 0;
    // El falso respeta `previo` como el real: misma pieza ok y mismos enlaces, no se vuelve a juntar.
    const recolectar = async (c, { previo } = {}) => {
      if (previo?.sitio?.ok && previo.enlaces?.sitio === c.enlaces?.sitio) return { ...previo, fecha: new Date().toISOString() };
      veces += 1;
      return {
        fecha: new Date().toISOString(),
        enlaces: { sitio: c.enlaces?.sitio, instagram: c.enlaces?.instagram },
        sitio: { ok: true, data: { url: "https://ejemplo.com" } },
        instagram: { ok: false, motivo: "No dio su Instagram." },
      };
    };
    const inv = responde(valido());
    await armarChequeo(id, { manual: true }, { investigar: inv, aPdf: pdfFalso, recolectar });
    expect(veces).toBe(1);
    expect((await fila(id)).expediente.sitio.data.url).toBe("https://ejemplo.com");
    expect(inv.llamadas[0].mensajes[0].content).toContain("No se pudo ver: instagram — No dio su Instagram.");
    await armarChequeo(id, { manual: true, nota: "Más corto" }, { investigar: responde(valido()), aPdf: pdfFalso, recolectar });
    expect(veces).toBe(1);
  }, 20_000);
});
