// Las siete fases, una por una: qué hace cada una, qué escribe y a cuál pasa.
//
// Vive aparte de motor.ts a propósito. Aquí está QUÉ hace cada fase; allá, CUÁNDO corre y sobre
// cuáles ciclos. Separadas, se puede probar el avance de una fase sin cron y probar el cron sin
// llamar al modelo — que es justo lo que hacen tests/improvement-motor.test.ts.
//
// LA REGLA QUE SOSTIENE TODO EL MOTOR: de `sugerencia` no se sale solo. El ciclo se queda ahí
// hasta que el dueño conteste, para siempre si hace falta. Un director que ejecuta sus propias
// propuestas sin preguntar no es un director, es un piloto automático — y el dueño dejaría de
// contarle cosas en cuanto la primera se le fuera de las manos.
//
// La otra regla: una fase que falla NO avanza el ciclo. Se queda donde estaba y la siguiente
// corrida la vuelve a tomar. Un ciclo que avanzara con la fase vacía llegaría a sugerencia sin
// haber observado nada.
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { improvementCycle, improvementEvent } from "@jotapuntoce/db/schema";
import type { SuggestionProvider } from "../ai/gateway.ts";
import { runDirectorPhase } from "../ai/gateway.ts";
import type { DirectorPhase } from "../ai/prompts/director.ts";
import { replyFromImprovement } from "./chat.ts";
import { buildContext, snapshotMetrics, type CycleRow } from "./context.ts";
import {
  createTasksFromSuggestion,
  cycleTasksSettled,
  tasksOfCycle,
} from "./delegation.ts";

export type Phase = CycleRow["phase"];

/**
 * Cuánto espera una vuelta a que el equipo cierre sus tareas antes de medir con lo que haya.
 *
 * Treinta y no catorce: a los catorce días de atasco el motor ya le avisa al dueño
 * (DIAS_PARA_AVISAR en motor.ts), y el plazo tiene que caer DESPUÉS del aviso para que el dueño
 * alcance a destrabarlo a mano antes de que el sistema mida por su cuenta. Medir con tareas
 * abiertas no es un fallo: la medición sabe decir "neutral" y "la raíz sigue viva".
 */
const DIAS_MAXIMOS_DE_EXPERIMENTO = 30;

/**
 * A dónde pasa cada fase cuando sale bien.
 *
 * `sugerencia` apunta a `decision` pero NADIE la avanza automáticamente: el motor se detiene ahí
 * (ver `advanceCycle`). Está en la tabla para que el orden de las siete quede escrito en un solo
 * lugar y la pantalla pueda dibujar la barra de progreso sin duplicarlo.
 */
export const SIGUIENTE: Record<Phase, Phase | null> = {
  observacion: "inferencia",
  inferencia: "analisis",
  analisis: "sugerencia",
  sugerencia: "decision",
  decision: "experimentacion",
  experimentacion: "medicion",
  medicion: "cerrado",
  cerrado: null,
};

export const PHASE_LABEL: Record<Phase, string> = {
  observacion: "Observando",
  inferencia: "Infiriendo la causa",
  analisis: "Analizando el impacto",
  sugerencia: "Esperando tu decisión",
  decision: "Decidido",
  experimentacion: "En curso",
  medicion: "Midiendo resultados",
  cerrado: "Cerrado",
};

/** Las fases que le tocan al modelo. Las otras tres las mueve el dueño o el reloj. */
const FASES_DE_MODELO = new Set<Phase>([
  "observacion",
  "inferencia",
  "analisis",
  "sugerencia",
  "medicion",
]);

export interface AdvanceResult {
  cycleId: string;
  from: Phase;
  to: Phase;
  /** Por qué no se movió, cuando no se movió. */
  reason?: string;
}

/** Deja constancia en el log del ciclo. Append-only: nunca se corrige una entrada vieja. */
async function log(
  cycle: CycleRow,
  type: Phase,
  data: Record<string, unknown>,
  triggeredBy: "sistema" | "dueno" | "empleado" = "sistema",
): Promise<void> {
  await db.insert(improvementEvent).values({
    orgId: cycle.orgId,
    cycleId: cycle.id,
    type,
    data,
    triggeredBy,
  });
}

/**
 * Avanza UN ciclo una sola fase.
 *
 * Una y no todas de corrido: cada fase es una llamada al modelo, y encadenar cinco en una pasada
 * convierte cada corrida del cron en cinco llamadas simultáneas por empresa. Además, entre fase y
 * fase el dueño puede escribir algo en el chat que cambie el contexto — y con la vuelta completa
 * de golpe, ese mensaje llegaría siempre tarde.
 *
 * Devuelve `from === to` cuando no hubo movimiento, con la razón. No lanza: una empresa cuya fase
 * falló no puede tumbar la corrida de las demás.
 */
