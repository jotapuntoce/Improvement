// Lo que el modelo tiene que devolver para que exista un Chequeo. Si no pasa, el motor reintenta una vez y luego marca
// error (spec 2026-10-05-motor-chequeo-design.md, sección 3). Los textos se ven en el PDF tal cual.
import { z } from "zod";

const texto = z.string().trim().min(1);
const lista = z.array(texto).min(1).max(6);
const accion = z.object({ titulo: texto, como: texto });

const patogeno = z
  .object({
    titulo: texto,
    evidencia: texto,
    costo: texto,
    marca: z.enum(["dato", "estimacion"]),
    supuesto: z.string().trim().optional(),
  })
  .refine((p) => p.marca === "dato" || p.supuesto, { path: ["supuesto"], message: "Una estimación lleva su supuesto" });

const comun = {
  portada: z.object({ dedicatoria: texto }),
  porQue: texto,
  bueno: lista,
  cierre: texto,
  fuentes: z.array(z.object({ url: texto, que: texto })).default([]),
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
  patogenos: z.array(patogeno).min(1).max(6),
  pastillas: z.array(accion).min(1).max(6),
  noSeVe: texto,
});

export const contenidoEmprendedor = z.object({
  tipo: z.literal("emprendedor"),
  etapaProspecto: z.literal("idea"),
  ...comun,
  idea: z.object({ viable: z.boolean(), porque: texto, leFalta: lista }),
  pasos: z.array(accion).min(1).max(7),
  siguienteNivel: texto,
});

export const contenidoSchema = z.discriminatedUnion("tipo", [contenidoNegocio, contenidoEmprendedor]);
