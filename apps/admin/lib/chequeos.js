// Operaciones del inventario de chequeos. Sin guard adentro (mismo patrón que app/clientes/actions.js): el guard vive
// en el borde — requirePlatformAdmin() en app/chequeos/actions.js; la puerta pública (app/api/chequeos) no lleva sesión
// y se protege con CORS, la trampa para bots y la clave del envío 2. Toda acción deja su evento en la bitácora.
// Spec: docs/superpowers/specs/2026-10-02-inventario-chequeos-design.md
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { chequeo, chequeoEvento, prospectClient, prospectCompany } from "@jotapuntoce/db/schema";
import { db, supabaseAdmin } from "./db.js";
import { sendWhatsAppMessage } from "./whatsapp.js";
import {
  CANAL_LABEL,
  ETAPAS,
  PRODUCTO_LABEL,
  camposInvalidos,
  compraSchema,
  contactoSchema,
  entrevistaSchema,
  negocioClave,
  propioSchema,
  registroSchema,
} from "./chequeoDatos.js";

export const MENSAJE_YA_EXISTE =
  "Ya hay un chequeo gratis con estos datos. Si crees que es un error, escríbenos por WhatsApp.";

const hash = (s) => createHash("sha256").update(s).digest("hex");
const invalido = (error) => ({ ok: false, error: { code: "DATOS_INVALIDOS", campos: camposInvalidos(error) } });
const yaExiste = { ok: false, error: { code: "YA_EXISTE", mensaje: MENSAJE_YA_EXISTE } };
const noEncontrado = { ok: false, error: { code: "NO_ENCONTRADO" } };
const esUuid = (id) => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
// drizzle envuelve el error de postgres-js en `cause`.
const esDuplicado = (e) => (e?.code ?? e?.cause?.code) === "23505";
const panelUrl = (id) => `${process.env.ADMIN_URL ?? "http://localhost:3100"}/chequeos/${id}`;
const quien = (c) => [c.nombre, c.negocio].filter(Boolean).join(" · ") || "Sin nombre";

/** WhatsApp al dueño. Nunca lanza ni frena al que llama: el aviso también vive en la bitácora del panel. */
export async function avisar(texto) {
  const to = process.env.AVISOS_WHATSAPP_A;
  if (!to) return { ok: false, reason: "sin_destino" };
  try {
    return await sendWhatsAppMessage({ to, body: texto });
  } catch (e) {
    return { ok: false, reason: "error", detail: String(e) };
  }
}

async function insertarChequeo(valores, autor) {
  try {
    return await db.transaction(async (tx) => {
      const [fila] = await tx.insert(chequeo).values(valores).returning();
      await tx.insert(chequeoEvento).values({ chequeoId: fila.id, tipo: "registro", autor });
      return { ok: true, fila };
    });
  } catch (e) {
    if (esDuplicado(e)) return yaExiste;
    throw e;
  }
}

/** Envío 1 de la landing. Devuelve la clave del envío 2 una sola vez; en la base solo queda su hash. */
export async function registrarChequeo(input) {
  const p = registroSchema.safeParse(input);
  if (!p.success) return invalido(p.error);
  const d = p.data;
  const clave = randomBytes(32).toString("base64url");
  const ahora = new Date();
  const r = await insertarChequeo(
    {
      origen: "landing",
      tipo: d.tipo,
      nombre: d.nombre,
      negocio: d.negocio,
      negocioClave: negocioClave(d),
      giro: d.giro,
      ciudad: d.ciudad,
      correo: d.correo,
      telefono: d.telefono,
      canal: d.canal,
      canalDetalle: d.canalDetalle,
      utm: d.utm ?? null,
      claveHash: hash(clave),
      aceptaAvisoAt: ahora,
      aceptaCorreos: d.aceptaCorreos,
      aceptaCorreosAt: d.aceptaCorreos ? ahora : null,
    },
    "prospecto",
  );
  if (!r.ok) return r;
  await avisar(
    `🧠 Chequeo nuevo: ${quien(d)} (${d.giro}, ${d.ciudad}) · llegó por ${CANAL_LABEL[d.canal]} · ${panelUrl(r.fila.id)}`,
  );
  return { ok: true, data: { id: r.fila.id, clave } };
}

