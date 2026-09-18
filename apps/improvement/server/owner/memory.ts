// Lo que Improvement sabe del dueño de ESTA empresa.
//
// Es la materia prima del Director General. Improvement no es una herramienta que la empresa usa:
// dirige la empresa mientras aprende cómo su dueño trabaja, piensa, ejecuta, idea, planea, delega,
// dirige y visualiza. Sin este módulo no tiene de qué aprender — no porque falte el cerebro, sino
// porque no hay nada escrito.
//
// Dos reglas que no se rompen:
//
// 1. **Cada Improvement aprende del dueño de SU empresa, nunca del arquitecto.** Jose Carlos entra
//    a cada organización con membresía de dueño para poder dar soporte; aquí eso no lo convierte en
//    fuente. La consulta va por owner_id, así que lo que él escriba en una empresa sería suyo y de
//    nadie más — pero es que además él no llena estos formularios: deja la empresa lista y el
//    cliente la llena. Ver la memoria del proyecto improvement-director-general.
// 2. **Append-only**, como employee_points_ledger. Una respuesta vieja no se corrige: se agrega la
//    nueva. Cómo pensaba el dueño hace seis meses es justo lo que hace visible que cambió, y
//    perderlo sería perder lo único que mide que la empresa evolucionó.
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { ownerMemory } from "@jotapuntoce/db/schema";
import { findOwnerMembership } from "../auth/guard.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

export type OwnerMemoryRow = typeof ownerMemory.$inferSelect;

/**
 * La conversación de arranque: lo primero que Improvement le pregunta al dueño el día que recibe su
 * empresa digital.
 *
 * Una pregunta por cada verbo que define a un director: trabaja, piensa, ejecuta, idea, planea,
 * delega, dirige, visualiza. No son datos de la empresa — esos ya están en las áreas, los clientes y
 * los objetivos. Son datos de la PERSONA, que es lo que ningún formulario de alta captura y lo que
 * hace que el Director General de una empresa no sea intercambiable con el de otra.
 *
 * Genéricas a propósito: ninguna menciona un giro, una empresa ni un nombre. Este archivo es motor
 * (.claude/rules/motor-generico.md).
 */
export const ARRANQUE_QUESTIONS: { verbo: string; question: string }[] = [
  {
    verbo: "visualiza",
    question: "Descríbeme tu empresa dentro de tres años como si ya existiera. ¿Qué ves?",
  },
  {
    verbo: "trabaja",
    question: "¿Cómo es un día tuyo de trabajo, desde que llegas hasta que te vas?",
  },
  {
    verbo: "piensa",
    question: "¿Cuál ha sido la decisión más difícil que has tomado en tu negocio, y cómo la tomaste?",
  },
  {
    verbo: "ejecuta",
    question: "Cuando algo urge de verdad, ¿qué haces primero?",
  },
  {
    verbo: "idea",
    question: "¿De dónde te salen las ideas para tu negocio?",
  },
  {
    verbo: "planea",
    question: "¿Con cuánta anticipación planeas? ¿Por día, por semana, por mes, por año?",
  },
  {
    verbo: "delega",
    question: "¿Qué es lo único que todavía no le sueltas a nadie, y por qué?",
  },
  {
    verbo: "dirige",
    question: "¿Cómo te das cuenta de que alguien de tu equipo no está bien?",
  },
];

/**
 * Todo lo que Improvement ha aprendido del dueño de esta empresa, lo más reciente primero.
 *
 * El alcance se resuelve ADENTRO (convención de la casa): devuelve lista vacía a quien no sea el
 * dueño en vez de confiar en que la pantalla filtre.
 */
export async function listOwnerMemory(userId: string, orgId: string): Promise<OwnerMemoryRow[]> {
  if (!(await findOwnerMembership(userId, orgId))) return [];

  return db
    .select()
    .from(ownerMemory)
    .where(and(eq(ownerMemory.orgId, orgId), eq(ownerMemory.ownerId, userId)))
    .orderBy(desc(ownerMemory.createdAt));
}

/**
 * La siguiente pregunta de arranque que falta por contestar, o null si ya no falta ninguna.
 *
 * Una a la vez y no un cuestionario de ocho campos: esto es una conversación, y ocho cajas de texto
 * vacías se contestan con ocho frases de compromiso. Se compara contra el texto de la pregunta
 * porque es lo que quedó guardado — si un día se reescribe una, vuelve a preguntarse, que es lo
 * correcto: es una pregunta distinta.
 */
export function nextArranqueQuestion(
  answered: OwnerMemoryRow[],
): { verbo: string; question: string } | null {
  const hechas = new Set(answered.map((r) => r.question));
  return ARRANQUE_QUESTIONS.find((q) => !hechas.has(q.question)) ?? null;
}

const respuestaSchema = z.object({
  question: z.string().trim().min(1).nullable(),
  answer: z.string().trim().min(3, "Escríbeme aunque sea una línea."),
  topic: z.enum(["arranque", "observacion"]),
});

/**
 * Guarda lo que el dueño acaba de contarle a Improvement.
 *
 * Nunca actualiza una fila: siempre inserta. Si el dueño contesta otra vez la misma pregunta,
 * quedan las dos y la más reciente es la que manda al leer.
 */
export async function rememberAnswer(
  userId: string,
  orgId: string,
  input: unknown,
): Promise<Result<OwnerMemoryRow>> {
  if (!(await findOwnerMembership(userId, orgId))) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "Improvement solo aprende del dueño de la empresa." },
    };
  }

  const parsed = respuestaSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "Faltan datos.",
      },
    };
  }

  const [row] = await db
    .insert(ownerMemory)
    .values({ ...parsed.data, orgId, ownerId: userId })
    .returning();

  return row
    ? { ok: true, data: row }
    : { ok: false, error: { code: "DB_ERROR", message: "No se pudo guardar." } };
}

/**
 * Lo que Improvement sabe del dueño, en texto plano.
 *
 * Existe como función y no como plantilla dentro de una pantalla porque es el contrato de entrada
 * del Director General: el día que el diagnóstico, el revisor o las sugerencias necesiten saber
 * cómo piensa este dueño, leen esto y no arman su propia versión.
 *
 * Se queda con la respuesta MÁS RECIENTE de cada pregunta: la tabla es append-only justo para poder
 * ver el cambio, pero quien va a actuar necesita lo que el dueño piensa hoy.
 */
export function ownerBrief(rows: OwnerMemoryRow[]): string {
  const ultima = new Map<string, OwnerMemoryRow>();
  // Recorre de más viejo a más nuevo para que la última escritura gane.
  for (const row of [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    ultima.set(row.question ?? row.id, row);
  }

  return [...ultima.values()]
    .map((r) => (r.question ? `${r.question}\n${r.answer}` : r.answer))
    .join("\n\n");
}
