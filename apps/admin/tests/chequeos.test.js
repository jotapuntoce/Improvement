// Integración contra el Supabase de desarrollo (apps/admin/.env.test). Cada prueba borra lo que crea; el cascade
// borra la bitácora. Se prueba lib/chequeos.js y los handlers de la puerta pública con un Request armado a mano.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../lib/db.js";
import { chequeo, chequeoEvento, prospectClient } from "@jotapuntoce/db/schema";
import {
  avisar,
  cambiarEtapa,
  crearChequeoPropio,
  guardarEntrevista,
  listarChequeos,
  registrarChequeo,
  registrarCompra,
  tablero,
} from "../lib/chequeos.js";
import { POST } from "../app/api/chequeos/route.js";
import { PATCH } from "../app/api/chequeos/[id]/route.js";

const ORIGEN = "https://www.jotapuntoce.com";
const marca = `t${Date.now()}`;
const ids = [];
const clientes = [];

beforeAll(() => {
  process.env.AVISOS_WHATSAPP_A = ""; // ninguna prueba manda WhatsApp de verdad
  process.env.CHEQUEOS_ORIGENES = `${ORIGEN},http://localhost:4400`;
});

afterEach(async () => {
  if (ids.length) await db.delete(chequeo).where(inArray(chequeo.id, ids.splice(0)));
  if (clientes.length) await db.delete(prospectClient).where(inArray(prospectClient.id, clientes.splice(0)));
});

let n = 0;
function registro(extra = {}) {
  n += 1;
  return {
    tipo: "negocio",
    nombre: "Ana López",
    negocio: `Negocio ${marca} ${n}`,
    giro: "club de pádel",
    correo: `ana.${marca}.${n}@ejemplo.com`,
    telefono: `+52 4${String(Date.now() * 10 + n).slice(-9)}`,
    ciudad: "San Luis Potosí",
    canal: "reel",
    aceptaAviso: true,
    aceptaCorreos: true,
    ...extra,
  };
}

async function registrar(extra) {
  const r = await registrarChequeo(registro(extra));
  if (r.ok) ids.push(r.data.id);
  return r;
}

const entrevista = (clave, extra = {}) => ({
  clave,
  enlaces: { instagram: "https://instagram.com/boreal" },
  respuestas: [1, 2, 3].map((i) => ({ pregunta: `P${i}`, respuesta: `R${i}` })),
  entrevistaSegundos: 360,
  ...extra,
});

const eventosDe = (id) => db.select().from(chequeoEvento).where(eq(chequeoEvento.chequeoId, id));

describe("registro", () => {
  it("guarda en registrado con su evento y sin la clave en claro", async () => {
    const r = await registrar();
    expect(r.ok).toBe(true);
    const [fila] = await db.select().from(chequeo).where(eq(chequeo.id, r.data.id));
    expect(fila.etapa).toBe("registrado");
    expect(fila.claveHash).not.toBe(r.data.clave);
    expect((await eventosDe(r.data.id)).map((e) => e.tipo)).toEqual(["registro"]);
  });

  it("un chequeo por correo, por teléfono y por negocio", async () => {
    const a = registro();
    const r1 = await registrarChequeo(a);
    ids.push(r1.data.id);
    for (const dup of [
      { ...registro(), correo: a.correo.toUpperCase() },
      { ...registro(), telefono: a.telefono.replace("+52 ", "") },
      { ...registro(), negocio: a.negocio.toUpperCase(), ciudad: "san luis potosi" },
    ]) {
      const r = await registrarChequeo(dup);
      expect(r.ok).toBe(false);
      expect(r.error.code).toBe("YA_EXISTE");
    }
  });

  it("dos emprendedores con la misma idea y distinto correo pasan", async () => {
    expect((await registrar({ tipo: "emprendedor", negocio: "La misma idea" })).ok).toBe(true);
    expect((await registrar({ tipo: "emprendedor", negocio: "La misma idea" })).ok).toBe(true);
  });

  it("datos inválidos dicen qué campo", async () => {
    const r = await registrarChequeo(registro({ correo: "no-es-correo" }));
    expect(r.error.code).toBe("DATOS_INVALIDOS");
    expect(r.error.campos.correo).toBeTruthy();
  });
});

