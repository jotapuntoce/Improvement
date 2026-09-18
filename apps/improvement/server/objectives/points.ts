// Única definición de cuántos puntos vale un objetivo en todo el repo (§9.6 del blueprint — la
// escena 3D y la lista de objetivos importan estas funciones, nunca reimplementan el cálculo).
//
// Módulo PURO: no toca base de datos. La fórmula se prueba sin una empresa de por medio.
//
// ───────────────────────────────────────────────────────────────────────────────────────────────
// La regla del negocio, antes que el código
//
// Hay dos clases de trabajo: IPA (Income Producing Activity — prospección, marketing, una cena con
// un cliente: toca el ingreso DIRECTO) y non-IPA (todo lo demás: documentar, ordenar, capacitar,
// cobrar, dar seguimiento).
//
// Un non-IPA NO vale menos por ser non-IPA. Nunca se le baja el multiplicador por su clase, y al
// empleado no se le enseña la etiqueta: hacer sentir que "tu trabajo no vale" es exactamente lo que
// este diseño tiene prohibido producir. La diferencia real es CUÁNDO se realiza el impacto:
//
//   - Un IPA lo realiza al completarse. Cobra completo en el momento.
//   - Un non-IPA lo realiza por acumulación, y por eso cobra en dos momentos:
//       1) al completarse, igual que cualquiera;
//       2) otra vez, después, cuando un IPA que atiende la MISMA necesidad se completa — ahí se
//          vuelve visible que ese trabajo indirecto fue el que lo habilitó (enablementPoints).
//     A eso se suma la repetición: hacer la misma clase de trabajo muchas veces es lo que la
//     convierte en un sistema, y el sistema es el que termina produciendo el ingreso.
//
// Y la regla que impide que el equipo solo haga tareas chiquitas: un objetivo que no atiende
// ninguna necesidad de la empresa cobra la mitad. Veinte PDFs que nadie pidió valen menos que un
// PDF que cierra algo que la empresa necesitaba para crecer. Qué necesita la empresa no lo decide
// quien ejecuta: vive en org_need, que es el diagnóstico.
// ───────────────────────────────────────────────────────────────────────────────────────────────

export const POINTS_PER_WEIGHT_POINT = 10;

/** Cuánto suma cada repetición anterior de la misma clase de trabajo. */
export const REPETITION_STEP = 0.05;
/** Techo de la repetición. Sin techo, el mes doce valdría el triple que el mes uno por pura inercia. */
export const REPETITION_CAP = 0.5;

/** Qué parte de un IPA se reparte entre los non-IPA que lo habilitaron. */
export const ENABLEMENT_SHARE = 0.5;

/** Un objetivo que no atiende ninguna necesidad de la empresa. Cuenta, pero no mueve nada. */
export const NO_NEED_FACTOR = 0.5;

/** Severidad de la necesidad (los patógenos) → cuánto urge atenderla. */
const SEVERITY_FACTOR: Record<number, number> = { 1: 1, 2: 1.25, 3: 1.5 };

export type ObjectiveKind = "ipa" | "non_ipa";

export interface ObjectiveScore {
  impactWeight: number;
  kind: ObjectiveKind;
  /** Severidad de la necesidad que atiende (1-3), o null si no atiende ninguna. */
  needSeverity: number | null;
  /**
   * Cuántos objetivos de la MISMA necesidad ya completó esta persona antes de este. Es "el volumen
   * de esa tarea": la repetición que convierte trabajo suelto en un sistema.
   */
  repetitions: number;
}

/** El peso que el dueño le puso, en puntos, sin ningún ajuste. */
export function basePoints(impactWeight: number): number {
  return impactWeight * POINTS_PER_WEIGHT_POINT;
}

/**
 * Los puntos que se escriben al ledger cuando ESTE objetivo se completa.
 *
 * base × necesidad × repetición. `kind` no entra en esta fórmula a propósito: los dos cobran igual
 * al completarse. Lo que un non-IPA cobra de más llega después, por enablementPoints().
 */
export function scoreObjective(o: ObjectiveScore): number {
  const need = o.needSeverity === null ? NO_NEED_FACTOR : (SEVERITY_FACTOR[o.needSeverity] ?? 1);
  const repetition = 1 + Math.min(Math.max(o.repetitions, 0) * REPETITION_STEP, REPETITION_CAP);
  return Math.round(basePoints(o.impactWeight) * need * repetition);
}

/**
 * Los puntos extra que cobra un non-IPA ya completado cuando, más tarde, un IPA de la misma
 * necesidad se completa: la prueba de que aquel trabajo indirecto habilitó este ingreso directo.
 *
 * Se REPARTE entre todos los non-IPA que atendieron esa necesidad — el habilitador no cobra más por
 * haber muchos, cobra su parte. Con cero habilitadores no hay nada que repartir: esta función nunca
 * inventa puntos de la nada.
 */
export function enablementPoints(ipaPoints: number, enablerCount: number): number {
  if (enablerCount <= 0) return 0;
  return Math.round((ipaPoints * ENABLEMENT_SHARE) / enablerCount);
}
