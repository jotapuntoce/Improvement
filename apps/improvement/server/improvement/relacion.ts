// Lo que el Director y el dueño llevan juntos.
//
// La diferencia entre un asistente y alguien que lleva tiempo contigo no es el tono, es que se
// acuerda. Este módulo saca esa memoria de las vueltas que YA están en la base — cuántas van,
// sobre qué vuelve a tropezar la empresa, qué le rechazaste y por qué, y dónde él se equivocó.
// Ninguna tabla nueva: si la relación necesitara su propio registro, sería una relación que
// escribimos a mano en vez de una que pasó.
//
// La parte más importante es `calibracion`. Un director que dice "en esta estoy seguro" solo vale
// si alguna vez dijo "en esta no", y si además puede mirar hacia atrás y ver que las veces que
// dijo "alta" acertó. Sin ese espejo, la convicción es una palabra que adorna.
//
// Motor genérico: recibe orgId por parámetro y no menciona ninguna empresa (no negociable #2).
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { improvementCycle } from "@jotapuntoce/db/schema";
import { CAUSE_CATEGORY_LABEL, type CauseCategory } from "../ai/prompts/director.ts";

/** Cuántas vueltas cerradas se miran hacia atrás para armar la relación. */
const VENTANA = 20;

export interface Relacion {
  /** Cuántas vueltas cerradas llevan juntos. 0 = es la primera, y eso se nota al hablar. */
  vueltas: number;
  /** Días desde la primera vuelta. null si todavía no hay ninguna cerrada. */
  diasJuntos: number | null;
  /** Las 6M que más se repiten, la más frecuente primero: "Métodos 7, Medición 2". */
  patron: { categoria: string; veces: number }[];
  /** Causas raíz que propuso y el dueño rechazó, con lo que el dueño contestó. */
  rechazadas: { causaRaiz: string; porQue: string | null }[];
  /** Vueltas que el dueño aceptó y aun así salieron mal, o donde la raíz siguió viva. */
  falloMio: { titulo: string; causaRaiz: string | null; conviccion: string | null }[];
  /** Cuántas veces dijo cada nivel de convicción y cuántas de esas acertó. */
  calibracion: { conviccion: string; dijo: number; acerto: number }[];
  /** Racha actual de vueltas exitosas (positivo) o fallidas (negativo). */
  racha: number;
}

export const RELACION_VACIA: Relacion = {
  vueltas: 0,
  diasJuntos: null,
  patron: [],
  rechazadas: [],
  falloMio: [],
  calibracion: [],
  racha: 0,
};

/**
 * Arma la relación a partir de las últimas vueltas cerradas.
 *
 * Una sola query: la pantalla de la burbuja abre en cada panel y el cron corre por cada empresa,
 * así que esto se ejecuta seguido. Todo lo demás son cuentas en memoria sobre 20 filas.
 */
export async function loadRelacion(orgId: string): Promise<Relacion> {
  const filas = await db
    .select({
      title: improvementCycle.title,
      rootCause: improvementCycle.rootCause,
      causeCategory: improvementCycle.causeCategory,
      conviction: improvementCycle.conviction,
      ownerDecision: improvementCycle.ownerDecision,
      ownerFeedback: improvementCycle.ownerFeedback,
      result: improvementCycle.result,
      closedAt: improvementCycle.closedAt,
    })
    .from(improvementCycle)
    .where(and(eq(improvementCycle.orgId, orgId), isNotNull(improvementCycle.closedAt)))
    .orderBy(desc(improvementCycle.closedAt))
    .limit(VENTANA);

  if (filas.length === 0) return RELACION_VACIA;

  return {
    vueltas: filas.length,
    diasJuntos: diasDesde(filas[filas.length - 1]?.closedAt ?? null),
    patron: contarCategorias(filas),
    rechazadas: filas
      .filter((f) => f.ownerDecision === "rechazo" && f.rootCause)
      .slice(0, 5)
      .map((f) => ({ causaRaiz: f.rootCause!, porQue: f.ownerFeedback })),
    // Aceptó y salió mal: eso no lo falló el dueño, lo falló él. Reconocerlo es la mitad de tener
    // criterio; la otra mitad es no sacarlo a relucir cada vez.
    falloMio: filas
      .filter((f) => f.ownerDecision === "acepto" && f.result === "fallido")
      .slice(0, 3)
      .map((f) => ({ titulo: f.title, causaRaiz: f.rootCause, conviccion: f.conviction })),
    calibracion: contarCalibracion(filas),
    racha: calcularRacha(filas),
  };
}

function diasDesde(fecha: Date | null): number | null {
  if (!fecha) return null;
  return Math.max(0, Math.floor((Date.now() - fecha.getTime()) / 86_400_000));
}

