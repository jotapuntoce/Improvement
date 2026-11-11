// La entrevista del arranque y el primer análisis de Improvement.
//
// Dos bloques de preguntas, uno a la vez como pide el método (server/ai/knowledge.ts):
// - NEGOCIO (paso 1): cómo está consolidado, su proceso, quién lleva cada área y qué hace cada quien.
// - RESULTADO (paso 3): cómo quiere que funcione su ERP/CRM, qué quiere ver y cómo lo quiere ver.
// Las respuestas son memoria del dueño (owner_memory, topic 'arranque'): la burbuja ya la lee, así que
// desde el primer mensaje Improvement le habla con lo que contó. El análisis escribe lo que dedujo
// (topic 'observacion') y las necesidades (org_need) — sin tabla nueva.
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { orgNeed, organization, orgProfile, ownerMemory } from "@jotapuntoce/db/schema";
import { findOwnerMembership } from "../auth/guard.ts";
import { extractStructured, type SuggestionProvider } from "../ai/gateway.ts";
import { buildDiagnosticoPrompt, diagnosticoSchema, DIAGNOSTICO_SYSTEM_PROMPT } from "../ai/prompts/diagnostico.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
const fail = (message: string, code = "VALIDATION_ERROR") => ({ ok: false as const, error: { code, message } });

export interface InterviewQuestion { name: string; question: string; why?: string; placeholder?: string }

// Genéricas a propósito: ningún giro, empresa ni nombre (motor genérico).
export const NEGOCIO_QUESTIONS: InterviewQuestion[] = [
  { name: "consolidacion", question: "¿Cuánto tiempo lleva tu negocio y cómo está constituido?", why: "Solo tú, con socios, persona física o moral. Así sé qué se te exige y qué no.", placeholder: "Ej. 4 años, somos dos socios, persona moral…" },
  { name: "proceso", question: "Cuéntame el camino de un cliente: desde que te conoce hasta que le entregas y te vuelve a comprar.", why: "Ese camino es la columna de tu CRM.", placeholder: "Nos encuentran por…, cotizamos…, entregamos…" },
  { name: "areas", question: "¿Qué áreas tiene tu negocio y quién está a cargo de cada una?", why: "Ventas, operación, administración, compras… aunque varias las lleves tú.", placeholder: "Ventas: Laura · Operación: yo · Cobranza: nadie…" },
  { name: "roles", question: "¿Qué hace cada persona de tu equipo? ¿Quién es insustituible?", why: "Con esto armo los permisos y el agente de cada rol.", placeholder: "Pedro hace…, sin Laura no sale…" },
  { name: "ausencia", question: "Si faltas dos semanas, ¿qué se detiene?", why: "Lo que depende solo de ti es lo primero que hay que soltar." },
  { name: "herramientas", question: "¿Con qué llevas hoy tu negocio y qué te quita el sueño?", why: "Excel, libreta, WhatsApp, algún sistema… y el riesgo que más te preocupa." },
];

export const RESULTADO_QUESTIONS: InterviewQuestion[] = [
  { name: "primero", question: "Cuando abras Improvement en la mañana, ¿qué es lo primero que quieres ver?", why: "Esa es la pantalla de tu inicio.", placeholder: "Lo que vendimos ayer, lo que hay que cobrar…" },
  { name: "funcionamiento", question: "¿Cómo quieres que funcione tu ERP/CRM? ¿Qué te tiene que avisar y qué debe hacer solo?", why: "Yo hago el trabajo; tú me dices qué resultado esperas.", placeholder: "Avísame si un cliente no paga a 30 días…" },
  { name: "vista", question: "¿Cómo lo quieres ver en tus pantallas?", why: "Números grandes, listas, un tablero por etapas, un calendario… o lo que te imagines.", placeholder: "Un tablero por etapas con los montos…" },
];

const ALL = { negocio: NEGOCIO_QUESTIONS, resultado: RESULTADO_QUESTIONS };
export const RESUMEN_QUESTION = "Lo que veo de tu negocio";

/**
 * Guarda las respuestas de un bloque. Una respuesta vacía es una pregunta que el dueño se saltó: no se
 * guarda, y la burbuja la retomará después. Append-only como toda la memoria del dueño.
 */
export async function saveInterview(userId: string, orgId: string, block: keyof typeof ALL, input: Record<string, unknown>): Promise<Result<{ saved: number }>> {
  if (!(await findOwnerMembership(userId, orgId))) return fail("Improvement solo aprende del dueño de la empresa.", "FORBIDDEN");
  const rows: (typeof ownerMemory.$inferInsert)[] = [];
  for (const q of ALL[block]) {
    const answer = z.string().trim().max(2000).catch("").parse(input[q.name] ?? "");
    if (answer.length >= 2) rows.push({ orgId, ownerId: userId, question: q.question, answer, topic: "arranque" });
  }
  if (rows.length) await db.insert(ownerMemory).values(rows);
  return { ok: true, data: { saved: rows.length } };
}

