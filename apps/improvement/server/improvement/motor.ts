// El motor: cuándo corre el Director General y sobre qué ciclos.
//
// phases.ts sabe QUÉ hace cada fase. Este archivo sabe CUÁNDO: qué ciclos están vivos, cuáles
// tocan esta corrida, cuántos caben por pasada y qué hacer con los que llevan demasiado tiempo
// atorados. Separados para poder probar cada uno sin el otro.
//
// CRON Y NO WEBSOCKET (decisión de diseño #2 del plan). Un motor reactivo tendría que decidir, en
// cada escritura de cualquier tabla, si eso amerita mover un ciclo — y esa decisión es justo la
// que el modelo no debe tomar cien veces al día. Una vez al día es predecible, se puede
// presupuestar en llamadas de IA y se puede leer en un log.
//
// UNA FASE POR CICLO POR CORRIDA. Con el cron diario (el único que admite el plan de Vercel, ver
// commit 4a5a0d2), la propuesta tarda CUATRO días en llegarle al dueño: observa, infiere,
// analiza y propone, una por corrida. Esta frase decía "entre uno y dos días" y se escribió
// para un cron de seis horas que nunca pudo desplegarse. El botón "Avanza ya" corre el mismo
// advanceCycle y es lo que comprime esos días cuando el dueño no quiere esperar. Un motor que
// corriera las siete fases de golpe entregaría en diez segundos un análisis que nadie alcanzó a
// contrastar con la realidad.
//
// Este archivo es motor (.claude/rules/motor-generico.md): recorre las empresas que haya, sin
// mencionar ninguna.
import { and, asc, eq, lt, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { area, improvementCycle, improvementEvent } from "@jotapuntoce/db/schema";
import type { SuggestionProvider } from "../ai/gateway.ts";
import { findOwnerMembership } from "../auth/guard.ts";
import { belongsToOrg } from "../db/belongsToOrg.ts";
import { replyFromImprovement } from "./chat.ts";
import type { CycleRow } from "./context.ts";
import { advanceCycle, PHASE_LABEL, type AdvanceResult, type Phase } from "./phases.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

function fail(message: string, code = "VALIDATION_ERROR"): Result<never> {
  return { ok: false, error: { code, message } };
}

/**
 * Cuántos ciclos avanza una corrida, en TODAS las empresas juntas.
 *
 * Un tope y no "todos": cada avance es una llamada al proveedor, y cien empresas arrancando un
 * ciclo el mismo día no pueden vaciar el presupuesto de IA de una pasada. Lo que no alcanzó se
 * queda como está y lo toma la siguiente — mismo criterio que MAX_REVIEWS_PER_RUN en el revisor.
 */
const MAX_CICLOS_POR_CORRIDA = 25;

/**
 * A las cuántas semanas un ciclo atorado deja de ser paciencia y empieza a ser abandono.
 *
 * Es el riesgo "ciclo infinito" del plan. No se cierra solo: se le avisa al dueño UNA vez y el
 * ciclo sigue ahí. Cerrar por reloj una propuesta que el dueño todavía no lee sería borrarle una
 * decisión que es suya.
 */
const DIAS_PARA_AVISAR = 14;

export { PHASE_LABEL };
export type { Phase };

const nuevoCicloSchema = z.object({
  title: z.string().trim().min(3, "Ponle un título a esta vuelta.").max(160),
  description: z.string().trim().max(2000).nullable().optional(),
  areaId: z.uuid().nullable().optional(),
});

/**
 * Abre una vuelta nueva.
 *
 * Solo el dueño, y solo una abierta a la vez por empresa: dos ciclos vivos compiten por la
 * atención de la misma persona y por el mismo presupuesto de IA, y el segundo siempre acaba
 * ignorado. El día que una empresa tenga tres áreas grandes con problemas distintos, esto se
 * vuelve "una por área" y el límite se mueve aquí, en un solo lugar.
 */
export async function startCycle(
  userId: string,
  orgId: string,
  input: unknown,
): Promise<Result<CycleRow>> {
  if (!(await findOwnerMembership(userId, orgId))) {
    return fail("Solo el dueño abre una vuelta de mejora.", "FORBIDDEN");
  }

  const parsed = nuevoCicloSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Faltan datos.");
  const d = parsed.data;

  const abierto = await activeCycle(userId, orgId);
  if (abierto) return fail("Ya tienes una vuelta en curso. Ciérrala antes de abrir otra.", "CONFLICT");

  if (d.areaId && !(await belongsToOrg(area, d.areaId, orgId))) {
    return fail("Esa área no es de esta empresa.");
  }

  const [row] = await db
    .insert(improvementCycle)
    .values({
      orgId,
      ownerId: userId,
      areaId: d.areaId ?? null,
      title: d.title,
      description: d.description ?? null,
    })
    .returning();

  if (!row) return fail("No se pudo abrir la vuelta.", "DB_ERROR");

  await db.insert(improvementEvent).values({
    orgId,
    cycleId: row.id,
    type: "observacion",
    data: { title: row.title },
    triggeredBy: "dueno",
  });

  return { ok: true, data: row };
}

/** La vuelta viva de esta empresa, o null. */
export async function activeCycle(userId: string, orgId: string): Promise<CycleRow | null> {
  if (!(await findOwnerMembership(userId, orgId))) return null;

  const [row] = await db
    .select()
    .from(improvementCycle)
    .where(
      and(
        eq(improvementCycle.orgId, orgId),
        eq(improvementCycle.ownerId, userId),
        ne(improvementCycle.phase, "cerrado"),
      ),
    )
    .orderBy(asc(improvementCycle.createdAt))
    .limit(1);

  return row ?? null;
}

const decisionSchema = z.object({
  decision: z.enum(["acepto", "rechazo", "modificar"]),
  feedback: z.string().trim().max(2000).optional(),
});

/**
 * El dueño contesta la propuesta. Es la única fase que no mueve el motor.
 *
 * Las tres salidas, y por qué cada una va a donde va:
 *
 *  · acepto    → `decision`. El motor la recoge en la siguiente corrida, congela las métricas de
 *                "antes" y abre el experimento.
 *  · rechazo   → `cerrado`, con resultado `fallido`. Fallido y no "cancelado": una propuesta que
 *                el dueño no compró ES un fallo del Director General, y contarlo como neutral le
 *                escondería a la siguiente vuelta justo lo que tiene que aprender.
 *  · modificar → vuelve a `analisis` y BORRA la propuesta. Regenerarla sobre la anterior daría
 *                una variación de lo mismo; volviendo al análisis, el feedback del dueño entra al
 *                contexto y la propuesta se piensa de nuevo.
 *
 * El feedback se guarda siempre, incluso al aceptar: "ok pero hazlo en dos semanas, no en una" es
 * exactamente el tipo de cosa que la vuelta siguiente tiene que recordar.
 */
export async function decideCycle(
  userId: string,
  orgId: string,
  cycleId: string,
  input: unknown,
): Promise<Result<{ phase: Phase }>> {
  if (!(await findOwnerMembership(userId, orgId))) {
    return fail("Solo el dueño decide sobre una propuesta.", "FORBIDDEN");
  }

  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Datos inválidos.");
  const { decision, feedback } = parsed.data;

  const [cycle] = await db
    .select()
    .from(improvementCycle)
    .where(
      and(
        eq(improvementCycle.id, cycleId),
        eq(improvementCycle.orgId, orgId),
        eq(improvementCycle.ownerId, userId),
      ),
    )
    .limit(1);

  if (!cycle) return fail("Esa vuelta no existe en esta empresa.", "NOT_FOUND");
  if (cycle.phase !== "sugerencia") {
    return fail("Esta vuelta no está esperando una decisión tuya.", "CONFLICT");
  }
  if (!cycle.aiSuggestion) return fail("Improvement todavía no escribe su propuesta.", "CONFLICT");

  const destino: Phase =
    decision === "acepto" ? "decision" : decision === "rechazo" ? "cerrado" : "analisis";

  const ahora = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(improvementCycle)
      .set({
        phase: destino,
        ownerDecision: decision,
        ownerFeedback: feedback ?? null,
        ...(decision === "rechazo" ? { result: "fallido", closedAt: ahora } : {}),
        // Vuelta al análisis: la propuesta se borra para que emitSuggestion la escriba de nuevo
        // con el feedback ya en el contexto (su `where` exige ai_suggestion is null).
        ...(decision === "modificar" ? { aiSuggestion: null } : {}),
        updatedAt: ahora,
      })
      // Condicionado a seguir en `sugerencia`: dos pestañas abiertas no deciden dos veces.
      .where(and(eq(improvementCycle.id, cycleId), eq(improvementCycle.phase, "sugerencia")));

    await tx.insert(improvementEvent).values({
      orgId,
      cycleId,
      type: "decision",
      data: { decision, feedback: feedback ?? null },
      triggeredBy: "dueno",
    });
  });

  return { ok: true, data: { phase: destino } };
}

