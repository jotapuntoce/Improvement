// El motor del Chequeo: estados, tope, investigación, validación, plantilla, PDF, bitácora y avisos. Nunca lanza: todo
// termina en borrador, en_fila o error, con su evento `motor`. Sin guard adentro (el guard vive en
// app/chequeos/actions.js; la API lo llama tras validar la clave). Spec: 2026-10-05-motor-chequeo-design.md.
import { and, count, eq, gte, inArray, sql } from "drizzle-orm";
import { chequeo, chequeoEvento } from "@jotapuntoce/db/schema";
import { db } from "../db.js";
import { avisar, panelUrl, quien, subirPdf } from "../chequeos.js";
import { MODELO, costoUsd, extraerJson, investigar } from "../ia.js";
import { contenidoSchema } from "./esquema.js";
import { METODO, METODO_VERSION, mensajeDe } from "./metodo.js";
import { aPdf } from "./pdf.js";
import { htmlChequeo } from "./plantilla.js";

const TOMABLES = ["sin_empezar", "en_fila", "borrador", "error"];
const tope = () => Number(process.env.CHEQUEOS_MOTOR_TOPE_DIA ?? 20);
const accion = (a) => sql`${chequeoEvento.detalle}->>'accion' = ${a}`;

const evento = (chequeoId, autor, detalle) => db.insert(chequeoEvento).values({ chequeoId, tipo: "motor", autor, detalle });

// ponytail: cuenta los armados ya terminados; una ráfaga simultánea puede pasarse del tope por unos cuantos.
async function automaticosUltimoDia() {
  const desde = new Date(Date.now() - 86_400_000);
  const [r] = await db
    .select({ n: count() })
    .from(chequeoEvento)
    .where(and(eq(chequeoEvento.tipo, "motor"), accion("armado"), sql`${chequeoEvento.detalle}->>'automatico' = 'true'`, gte(chequeoEvento.createdAt, desde)));
  return r.n;
}

async function borradoresHechos(id) {
  const [r] = await db
    .select({ n: count() })
    .from(chequeoEvento)
    .where(and(eq(chequeoEvento.chequeoId, id), eq(chequeoEvento.tipo, "motor"), sql`${chequeoEvento.detalle}->>'accion' in ('armado','rehecho')`));
  return r.n;
}

async function fallar(c, mensaje, uso) {
  await db.update(chequeo).set({ motorEstado: "error", motorError: mensaje, updatedAt: new Date() }).where(eq(chequeo.id, c.id));
  await evento(c.id, "improvement", { accion: "error", mensaje, ...(uso && { uso, costoUsd: costoUsd(uso) }) });
  await avisar(`⚠️ El motor no pudo armar el Chequeo de ${quien(c)}: ${mensaje} · ${panelUrl(c.id)}`);
  return { ok: false, error: { code: "MOTOR", mensaje } };
}

const correccion = (error) =>
  `Tu respuesta no pasó la validación. Corrige esto y responde ÚNICAMENTE el objeto JSON completo:\n${error.issues
    .map((i) => `- ${i.path.join(".") || "(raíz)"}: ${i.message}`)
    .join("\n")}`;