export async function advanceCycle(
  cycle: CycleRow,
  provider?: SuggestionProvider,
): Promise<AdvanceResult> {
  const from = cycle.phase as Phase;
  const quieto = (reason: string): AdvanceResult => ({ cycleId: cycle.id, from, to: from, reason });

  if (from === "cerrado") return quieto("El ciclo ya está cerrado.");

  // ── Fase 6: EXPERIMENTACIÓN. No llama al modelo: es esperar. ────────────────────────────────
  // Pasa a medición cuando ya no queda ninguna tarea abierta. Si el experimento tenía fecha y ya
  // pasó, también pasa: medir tarde sirve más que un ciclo colgado para siempre esperando una
  // tarea que nadie va a cerrar.
  //
  // El plazo sale de `experimentEnd`, y si no lo hay, de `experimentStart` + el máximo. El
  // respaldo no es cortesía: durante meses `experimentEnd` se leía aquí pero no se escribía en
  // ningún lado, así que `vencido` era siempre falso — y una tarea nacida sin responsable (el
  // área que el modelo nombró no existía, o no tenía a nadie) se quedaba "sugerida" para
  // siempre, porque nadie más que su responsable puede contestarla. La vuelta nunca llegaba a
  // medición, y como solo puede haber una viva, la empresa no podía abrir otra. Las vueltas que
  // ya estaban atoradas así en la base no tienen `experimentEnd`; el respaldo es lo que las saca.
  if (from === "experimentacion") {
    const listas = await cycleTasksSettled(cycle.orgId, cycle.id);
    const inicio = cycle.experimentStart ?? cycle.updatedAt;
    const plazo =
      cycle.experimentEnd ?? new Date(inicio.getTime() + DIAS_MAXIMOS_DE_EXPERIMENTO * 86_400_000);
    const vencido = plazo.getTime() < Date.now();
    if (!listas && !vencido) return quieto("El equipo todavía trae tareas abiertas.");
    return mover(cycle, "medicion", {}, listas ? "tareas cerradas" : "se venció el plazo");
  }

  // ── Fase 5: DECISIÓN. Tampoco llama al modelo: el dueño ya contestó. ────────────────────────
  if (from === "decision") {
    if (cycle.ownerDecision !== "acepto") {
      return quieto("El dueño no aceptó, el ciclo se cierra por decisión (ver decideCycle).");
    }
    const antes = await snapshotMetrics(cycle.orgId);
    const inicio = new Date();
    return mover(
      cycle,
      "experimentacion",
      {
        experimentStart: inicio,
        // El plazo se escribe al entrar, no se calcula al salir: así queda en la fila y la
        // pantalla puede decirle al dueño hasta cuándo espera esta vuelta.
        experimentEnd: new Date(inicio.getTime() + DIAS_MAXIMOS_DE_EXPERIMENTO * 86_400_000),
        // La foto de "antes" se congela aquí a propósito, y es lo único del contexto que sí se
        // guarda: sin ella, la medición compararía el después contra el después.
        metrics: { ...(cycle.metrics as Record<string, unknown>), antes },
      },
      "el dueño aceptó",
    );
  }

  // ── Fase 4: SUGERENCIA. Emite una vez y después espera. ────────────────────────────────────
  //
  // Dos estados dentro de la misma fase, y por eso se distingue por `aiSuggestion` y no por otra
  // fase más: entrar a sugerencia (hay que generarla) y estar en sugerencia (ya está escrita, le
  // toca al dueño). Una octava fase para la espera contaría como avance algo que no lo es, y la
  // barra de progreso le mentiría al dueño.
  if (from === "sugerencia") {
    if (cycle.aiSuggestion) return quieto("Esperando la decisión del dueño.");
    return emitSuggestion(cycle, provider);
  }

  if (!FASES_DE_MODELO.has(from)) return quieto(`La fase ${from} no la mueve el motor.`);

  // ── Las fases que sí le tocan al modelo ─────────────────────────────────────────────────────
  const tareas = from === "medicion" ? await tasksOfCycle(cycle.orgId, cycle.id) : [];
  const context = await buildContext(
    cycle.ownerId,
    cycle.orgId,
    from as DirectorPhase,
    cycle,
    tareas,
  );

  const salida = await runDirectorPhase(cycle.orgId, { ...context, phase: from as DirectorPhase }, provider);
  if (!salida.ok) return quieto(salida.error.message);

  switch (from) {
    case "observacion": {
      const d = salida.data as {
        observation: string;
        impacto: string;
        aQuienLeDuele: string;
        tags: string[];
      };
      // El impacto y a quién le duele se apilan bajo la observación y no en columna propia: son
      // la definición del problema, no datos que nadie vaya a agrupar después — a diferencia de
      // la causa raíz. "A quién le duele" es la fase Definir de Six Sigma sin el vocabulario:
      // un problema que el cliente no siente produce mejoras que nadie afuera nota.
      const texto = `${d.observation}\n\nImpacto: ${d.impacto}\n\nA quién le duele: ${d.aQuienLeDuele}`;
      return mover(cycle, "inferencia", { observation: texto, tags: d.tags }, texto);
    }
    case "inferencia": {
      // La fase del método. Se guarda la cadena entera y no solo su conclusión: el dueño tiene
      // que poder discutir el ESLABÓN en el que no está de acuerdo, no solo el veredicto.
      const d = salida.data as {
        inference: string;
        porques: { pregunta: string; respuesta: string }[];
        causaRaiz: string;
        categoria: string;
        factoresContribuyentes: string[];
        evidencia: string;
      };
      return mover(
        cycle,
        "analisis",
        {
          inference: `${d.inference}\n\nEvidencia: ${d.evidencia}`,
          whys: d.porques,
          rootCause: d.causaRaiz,
          causeCategory: d.categoria,
          contributingFactors: d.factoresContribuyentes,
        },
        d.inference,
      );
    }
    case "analisis": {
      // Entra a `sugerencia` SIN sugerencia escrita: la genera la siguiente pasada, para no
      // encadenar dos llamadas al modelo en un mismo tick.
      const d = salida.data as {
        analysis: string;
        lineaBase: string;
        siNoSeCorrige: string;
        comoSeVerifica: string;
      };
      // La línea base encabeza el análisis a propósito: es el número contra el que la medición va
      // a comparar, y sin él cualquier resultado se puede contar como éxito.
      const texto = `Hoy estamos en: ${d.lineaBase}\n\n${d.analysis}\n\nSi no se corrige: ${d.siNoSeCorrige}`;
      // `verification` se escribe AQUÍ, antes de proponer nada: una vara elegida después de ver
      // el resultado siempre dice que salió bien.
      return mover(cycle, "sugerencia", { analysis: texto, verification: d.comoSeVerifica }, texto);
    }
    case "medicion": {
      const d = salida.data as {
        result: "exitoso" | "fallido" | "neutral";
        note: string;
        laRaizSigueViva: boolean;
        controlInstalado: boolean;
        learning: string;
      };
      const despues = await snapshotMetrics(cycle.orgId);
      const resultado = await mover(
        cycle,
        "cerrado",
        {
          result: d.result,
          metrics: { ...(cycle.metrics as Record<string, unknown>), despues },
          closedAt: new Date(),
          // El aprendizaje se apila en la descripción del ciclo cerrado: es lo que buildContext le
          // pasa a las vueltas siguientes para que no repitan lo que ya no funcionó.
          description:
            [
              cycle.description,
              // Que la raíz siguiera viva es el dato más útil para la vuelta siguiente, así que
              // se escribe donde buildContext lo va a leer, no solo en el chat.
              d.laRaizSigueViva
                ? `La causa raíz siguió viva: ${cycle.rootCause ?? "sin identificar"}`
                : null,
              // Una mejora que nadie sostiene vuelve, y cuando vuelve la vuelta siguiente tiene
              // que saber que el problema no es nuevo: es el mismo, sin control.
              !d.controlInstalado && cycle.controlPlan
                ? "La mejora quedó sin nada que la sostenga: no se instaló el control."
                : null,
              d.learning,
            ]
              .filter(Boolean)
              .join("\n\n") || null,
        },
        `${d.note}` +
          (d.laRaizSigueViva ? "\n\nOJO: la causa raíz sigue viva." : "") +
          (!d.controlInstalado && cycle.controlPlan
            ? "\n\nOJO: no quedó nadie a cargo de sostener esto. Va a volver."
            : "") +
          (d.learning ? `\n\nPara la próxima: ${d.learning}` : ""),
      );
      return resultado;
    }
  }

  return quieto("Fase sin transición definida.");
}

