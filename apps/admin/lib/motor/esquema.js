// Lo que el modelo tiene que devolver para que exista un Chequeo, con el molde del primer Chequeo de Boreal (spec
// 2026-10-05-chequeo-como-el-primero-design.md, sección 5). Si no pasa, el motor reintenta una vez y luego marca error.
// Los textos se ven en el PDF tal cual. La página 2 no es de la IA: es el texto fijo del dueño (plantilla.js).
import { z } from "zod";

const texto = z.string().trim().min(1);
// La línea con la que abre cada sección: "texto <mano> despues"; `mano` va en letra a mano.
const guia = z.object({ texto, mano: texto, despues: z.string().trim().optional() });
const accion = z.object({ titulo: texto, como: texto });
const kpi = z.object({ valor: texto, texto });

const sintoma = z
  .object({
    titulo: texto,
    vimos: texto,
    importa: texto,
    marca: z.enum(["dato", "estimacion"]),
    supuesto: z.string().trim().optional(),
  })
  .refine((s) => s.marca === "dato" || s.supuesto, { path: ["supuesto"], message: "Una estimación lleva su supuesto" });

const comun = {
  trato: z.enum(["tu", "ustedes"]),
  portada: z.object({ dedicatoria: texto }),
  cierre: texto,
  fuentes: z.array(z.object({ url: z.url({ protocol: /^https?$/ }), que: texto })).default([]),
  notasInternas: z.object({
    comoEscribe: texto,
    tiempo: texto,
    sinConfirmar: z.array(texto).default([]),
    siguientePaso: texto,
  }),
};

export const contenidoNegocio = z.object({
  tipo: z.literal("negocio"),
  etapaProspecto: z.enum(["arrancando", "creciendo", "consolidado"]),
  ...comun,
  bueno: z.object({
    guia,
    felicitacion: z.array(kpi).min(1).max(3),
    conecta: z
      .object({ titulo: texto, items: z.array(z.object({ que: texto, valor: z.number().nonnegative() })).min(2).max(6) })
      .optional(),
    patron: texto,
  }),
  sintomas: z.object({ guia, items: z.array(sintoma).min(1).max(5) }),
  recetas: z.object({
    guia,
    items: z.array(accion).min(1).max(5),
    dimensionar: z.object({ texto, supuesto: texto }).optional(),
  }),
  noSeVe: z.object({ guia, intro: texto, preguntas: z.array(texto).min(3).max(5) }),
});

export const contenidoEmprendedor = z.object({
  tipo: z.literal("emprendedor"),
  etapaProspecto: z.literal("idea"),
  ...comun,
  bueno: z.object({ guia, felicitacion: z.array(kpi).max(3).default([]), patron: texto }),
  idea: z.object({ guia, viable: z.boolean(), porque: texto, leFalta: z.array(texto).min(1).max(6) }),
  pasos: z.object({ guia, items: z.array(accion).min(1).max(7) }),
  siguienteNivel: z.object({ guia, texto }),
});

export const contenidoSchema = z.discriminatedUnion("tipo", [contenidoNegocio, contenidoEmprendedor]);