export async function armarChequeo(id, { manual = false, nota = null } = {}, deps = {}) {
  const inv = deps.investigar ?? investigar;
  const pdf = deps.aPdf ?? aPdf;
  try {
    const [c] = await db.select().from(chequeo).where(eq(chequeo.id, id)).limit(1);
    if (!c) return { ok: false, error: { code: "NO_ENCONTRADO" } };

    if (!manual && (await automaticosUltimoDia()) >= tope()) {
      await db.update(chequeo).set({ motorEstado: "en_fila", updatedAt: new Date() }).where(and(eq(chequeo.id, id), eq(chequeo.motorEstado, "sin_empezar")));
      await evento(id, "improvement", { accion: "en_fila" });
      await avisar(`⏸️ Tope del día lleno: el Chequeo de ${quien(c)} quedó en fila; ármalo tú desde el panel · ${panelUrl(id)}`);
      return { ok: false, error: { code: "EN_FILA" } };
    }

    const tomado = await db
      .update(chequeo)
      .set({ motorEstado: "armando", motorError: null, updatedAt: new Date() })
      .where(and(eq(chequeo.id, id), inArray(chequeo.motorEstado, TOMABLES)))
      .returning({ id: chequeo.id });
    if (!tomado.length) return { ok: false, error: { code: "YA_ARMANDO" } };

    const uso = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, busquedas: 0, paginas: 0 };
    const sumar = (u) => {
      for (const k of Object.keys(uso)) uso[k] += u?.[k] ?? 0;
    };

    let r = await inv({ sistema: METODO, mensajes: [{ role: "user", content: mensajeDe(c, { nota }) }] });
    sumar(r.uso);
    if (!r.ok) return fallar(c, r.error.mensaje, uso);
    let p = contenidoSchema.safeParse(extraerJson(r.data.texto) ?? {});
    if (!p.success) {
      r = await inv({ sistema: METODO, mensajes: [...r.data.mensajes, { role: "user", content: correccion(p.error) }] });
      sumar(r.uso);
      if (!r.ok) return fallar(c, r.error.mensaje, uso);
      p = contenidoSchema.safeParse(extraerJson(r.data.texto) ?? {});
      if (!p.success) return fallar(c, "La respuesta de la IA no tenía todas las piezas del Chequeo, ni al segundo intento.", uso);
    }
    const k = p.data;
    if (k.tipo !== c.tipo) return fallar(c, `La IA armó un Chequeo de ${k.tipo} y este es de ${c.tipo}.`, uso);

    const ruta = `${id}/borrador-${(await borradoresHechos(id)) + 1}.pdf`;
    const subido = await subirPdf(ruta, await pdf(htmlChequeo(c, k)));
    if (!subido.ok) return fallar(c, `No se pudo guardar el PDF: ${subido.error.mensaje}`, uso);

    const { notasInternas, fuentes, ...contenido } = k;
    await db.transaction(async (tx) => {
      await tx
        .update(chequeo)
        .set({ motorEstado: "borrador", motorError: null, contenido, notasInternas, fuentes, etapaProspecto: k.etapaProspecto, pdfPath: ruta, updatedAt: new Date() })
        .where(eq(chequeo.id, id));
      await tx.insert(chequeoEvento).values({
        chequeoId: id,
        tipo: "motor",
        autor: "improvement",
        detalle: { accion: nota ? "rehecho" : "armado", automatico: !manual, nota, pdfPath: ruta, uso, costoUsd: costoUsd(uso), modelo: MODELO, metodo: METODO_VERSION },
      });
    });
    await avisar(`📝 Borrador listo: Chequeo de ${quien(c)}. Revísalo y apruébalo · ${panelUrl(id)}`);
    return { ok: true, data: { pdfPath: ruta } };
  } catch (e) {
    const [c] = await db.select().from(chequeo).where(eq(chequeo.id, id)).limit(1).catch(() => []);
    if (c) return fallar(c, `Falla inesperada: ${e?.message ?? e}`);
    return { ok: false, error: { code: "MOTOR", mensaje: String(e?.message ?? e) } };
  }
}

export async function aprobarChequeo(id) {
  const r = await db
    .update(chequeo)
    .set({ motorEstado: "aprobado", updatedAt: new Date() })
    .where(and(eq(chequeo.id, id), eq(chequeo.motorEstado, "borrador")))
    .returning({ id: chequeo.id });
  if (!r.length) return { ok: false, error: { code: "SIN_BORRADOR", mensaje: "No hay un borrador por aprobar." } };
  await evento(id, "jose_carlos", { accion: "aprobado" });
  return { ok: true, data: null };
}

/** Dólares gastados en IA desde el día 1 del mes. */
export async function gastoDelMes() {
  const inicio = new Date();
  inicio.setDate(1);
  inicio.setHours(0, 0, 0, 0);
  const [r] = await db
    .select({ total: sql`coalesce(sum((${chequeoEvento.detalle}->>'costoUsd')::numeric), 0)` })
    .from(chequeoEvento)
    .where(and(eq(chequeoEvento.tipo, "motor"), gte(chequeoEvento.createdAt, inicio)));
  return Number(r.total);
}
