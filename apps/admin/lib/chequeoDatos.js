// Datos del inventario de chequeos sin base de datos: catálogos, normalización y validación (zod) del borde.
// Lo comparten la puerta pública (app/api/chequeos) y el panel (app/chequeos).
// Spec: docs/superpowers/specs/2026-10-02-inventario-chequeos-design.md
import { z } from "zod";
import { slugify } from "./slugify.js";

export const ETAPAS = ["registrado", "pedido", "entregado", "contacto", "conversacion", "diagnostico", "propuesta", "cliente", "perdido"];
export const ETAPA_LABEL = {
  registrado: "Registrado",
  pedido: "Pedido",
  entregado: "Entregado",
  contacto: "Contacto",
  conversacion: "Conversación",
  diagnostico: "Diagnóstico",
  propuesta: "Propuesta",
  cliente: "Cliente",
  perdido: "Perdido",
};
export const CANALES = ["anuncio_meta", "referido", "summum", "tiktok", "youtube", "anuncio_google", "conferencia", "webinar", "live", "reel", "otro"];
export const CANAL_LABEL = {
  anuncio_meta: "Anuncio de Meta",
  referido: "Me recomendó un amigo",
  summum: "Summum System",
  tiktok: "TikTok",
  youtube: "YouTube",
  anuncio_google: "Anuncio de Google",
  conferencia: "Conferencia presencial",
  webinar: "Webinar",
  live: "Live",
  reel: "Reel",
  otro: "Otro",
};
export const PRODUCTOS = ["kit", "base", "diagnostico_360", "completo", "director", "acabados", "become", "otro"];
export const PRODUCTO_LABEL = {
  kit: "Kit Arranque",
  base: "Improvement Base",
  diagnostico_360: "Diagnóstico 360",
  completo: "Improvement Completo",
  director: "Improvement Director",
  acabados: "Acabados de lujo",
  become: "BECOME",
  otro: "Otro",
};
export const ENLACES = ["instagram", "youtube", "linkedin", "facebook", "tiktok", "sitio", "google"];
export const RESULTADOS = ["respondio", "sin_respuesta", "agendo", "no_le_interesa", "otro"];
export const RESULTADO_LABEL = {
  respondio: "Respondió",
  sin_respuesta: "Sin respuesta",
  agendo: "Agendó",
  no_le_interesa: "No le interesa",
  otro: "Otro",
};

export const normalizarCorreo = (s) => s.trim().toLowerCase();

/** Solo dígitos; quita el 52 (o 521) de México para que "+52 444…" y "444…" sean el mismo número. */
export function normalizarTelefono(s) {
  const d = s.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("521")) return d.slice(3);
  if (d.length === 12 && d.startsWith("52")) return d.slice(2);
  return d;
}

export function negocioClave({ tipo, negocio, ciudad }) {
  if (tipo !== "negocio" || !negocio) return null;
  return `${slugify(negocio)}|${slugify(ciudad)}`;
}

const texto = z.string().trim().min(1, "Obligatorio");
const opcional = z
  .string()
  .trim()
  .nullish()
  .transform((s) => s || null);

const base = {
  tipo: z.enum(["negocio", "emprendedor"]),
  negocio: opcional,
  giro: texto,
  ciudad: texto,
  canal: z.enum(CANALES),
  canalDetalle: opcional,
};

const conNegocio = (s) =>
  s.refine((d) => d.tipo !== "negocio" || d.negocio, { path: ["negocio"], message: "Obligatorio" });

export const registroSchema = conNegocio(
  z.object({
    ...base,
    nombre: texto,
    correo: z.string().trim().pipe(z.email("Correo inválido")).transform(normalizarCorreo),
    telefono: texto
      .transform(normalizarTelefono)
      .refine((t) => t.length >= 10 && t.length <= 15, "Teléfono inválido"),
    utm: z.record(z.string(), z.string()).optional(),
    aceptaAviso: z.literal(true, { error: "Hay que aceptar el aviso de privacidad" }),
    aceptaCorreos: z.boolean().default(false),
  }),
);

/** Chequeo creado por Jose Carlos: persona, correo y teléfono opcionales. */
export const propioSchema = conNegocio(
  z.object({
    ...base,
    nombre: opcional,
    correo: opcional
      .refine((c) => !c || z.email().safeParse(c).success, "Correo inválido")
      .transform((c) => (c ? normalizarCorreo(c) : null)),
    telefono: opcional.transform((t) => (t ? normalizarTelefono(t) : null)),
    abrePuerta: opcional,
  }),
);

export const entrevistaSchema = z
  .object({
    clave: z.string().min(20),
    enlaces: z.partialRecord(z.enum(ENLACES), z.url("Enlace inválido")).default({}),
    sinRedes: z.boolean().default(false),
    respuestas: z.array(z.object({ pregunta: texto, respuesta: texto })).length(3, "Faltan respuestas"),
    entrevistaSegundos: z.number().int().nonnegative().optional(),
  })
  .refine((d) => d.sinRedes || Object.keys(d.enlaces).length > 0, {
    path: ["enlaces"],
    message: "Pon al menos un enlace o marca que tu negocio no tiene redes",
  });

export const compraSchema = z.object({
  producto: z.enum(PRODUCTOS),
  monto: z.coerce.number().int().nonnegative(),
});

export const contactoSchema = z.object({
  tipo: z.enum(["correo", "mensaje", "llamada", "nota"]),
  resultado: z.enum(RESULTADOS).optional().or(z.literal("").transform(() => undefined)),
  nota: opcional,
});

/** { campo: mensaje } a partir de un ZodError — lo que la landing usa para marcar cada campo. */
export function camposInvalidos(error) {
  const campos = {};
  for (const issue of error.issues) {
    const campo = issue.path[0] ?? "_";
    campos[campo] ??= issue.message;
  }
  return campos;
}

/** Cómo se nombra un chequeo en el panel: el negocio, o la idea del emprendedor. */
export const nombreDe = (c) => c.negocio ?? `Idea: ${c.giro}`;

/** Etapa visible: un `pedido` que ya tiene PDF está listo para entregar. */
export const etapaDe = (c) => (c.etapa === "pedido" && c.pdfPath ? "Listo para entregar" : ETAPA_LABEL[c.etapa]);