function contarCategorias(filas: { causeCategory: string | null }[]): Relacion["patron"] {
  const cuenta = new Map<string, number>();
  for (const f of filas) {
    if (!f.causeCategory) continue;
    // La etiqueta en palabras y no el slug: el prompt la lee un humano simulado, no un parser.
    const etiqueta = CAUSE_CATEGORY_LABEL[f.causeCategory as CauseCategory] ?? f.causeCategory;
    cuenta.set(etiqueta, (cuenta.get(etiqueta) ?? 0) + 1);
  }
  return [...cuenta.entries()]
    .map(([categoria, veces]) => ({ categoria, veces }))
    .sort((a, b) => b.veces - a.veces);
}

function contarCalibracion(
  filas: { conviction: string | null; result: string | null; ownerDecision: string | null }[],
): Relacion["calibracion"] {
  const cuenta = new Map<string, { dijo: number; acerto: number }>();
  for (const f of filas) {
    // Solo cuentan las que el dueño aceptó: una propuesta rechazada nunca se puso a prueba, y
    // contarla como fallo de calibración le enseñaría a proponer lo que se acepta fácil.
    if (!f.conviction || f.ownerDecision !== "acepto") continue;
    const actual = cuenta.get(f.conviction) ?? { dijo: 0, acerto: 0 };
    actual.dijo++;
    if (f.result === "exitoso") actual.acerto++;
    cuenta.set(f.conviction, actual);
  }
  return [...cuenta.entries()].map(([conviccion, v]) => ({ conviccion, ...v }));
}

/** Positivo: cuántas seguidas salieron bien. Negativo: cuántas seguidas salieron mal. */
function calcularRacha(filas: { result: string | null }[]): number {
  let racha = 0;
  for (const f of filas) {
    if (f.result === "exitoso") {
      if (racha < 0) break;
      racha++;
    } else if (f.result === "fallido") {
      if (racha > 0) break;
      racha--;
    } else {
      break; // Una neutral corta la racha sin contar para ningún lado.
    }
  }
  return racha;
}

/**
 * La relación en palabras, lista para meter en un prompt.
 *
 * Vive aquí y no en el prompt para que las dos bocas —el motor y la burbuja— cuenten la misma
 * historia. Devuelve cadena vacía cuando no hay historia: en la primera vuelta el Director no
 * tiene por qué fingir que se conocen.
 */
export function relacionEnPalabras(r: Relacion): string {
  if (r.vueltas === 0) return "";

  const partes: string[] = [
    `LO QUE LLEVAN JUNTOS. ${r.vueltas} ${r.vueltas === 1 ? "vuelta cerrada" : "vueltas cerradas"}` +
      (r.diasJuntos && r.diasJuntos > 30 ? `, la primera hace ${Math.round(r.diasJuntos / 30)} meses.` : "."),
  ];

  if (r.patron.length > 0) {
    const top = r.patron.slice(0, 3).map((p) => `${p.categoria} ${p.veces}`).join(", ");
    partes.push(
      `Dónde tropieza esta empresa: ${top}. Si lo que estás mirando hoy cae otra vez en la ` +
        `categoría de siempre, dilo — el patrón vale más que la vuelta suelta.`,
    );
  }

  if (r.rechazadas.length > 0) {
    const lista = r.rechazadas
      .map((x) => `"${x.causaRaiz}"${x.porQue ? ` (te dijo: ${x.porQue})` : ""}`)
      .join("; ");
    partes.push(
      `Causas que propusiste y NO te compró: ${lista}. No las vuelvas a proponer igual. Si sigues ` +
        `creyendo que es eso y algo cambió, dilo de frente reconociendo que ya lo habías traído.`,
    );
  }

  if (r.falloMio.length > 0) {
    const lista = r.falloMio
      .map((x) => `"${x.titulo}"${x.conviccion ? ` (dijiste convicción ${x.conviccion})` : ""}`)
      .join("; ");
    partes.push(
      `Donde te equivocaste tú: ${lista} — te las aceptó y no funcionaron. Si el tema se parece, ` +
        `recuérdalo una vez, sin disculparte de más y sin repetirlo cada vez.`,
    );
  }

  const cal = r.calibracion.find((c) => c.conviccion === "alta");
  if (cal && cal.dijo >= 3) {
    partes.push(
      `Tu calibración: dijiste convicción alta ${cal.dijo} veces y acertaste ${cal.acerto}. ` +
        (cal.acerto * 2 < cal.dijo
          ? "Estás sobrevendiendo tu seguridad. Baja el nivel salvo que de verdad tengas con qué."
          : "Tu 'alta' vale algo. No la gastes en cualquier cosa."),
    );
  }

  if (r.racha >= 3) {
    partes.push(
      `Llevas ${r.racha} vueltas seguidas funcionando. Eso compra crédito, no certeza — no te ` +
        `pongas a recetar.`,
    );
  } else if (r.racha <= -2) {
    partes.push(
      `Llevas ${Math.abs(r.racha)} vueltas seguidas sin dar. Reconócelo si viene al caso y sé más ` +
        `prudente con lo que prometes.`,
    );
  }

  return partes.join(" ");
}