/**
 * Cierra una vuelta a mano, sin pasar por la medición.
 *
 * Existe porque la realidad interrumpe: se acabó el trimestre, el problema se resolvió solo, el
 * área que se iba a arreglar ya no existe. El resultado se marca `neutral` y el motivo queda en el
 * log — un cierre a mano no es un éxito ni un fracaso del Director General, y contarlo como
 * cualquiera de los dos ensuciaría la tasa de acierto que el dueño lee en Analytics.
 */
export async function closeCycle(
  userId: string,
  orgId: string,
  cycleId: string,
  motivo?: string,
): Promise<Result<true>> {
  if (!(await findOwnerMembership(userId, orgId))) {
    return fail("Solo el dueño cierra una vuelta.", "FORBIDDEN");
  }

  const ahora = new Date();
  const [row] = await db
    .update(improvementCycle)
    .set({ phase: "cerrado", result: "neutral", closedAt: ahora, updatedAt: ahora })
    .where(
      and(
        eq(improvementCycle.id, cycleId),
        eq(improvementCycle.orgId, orgId),
        eq(improvementCycle.ownerId, userId),
        ne(improvementCycle.phase, "cerrado"),
      ),
    )
    .returning({ id: improvementCycle.id });

  if (!row) return fail("Esa vuelta no existe o ya estaba cerrada.", "NOT_FOUND");

  await db.insert(improvementEvent).values({
    orgId,
    cycleId,
    type: "cerrado",
    data: { motivo: motivo ?? null, aMano: true },
    triggeredBy: "dueno",
  });

  return { ok: true, data: true };
}