/**
 * El primer análisis: Improvement lee lo que contó el dueño desde su conocimiento experto y deja sus
 * observaciones y las necesidades. Corre una sola vez por empresa — volver atrás y reenviar no duplica
 * necesidades; lo que siga lo aprende en la conversación.
 */
export async function analyzeBusiness(userId: string, orgId: string, provider?: SuggestionProvider): Promise<Result<{ needs: number }>> {
  if (!(await findOwnerMembership(userId, orgId))) return fail("Solo el dueño puede pedir el análisis.", "FORBIDDEN");
  const memoria = await db
    .select({ question: ownerMemory.question, answer: ownerMemory.answer, topic: ownerMemory.topic })
    .from(ownerMemory)
    .where(and(eq(ownerMemory.orgId, orgId), eq(ownerMemory.ownerId, userId)))
    .orderBy(desc(ownerMemory.createdAt));
  if (memoria.some((m) => m.topic === "observacion" && m.question === RESUMEN_QUESTION)) return { ok: true, data: { needs: 0 } };

  const [org] = await db
    .select({ name: organization.name, industry: organization.industry, teamSize: orgProfile.teamSize, city: orgProfile.city })
    .from(organization)
    .leftJoin(orgProfile, eq(orgProfile.orgId, organization.id))
    .where(eq(organization.id, orgId));
  if (!org) return fail("No encontré la empresa.", "NOT_FOUND");

  const r = await extractStructured({
    orgId,
    purpose: "diagnostico",
    system: DIAGNOSTICO_SYSTEM_PROMPT,
    prompt: buildDiagnosticoPrompt({
      negocio: { nombre: org.name, giro: org.industry, equipo: org.teamSize, ciudad: org.city },
      respuestas: memoria.filter((m) => m.topic === "arranque" && m.question).reverse().map((m) => ({ question: m.question!, answer: m.answer })),
    }),
    schema: diagnosticoSchema,
    maxTokens: 8000,
    provider,
  });
  if (!r.ok) return fail("Improvement no pudo analizar tu negocio ahora; lo hará en la conversación.", "AI_UNAVAILABLE");
  const d = r.data.parsed;

  await db.transaction(async (tx) => {
    await tx.insert(ownerMemory).values([
      { orgId, ownerId: userId, topic: "observacion", question: RESUMEN_QUESTION, answer: `${d.resumen}\n\nEtapa: ${d.etapa}${d.industrial ? " (industrial)" : ""}.\nSiguiente paso: ${d.siguientePaso}` },
      ...d.areas.map((a) => ({
        orgId, ownerId: userId, topic: "observacion",
        question: `Área: ${a.area}`,
        answer: `Lo que dijo: ${a.dijo || "—"}\nLo que no dijo pero se ve: ${a.seVe || "—"}\nLo que falta saber: ${a.faltaSaber || "—"}`,
      })),
    ]);
    if (d.necesidades.length) {
      await tx.insert(orgNeed).values(d.necesidades.map((n) => ({ orgId, title: n.titulo, detail: n.detalle || null, severity: n.severidad, source: n.fuente })));
    }
  });
  return { ok: true, data: { needs: d.necesidades.length } };
}

export interface Analisis { resumen: string; necesidades: { title: string; severity: number }[] }

/** Lo que Improvement ya vio, para mostrárselo al dueño. null si todavía no hay análisis. */
export async function loadAnalysis(userId: string, orgId: string): Promise<Analisis | null> {
  if (!(await findOwnerMembership(userId, orgId))) return null;
  const [resumen] = await db
    .select({ answer: ownerMemory.answer })
    .from(ownerMemory)
    .where(and(eq(ownerMemory.orgId, orgId), eq(ownerMemory.ownerId, userId), eq(ownerMemory.topic, "observacion"), eq(ownerMemory.question, RESUMEN_QUESTION)))
    .orderBy(desc(ownerMemory.createdAt))
    .limit(1);
  if (!resumen) return null;
  const necesidades = await db
    .select({ title: orgNeed.title, severity: orgNeed.severity })
    .from(orgNeed)
    .where(and(eq(orgNeed.orgId, orgId), inArray(orgNeed.status, ["abierta", "en_progreso"])))
    .orderBy(desc(orgNeed.severity), desc(orgNeed.createdAt))
    .limit(5);
  return { resumen: resumen.answer, necesidades };
}