/** Envío 2 de la landing: la entrevista. Id inexistente y clave equivocada dan el mismo error. */
export async function guardarEntrevista(id, input) {
  const p = entrevistaSchema.safeParse(input);
  if (!p.success) return invalido(p.error);
  const d = p.data;
  if (!esUuid(id)) return noEncontrado;

  const [fila] = await db.select().from(chequeo).where(eq(chequeo.id, id)).limit(1);
  const a = Buffer.from(fila?.claveHash ?? "");
  const b = Buffer.from(hash(d.clave));
  if (!fila || a.length !== b.length || !timingSafeEqual(a, b)) return noEncontrado;
  if (fila.etapa !== "registrado") return { ok: false, error: { code: "YA_ENVIADA" } };

  const ahora = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(chequeo)
      .set({
        enlaces: d.enlaces,
        sinRedes: d.sinRedes,
        respuestas: d.respuestas,
        entrevistaSegundos: d.entrevistaSegundos ?? null,
        entrevistaAt: ahora,
        etapa: "pedido",
        updatedAt: ahora,
      })
      .where(and(eq(chequeo.id, id), eq(chequeo.etapa, "registrado")));
    await tx.insert(chequeoEvento).values([
      { chequeoId: id, tipo: "entrevista", autor: "prospecto", detalle: { segundos: d.entrevistaSegundos ?? null } },
      { chequeoId: id, tipo: "etapa", autor: "prospecto", detalle: { de: "registrado", a: "pedido" } },
    ]);
  });

  const dias = Math.floor((ahora - fila.createdAt) / 86_400_000);
  const cuando = dias === 0 ? "el mismo día" : `${dias} día(s) después del registro`;
  const minutos = d.entrevistaSegundos ? `, en ${Math.max(1, Math.round(d.entrevistaSegundos / 60))} min` : "";
  await avisar(`✅ ${quien(fila)} contestó la entrevista (${cuando}${minutos}) · ${panelUrl(id)}`);
  return { ok: true, data: null };
}

/** Chequeo que hace Jose Carlos (o que le pide a Improvement). Entra en `pedido`. */
export async function crearChequeoPropio(input) {
  const p = propioSchema.safeParse(input);
  if (!p.success) return invalido(p.error);
  const d = p.data;
  const r = await insertarChequeo(
    {
      origen: "propio",
      tipo: d.tipo,
      nombre: d.nombre,
      negocio: d.negocio,
      negocioClave: negocioClave(d),
      giro: d.giro,
      ciudad: d.ciudad,
      correo: d.correo,
      telefono: d.telefono,
      canal: d.canal,
      canalDetalle: d.canalDetalle,
      abrePuerta: d.abrePuerta,
      etapa: "pedido",
    },
    "jose_carlos",
  );
  return r.ok ? { ok: true, data: { id: r.fila.id } } : r;
}

/** `cliente` no se pone a mano: sale de registrarCompra. */
export async function cambiarEtapa(id, etapa, autor = "jose_carlos") {
  if (!ETAPAS.includes(etapa)) return { ok: false, error: { code: "DATOS_INVALIDOS", campos: { etapa: "No existe" } } };
  if (etapa === "cliente") return { ok: false, error: { code: "USA_COMPRA", mensaje: "Para volverlo cliente, registra su compra." } };
  const [fila] = await db.select().from(chequeo).where(eq(chequeo.id, id)).limit(1);
  if (!fila) return noEncontrado;
  if (fila.etapa === etapa) return { ok: true, data: null };
  await db.transaction(async (tx) => {
    await tx.update(chequeo).set({ etapa, updatedAt: new Date() }).where(eq(chequeo.id, id));
    await tx.insert(chequeoEvento).values({ chequeoId: id, tipo: "etapa", autor, detalle: { de: fila.etapa, a: etapa } });
  });
  return { ok: true, data: null };
}

export async function anotarContacto(id, input) {
  const p = contactoSchema.safeParse(input);
  if (!p.success) return invalido(p.error);
  const { tipo, resultado, nota } = p.data;
  await db.insert(chequeoEvento).values({
    chequeoId: id,
    tipo,
    autor: "jose_carlos",
    detalle: { resultado: resultado ?? null, nota },
  });
  return { ok: true, data: null };
}

export async function fijarProximaAccion(id, { accion, fecha }) {
  await db
    .update(chequeo)
    .set({ proximaAccion: accion || null, proximaFecha: fecha || null, updatedAt: new Date() })
    .where(eq(chequeo.id, id));
  return { ok: true, data: null };
}

const e164 = (tel) => (tel.length === 10 ? `+52${tel}` : `+${tel}`);

/**
 * Registra una compra. La primera vuelve al prospecto cliente: etapa `cliente` y su ficha en Clientes, una sola vez y
 * en la misma transacción. Inserta directo en prospect_client/prospect_company (en vez de createProspectClient()) para
 * que la ficha y el chequeo no puedan quedar a medias.
 */
export async function registrarCompra(id, input) {
  const p = compraSchema.safeParse(input);
  if (!p.success) return invalido(p.error);
  const { producto, monto } = p.data;
  const [fila] = await db.select().from(chequeo).where(eq(chequeo.id, id)).limit(1);
  if (!fila) return noEncontrado;
  if (!fila.correo || !fila.telefono || !fila.nombre) {
    return { ok: false, error: { code: "FALTAN_DATOS", mensaje: "Para volverlo cliente faltan nombre, correo o teléfono." } };
  }

  const prospectClientId = await db.transaction(async (tx) => {
    let clienteId = fila.prospectClientId;
    if (!clienteId) {
      const [cliente] = await tx
        .insert(prospectClient)
        .values({ fullName: fila.nombre, email: fila.correo, whatsappPhone: e164(fila.telefono) })
        .returning();
      await tx.insert(prospectCompany).values({
        prospectClientId: cliente.id,
        name: fila.negocio ?? fila.giro,
        industry: fila.giro,
        notes: `Llegó por el chequeo (${CANAL_LABEL[fila.canal]}).`,
      });
      clienteId = cliente.id;
    }
    await tx
      .update(chequeo)
      .set({ etapa: "cliente", prospectClientId: clienteId, updatedAt: new Date() })
      .where(eq(chequeo.id, id));
    await tx.insert(chequeoEvento).values({ chequeoId: id, tipo: "compra", autor: "jose_carlos", detalle: { producto, monto } });
    if (fila.etapa !== "cliente") {
      await tx
        .insert(chequeoEvento)
        .values({ chequeoId: id, tipo: "etapa", autor: "jose_carlos", detalle: { de: fila.etapa, a: "cliente" } });
    }
    return clienteId;
  });

  await avisar(`💰 Compra: ${quien(fila)} · ${PRODUCTO_LABEL[producto]} · ${pesos(monto)} · ${panelUrl(id)}`);
  return { ok: true, data: { prospectClientId } };
}