export interface MotorRun {
  visitados: number;
  avanzados: number;
  avisados: number;
  detalle: AdvanceResult[];
}

/**
 * La corrida del motor: toma los ciclos vivos de TODAS las empresas y avanza cada uno una fase.
 *
 * Sin orgId de por medio, igual que el revisor: no corre en nombre de nadie ni desde una sesión,
 * lo dispara el cron (app/api/cron/ciclos/route.ts). El aislamiento entre empresas no se pierde —
 * cada ciclo solo lee y escribe lo suyo, y buildContext filtra por su propio orgId.
 *
 * No lanza nunca: si una empresa falla, se anota en el detalle y la corrida sigue con la
 * siguiente. Un error en una organización no puede dejar a las demás sin su vuelta.
 */
export async function processCycles(provider?: SuggestionProvider): Promise<MotorRun> {
  const vivos = await db
    .select()
    .from(improvementCycle)
    .where(ne(improvementCycle.phase, "cerrado"))
    // Los más viejos primero: si el tope corta, corta a los que ya se movieron hoy, no a los que
    // llevan más tiempo esperando.
    .orderBy(asc(improvementCycle.updatedAt))
    .limit(MAX_CICLOS_POR_CORRIDA);

  const detalle: AdvanceResult[] = [];
  let avanzados = 0;

  for (const cycle of vivos) {
    try {
      const r = await advanceCycle(cycle, provider);
      detalle.push(r);
      if (r.from !== r.to) avanzados++;
    } catch (err) {
      detalle.push({
        cycleId: cycle.id,
        from: cycle.phase as Phase,
        to: cycle.phase as Phase,
        reason: err instanceof Error ? err.message : "Error inesperado al avanzar el ciclo.",
      });
    }
  }

  const avisados = await avisarAtorados();
  return { visitados: vivos.length, avanzados, avisados, detalle };
}