describe("entrevista", () => {
  it("pasa a pedido con sus eventos", async () => {
    const { data } = await registrar();
    expect((await guardarEntrevista(data.id, entrevista(data.clave))).ok).toBe(true);
    const [fila] = await db.select().from(chequeo).where(eq(chequeo.id, data.id));
    expect(fila.etapa).toBe("pedido");
    expect(fila.entrevistaAt).toBeTruthy();
    expect((await eventosDe(data.id)).map((e) => e.tipo).sort()).toEqual(["entrevista", "etapa", "registro"]);
  });

  it("clave equivocada → NO_ENCONTRADO; dos veces → YA_ENVIADA", async () => {
    const { data } = await registrar();
    expect((await guardarEntrevista(data.id, entrevista("y".repeat(43)))).error.code).toBe("NO_ENCONTRADO");
    await guardarEntrevista(data.id, entrevista(data.clave));
    expect((await guardarEntrevista(data.id, entrevista(data.clave))).error.code).toBe("YA_ENVIADA");
  });

  it("sin enlaces ni casilla → DATOS_INVALIDOS", async () => {
    const { data } = await registrar();
    const r = await guardarEntrevista(data.id, entrevista(data.clave, { enlaces: {} }));
    expect(r.error.code).toBe("DATOS_INVALIDOS");
  });
});

describe("panel", () => {
  it("cambiar etapa escribe la bitácora; cliente solo por compra", async () => {
    const { data } = await registrar();
    await cambiarEtapa(data.id, "contacto");
    const ev = (await eventosDe(data.id)).find((e) => e.tipo === "etapa");
    expect(ev.detalle).toEqual({ de: "registrado", a: "contacto" });
    expect((await cambiarEtapa(data.id, "cliente")).error.code).toBe("USA_COMPRA");
  });

  it("compra sin correo falla; la primera crea un cliente, la segunda no", async () => {
    const propio = await crearChequeoPropio({
      tipo: "negocio",
      negocio: `Propio ${marca}`,
      giro: "club de pádel",
      ciudad: "SLP",
      canal: "referido",
    });
    ids.push(propio.data.id);
    const sinCorreo = await registrarCompra(propio.data.id, { producto: "diagnostico_360", monto: 7500 });
    expect(sinCorreo.error.code).toBe("FALTAN_DATOS");

    const { data } = await registrar();
    const c1 = await registrarCompra(data.id, { producto: "diagnostico_360", monto: 7500 });
    clientes.push(c1.data.prospectClientId);
    const c2 = await registrarCompra(data.id, { producto: "completo", monto: 28000 });
    expect(c2.data.prospectClientId).toBe(c1.data.prospectClientId);
    const [fila] = await db.select().from(chequeo).where(eq(chequeo.id, data.id));
    expect(fila.etapa).toBe("cliente");
    expect((await eventosDe(data.id)).filter((e) => e.tipo === "compra")).toHaveLength(2);
  }, 20_000); // ~15 consultas seguidas contra el Supabase remoto

  it("tablero cuenta la escalera y por canal", async () => {
    const { data } = await registrar({ canal: "tiktok" });
    const c = await registrarCompra(data.id, { producto: "completo", monto: 28000 });
    clientes.push(c.data.prospectClientId);
    const t = await tablero();
    expect(t.escalera.completo).toBeGreaterThanOrEqual(1);
    expect(t.porCanal.find((x) => x.canal === "tiktok").completo).toBeGreaterThanOrEqual(1);
    const lista = await listarChequeos({ etapa: "cliente" });
    expect(lista.find((x) => x.id === data.id).ultimoMovimiento).toBeInstanceOf(Date);
  });

  it("avisar sin destino no lanza", async () => {
    await expect(avisar("hola")).resolves.toMatchObject({ ok: false });
  });
});

const pedir = (body, origin = ORIGEN, method = "POST") =>
  new Request("http://localhost/api/chequeos", {
    method,
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });

describe("api", () => {
  it("registro 201, duplicado 409, inválido 400, origen ajeno 403", async () => {
    const body = registro();
    const r = await POST(pedir(body));
    expect(r.status).toBe(201);
    expect(r.headers.get("access-control-allow-origin")).toBe(ORIGEN);
    const { data } = await r.json();
    ids.push(data.id);
    expect((await POST(pedir(body))).status).toBe(409);
    expect((await POST(pedir(registro({ correo: "x" })))).status).toBe(400);
    expect((await POST(pedir(registro(), "https://malo.com"))).status).toBe(403);
  });

  it("trampa llena → 201 y nada guardado", async () => {
    const body = registro({ sitio_web: "http://spam" });
    expect((await POST(pedir(body))).status).toBe(201);
    expect(await db.select().from(chequeo).where(eq(chequeo.correo, body.correo))).toHaveLength(0);
  });

  it("entrevista 200 y luego 409", async () => {
    const { data } = await registrar();
    const ctx = { params: Promise.resolve({ id: data.id }) };
    expect((await PATCH(pedir(entrevista(data.clave), ORIGEN, "PATCH"), ctx)).status).toBe(200);
    expect((await PATCH(pedir(entrevista(data.clave), ORIGEN, "PATCH"), ctx)).status).toBe(409);
  });
});