/**
 * Escribe la fase nueva y deja constancia. Condicionado a la fase ANTERIOR: si otra corrida del
 * cron se adelantó, esta no la pisa — mismo patrón que reviewObjective en gateway.ts.
 *
 * `mensaje` es lo que Improvement le dice al dueño en el chat. Solo se manda cuando hay algo que
 * decir: las transiciones mudas (entrar a experimentación, por ejemplo) no llenan el hilo de
 * avisos de sistema que nadie pidió. La fase de sugerencia sí habla, porque ahí el dueño tiene
 * que contestar.
 */
async function mover(
  cycle: CycleRow,
  to: Phase,
  campos: Partial<typeof improvementCycle.$inferInsert>,
  mensaje?: string,
): Promise<AdvanceResult> {
  const from = cycle.phase as Phase;

  const [row] = await db
    .update(improvementCycle)
    .set({ ...campos, phase: to, updatedAt: new Date() })
    .where(and(eq(improvementCycle.id, cycle.id), eq(improvementCycle.phase, from)))
    .returning({ id: improvementCycle.id });

  if (!row) {
    return { cycleId: cycle.id, from, to: from, reason: "Otra corrida ya movió este ciclo." };
  }

  await log(cycle, to, { desde: from, ...campos });
  if (mensaje && CONTESTA_EN_CHAT.has(to)) {
    await replyFromImprovement(cycle.orgId, cycle.ownerId, mensaje, cycle.id);
  }

  return { cycleId: cycle.id, from, to };
}