export const pesos = (n) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);

// ---- PDF (bucket privado de Supabase Storage) ----

const BUCKET = "chequeos";

export async function guardarPdf(id, archivo) {
  if (!archivo || archivo.type !== "application/pdf") return { ok: false, error: { code: "NO_ES_PDF", mensaje: "Sube un PDF." } };
  await supabaseAdmin.storage.createBucket(BUCKET, { public: false }).catch(() => {}); // ya existe → se ignora
  const ruta = `${id}/${Date.now()}.pdf`;
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(ruta, Buffer.from(await archivo.arrayBuffer()), { contentType: "application/pdf" });
  if (error) return { ok: false, error: { code: "STORAGE", mensaje: error.message } };
  await db.update(chequeo).set({ pdfPath: ruta, updatedAt: new Date() }).where(eq(chequeo.id, id));
  return { ok: true, data: { ruta } };
}

/** Enlace firmado de 10 minutos, generado al abrir la página del chequeo. */
export async function urlPdf(ruta) {
  if (!ruta) return null;
  const { data } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(ruta, 600);
  return data?.signedUrl ?? null;
}

// ---- Lecturas del panel ----

export async function getChequeo(id) {
  if (!esUuid(id)) return null;
  const [fila] = await db.select().from(chequeo).where(eq(chequeo.id, id)).limit(1);
  if (!fila) return null;
  const eventos = await db
    .select()
    .from(chequeoEvento)
    .where(eq(chequeoEvento.chequeoId, id))
    .orderBy(desc(chequeoEvento.createdAt));
  return { ...fila, eventos };
}

// ponytail: lee las dos tablas completas y agrupa en memoria (igual que app/planos); con miles de chequeos, group by en SQL.
async function todo() {
  const [chequeos, eventos] = await Promise.all([
    db.select().from(chequeo).orderBy(desc(chequeo.createdAt)),
    db.select().from(chequeoEvento).orderBy(desc(chequeoEvento.createdAt)),
  ]);
  return { chequeos, eventos };
}

export async function listarChequeos({ etapa } = {}) {
  const { chequeos, eventos } = await todo();
  const ultimo = new Map();
  for (const e of eventos) if (!ultimo.has(e.chequeoId)) ultimo.set(e.chequeoId, e.createdAt);
  return chequeos
    .filter((c) => !etapa || c.etapa === etapa)
    .map((c) => ({ ...c, ultimoMovimiento: ultimo.get(c.id) ?? c.createdAt }));
}

export async function tablero() {
  const { chequeos, eventos } = await todo();
  const compras = new Map(); // chequeoId → Set(producto)
  for (const e of eventos) {
    if (e.tipo !== "compra") continue;
    if (!compras.has(e.chequeoId)) compras.set(e.chequeoId, new Set());
    compras.get(e.chequeoId).add(e.detalle?.producto);
  }
  const compro = (c, producto) => compras.get(c.id)?.has(producto) ?? false;
  const porEtapa = {};
  const canales = new Map();
  for (const c of chequeos) {
    porEtapa[c.etapa] = (porEtapa[c.etapa] ?? 0) + 1;
    const k = canales.get(c.canal) ?? { canal: c.canal, total: 0, compraron: 0, completo: 0 };
    k.total += 1;
    if (compras.has(c.id)) k.compraron += 1;
    if (compro(c, "completo")) k.completo += 1;
    canales.set(c.canal, k);
  }
  const porId = new Map(chequeos.map((c) => [c.id, c]));
  return {
    total: chequeos.length,
    sinEntrevista: porEtapa.registrado ?? 0,
    porEtapa,
    escalera: {
      algo: compras.size,
      diagnostico: chequeos.filter((c) => compro(c, "diagnostico_360")).length,
      completo: chequeos.filter((c) => compro(c, "completo")).length,
    },
    porCanal: [...canales.values()].sort((a, b) => b.total - a.total),
    avisos: eventos
      .filter((e) => ["registro", "entrevista", "compra"].includes(e.tipo))
      .slice(0, 8)
      .map((e) => ({ ...e, chequeo: porId.get(e.chequeoId) })),
  };
}