/**
 * Le avisa al dueño de los ciclos que llevan demasiado tiempo en la misma fase.
 *
 * Una sola vez por atasco, no en cada corrida: el aviso se marca en el log del ciclo y la consulta
 * de abajo salta los que ya lo tienen. Un recordatorio en cada corrida se convierte en ruido, y el
 * ruido se ignora — que es lo contrario de avisar.
 */
async function avisarAtorados(): Promise<number> {
  const corte = new Date(Date.now() - DIAS_PARA_AVISAR * 86_400_000);

  const atorados = await db
    .select()
    .from(improvementCycle)
    .where(and(ne(improvementCycle.phase, "cerrado"), lt(improvementCycle.updatedAt, corte)))
    .limit(MAX_CICLOS_POR_CORRIDA);

  let avisados = 0;
  for (const c of atorados) {
    const [yaAvisado] = await db
      .select({ id: improvementEvent.id })
      .from(improvementEvent)
      .where(
        and(
          eq(improvementEvent.cycleId, c.id),
          eq(improvementEvent.type, c.phase as Phase),
          eq(improvementEvent.triggeredBy, "sistema"),
          sql`${improvementEvent.metadata} ->> 'aviso' = 'atorado'`,
        ),
      )
      .limit(1);
    if (yaAvisado) continue;

    await replyFromImprovement(
      c.orgId,
      c.ownerId,
      `La vuelta "${c.title}" lleva ${DIAS_PARA_AVISAR} días en "${PHASE_LABEL[c.phase as Phase]}". ` +
        "Si ya no aplica, ciérrala; si sigue viva, dime qué falta.",
      c.id,
    );
    await db.insert(improvementEvent).values({
      orgId: c.orgId,
      cycleId: c.id,
      type: c.phase as Phase,
      data: { dias: DIAS_PARA_AVISAR },
      metadata: { aviso: "atorado" },
      triggeredBy: "sistema",
    });
    avisados++;
  }

  return avisados;
}

/**
 * Empuja UNA vuelta a mano, desde el botón del dueño.
 *
 * El mismo `advanceCycle` que usa el cron — no una segunda implementación "para el botón". Si
 * fueran dos, en dos meses harían cosas distintas y nadie sabría cuál es la buena.
 */
export async function nudgeCycle(
  userId: string,
  orgId: string,
  cycleId: string,
  provider?: SuggestionProvider,
): Promise<Result<AdvanceResult>> {
  if (!(await findOwnerMembership(userId, orgId))) {
    return fail("Solo el dueño mueve su vuelta.", "FORBIDDEN");
  }

  const [cycle] = await db
    .select()
    .from(improvementCycle)
    .where(
      and(
        eq(improvementCycle.id, cycleId),
        eq(improvementCycle.orgId, orgId),
        eq(improvementCycle.ownerId, userId),
      ),
    )
    .limit(1);

  if (!cycle) return fail("Esa vuelta no existe en esta empresa.", "NOT_FOUND");
  return { ok: true, data: await advanceCycle(cycle, provider) };
}