/** Las fases cuya entrada el dueño tiene que leer. Las demás avanzan en silencio. */
const CONTESTA_EN_CHAT = new Set<Phase>(["sugerencia", "cerrado"]);

/**
 * Escribe la propuesta del ciclo y crea sus tareas. El ciclo NO cambia de fase: sigue en
 * `sugerencia`, ahora esperando al dueño.
 *
 * Separada de `advanceCycle` porque es la única fase que escribe en otra tabla además del ciclo.
 * El `where` lleva `ai_suggestion is null`: si dos corridas del cron se cruzan, solo una escribe
 * y solo esa crea tareas — sin eso, el dueño vería la misma propuesta dos veces con dos juegos de
 * tareas duplicadas.
 */
export async function emitSuggestion(
  cycle: CycleRow,
  provider?: SuggestionProvider,
): Promise<AdvanceResult> {
  const from = cycle.phase as Phase;
  const quieto = (reason: string): AdvanceResult => ({ cycleId: cycle.id, from, to: from, reason });

  if (from !== "sugerencia") return quieto("La propuesta solo se escribe en la fase de sugerencia.");
  if (cycle.aiSuggestion) return quieto("Esta vuelta ya tiene propuesta.");

  const context = await buildContext(cycle.ownerId, cycle.orgId, "sugerencia", cycle);
  const salida = await runDirectorPhase(cycle.orgId, { ...context, phase: "sugerencia" }, provider);
  if (!salida.ok) return quieto(salida.error.message);

  const d = salida.data;
  const [row] = await db
    .update(improvementCycle)
    .set({
      aiSuggestion: d.suggestion,
      conviction: d.conviccion,
      // Lo que sostiene la mejora se guarda al proponer, no al medir: un plan de control escrito
      // después de ver el resultado es teatro, igual que una vara elegida a posteriori.
      controlPlan: d.comoSeSostiene,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(improvementCycle.id, cycle.id),
        eq(improvementCycle.phase, "sugerencia"),
        isNull(improvementCycle.aiSuggestion),
      ),
    )
    .returning({ id: improvementCycle.id });

  if (!row) return quieto("Otra corrida ya escribió la propuesta de este ciclo.");

  await createTasksFromSuggestion(cycle.orgId, cycle.id, d.tasks);
  await log(cycle, "sugerencia", {
    suggestion: d.suggestion,
    tareas: d.tasks.length,
    conviccion: d.conviccion,
  });
  // Su opinión sostenida va en el chat pegada a la propuesta, no en la propuesta misma: el dueño
  // tiene que poder leer QUÉ le propone y, aparte, qué cree que pasa si dice que no. Mezclarlas
  // convierte la propuesta en un argumento, y una propuesta que argumenta se lee como presión.
  await replyFromImprovement(cycle.orgId, cycle.ownerId, d.suggestion, cycle.id);
  await replyFromImprovement(
    cycle.orgId,
    cycle.ownerId,
    `Qué tan convencido estoy: ${d.conviccion}. Si me dices que no: ${d.siMeDicesQueNo}` +
      // Va pegado y no en un tercer mensaje: quién se queda a cargo es parte de lo que el dueño
      // está decidiendo, no un anexo que se lee después de haber dicho que sí.
      `\n\nPara que no se deshaga: ${d.comoSeSostiene}`,
    cycle.id,
  );

  // Se queda en `sugerencia`: lo que sigue lo decide el dueño, no el motor.
  return { cycleId: cycle.id, from, to: from };
}
