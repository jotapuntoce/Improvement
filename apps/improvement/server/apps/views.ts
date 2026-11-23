// Cómo se ve cada app: un catálogo de vistas que son configuración (tipo + campos que usa), nunca código
// por cliente. Improvement elige la de cada app con lo que el dueño contestó en el arranque
// ("¿Cómo lo quieres ver?"); el dueño la cambia después. Lo que aún no sabe construir lo anota como
// necesidad, para que el catálogo crezca con pedidos reales.
import { and, desc, eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { appModel, appStage, appView, orgNeed, ownerMemory } from "@jotapuntoce/db/schema";
import { findOwnerMembership } from "../auth/guard.ts";
import { listFields, type FieldDef } from "./fields.ts";
import { RESULTADO_QUESTIONS } from "../owner/diagnostico.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

export const VIEWS = ["lista", "kanban", "calendario", "numeros", "tabla"] as const;
export type ViewKind = (typeof VIEWS)[number];
export const VIEW_NAMES: Record<ViewKind, string> = { lista: "Lista", kanban: "Tarjetas", calendario: "Calendario", numeros: "Números", tabla: "Tabla" };

/** `columns`: los campos que usa la vista. calendario → [fecha]; numeros → [campo a sumar]; tabla → [agrupar por]. */
export interface ViewConfig { kind: ViewKind; columns: string[] }
export interface AppShape { stages: number; fields: Pick<FieldDef, "key" | "type">[] }

// Lo que un dueño dice cuando imagina cada vista. ponytail: palabras clave; con la llave de la IA, el
// modelo llena el mismo ViewConfig desde texto libre.
const SAYS: Record<ViewKind, RegExp> = {
  kanban: /tablero|etapa|tarjeta|kanban|columna|embudo|pipeline|proceso/i,
  calendario: /calendario|agenda|fecha|semana|\bmes\b|entregas?\b/i,
  numeros: /n[uú]mero|total|monto|cu[aá]nto|indicador|kpi|resumen|gr[aá]fic|dinero|ventas del/i,
  tabla: /tabla|agrupad|excel|hoja de c[aá]lculo|por servicio|por cliente/i,
  lista: /lista|rengl[oó]n|uno debajo/i,
};

/** La vista que sí se puede construir para esa app, o null si le falta lo que la vista necesita. */
export function buildable(kind: ViewKind, app: AppShape, columns: string[] = []): ViewConfig | null {
  const has = (key: string | undefined, types: string[]) => !!key && app.fields.some((f) => f.key === key && types.includes(f.type));
  const first = (types: string[]) => app.fields.find((f) => types.includes(f.type))?.key;
  switch (kind) {
    case "lista": return { kind, columns: [] };
    case "kanban": return app.stages >= 2 ? { kind, columns: [] } : null;
    case "calendario": {
      const key = has(columns[0], ["fecha"]) ? columns[0] : first(["fecha"]);
      return key ? { kind, columns: [key] } : null;
    }
    case "numeros": {
      const key = has(columns[0], ["dinero", "numero"]) ? columns[0] : first(["dinero", "numero"]);
      return { kind, columns: key ? [key] : [] };
    }
    case "tabla": {
      const key = has(columns[0], ["opcion"]) ? columns[0] : first(["opcion"]);
      return { kind, columns: key ? [key] : [] };
    }
  }
}

/** Lo que el dueño pidió, en el orden en que lo dijo. */
export function asked(text: string | undefined): ViewKind[] {
  if (!text?.trim()) return [];
  return VIEWS.map((k) => ({ k, at: text.search(SAYS[k]) })).filter((x) => x.at >= 0).sort((a, b) => a.at - b.at).map((x) => x.k);
}

/** La primera vista pedida que esa app puede mostrar. */
export function pickView(text: string | undefined, app: AppShape): ViewConfig | null {
  for (const k of asked(text)) {
    const v = buildable(k, app);
    if (v) return v;
  }
  return null;
}

/** Sin nada guardado: tarjetas si hay etapas, si no lista. */
export const fallback = (app: AppShape): ViewConfig => buildable("kanban", app) ?? { kind: "lista", columns: [] };

async function shapeOf(userId: string, orgId: string, appId: string, appKey: string): Promise<AppShape> {
  const [stages, fields] = await Promise.all([
    db.select({ key: appStage.key }).from(appStage).where(and(eq(appStage.orgId, orgId), eq(appStage.appId, appId))),
    listFields(userId, orgId, appKey),
  ]);
  return { stages: stages.length, fields };
}

/** La vista que abre la app: la de la URL si se puede, si no la guardada, si no el default. */
export async function resolveView(
  userId: string, orgId: string, app: { id: string; key: string }, requested?: string,
): Promise<{ view: ViewConfig; saved: ViewKind | null; options: ViewKind[] }> {
  const [shape, [row]] = await Promise.all([
    shapeOf(userId, orgId, app.id, app.key),
    db.select({ kind: appView.kind, columns: appView.columns }).from(appView)
      .where(and(eq(appView.orgId, orgId), eq(appView.appId, app.id), eq(appView.isDefault, true))).limit(1),
  ]);
  const saved = row && (VIEWS as readonly string[]).includes(row.kind) ? buildable(row.kind as ViewKind, shape, row.columns) : null;
  const wanted = (VIEWS as readonly string[]).includes(requested ?? "") ? buildable(requested as ViewKind, shape) : null;
  return {
    view: wanted ?? saved ?? fallback(shape),
    saved: saved?.kind ?? null,
    options: VIEWS.filter((k) => buildable(k, shape)),
  };
}

async function save(orgId: string, appId: string, view: ViewConfig) {
  // ponytail: una sola fila por app (la que abre); vistas guardadas con nombre cuando alguien las pida.
  await db.transaction(async (tx) => {
    await tx.delete(appView).where(and(eq(appView.orgId, orgId), eq(appView.appId, appId)));
    await tx.insert(appView).values({ orgId, appId, kind: view.kind, columns: view.columns, isDefault: true });
  });
}

/** El dueño deja una vista como la que abre esa app. */
export async function setDefaultView(userId: string, orgId: string, appKey: string, kind: string): Promise<Result<ViewConfig>> {
  if (!(await findOwnerMembership(userId, orgId))) return { ok: false, error: { code: "FORBIDDEN", message: "Solo el dueño cambia cómo abre una app." } };
  const [app] = await db.select({ id: appModel.id }).from(appModel).where(and(eq(appModel.orgId, orgId), eq(appModel.key, appKey)));
  const v = app && (VIEWS as readonly string[]).includes(kind) ? buildable(kind as ViewKind, await shapeOf(userId, orgId, app.id, appKey)) : null;
  if (!app || !v) return { ok: false, error: { code: "VALIDATION_ERROR", message: "Esa vista no se puede armar con esta app." } };
  await save(orgId, app.id, v);
  return { ok: true, data: v };
}

const VISTA_Q = RESULTADO_QUESTIONS.find((q) => q.name === "vista")!.question;

/**
 * Al cerrar el arranque: cada app prendida abre como el dueño dijo que la quiere ver. Si lo que
 * imaginó no se parece a nada del catálogo, queda como necesidad (una vez). Devuelve cuántas guardó.
 */
export async function applyOwnerViews(userId: string, orgId: string): Promise<number> {
  if (!(await findOwnerMembership(userId, orgId))) return 0;
  const [answer] = await db.select({ text: ownerMemory.answer }).from(ownerMemory)
    .where(and(eq(ownerMemory.orgId, orgId), eq(ownerMemory.ownerId, userId), eq(ownerMemory.topic, "arranque"), eq(ownerMemory.question, VISTA_Q)))
    .orderBy(desc(ownerMemory.createdAt)).limit(1);
  const text = answer?.text?.trim();
  if (!text) return 0;
  if (!asked(text).length) {
    const title = "Quiere ver sus pantallas de una forma que aún no sé armar";
    const [dup] = await db.select({ id: orgNeed.id }).from(orgNeed).where(and(eq(orgNeed.orgId, orgId), eq(orgNeed.title, title)));
    if (!dup) await db.insert(orgNeed).values({ orgId, title, detail: `Lo dijo así: "${text.slice(0, 400)}"`, severity: 2, source: "improvement" });
    return 0;
  }
  const apps = await db.select({ id: appModel.id, key: appModel.key }).from(appModel).where(and(eq(appModel.orgId, orgId), eq(appModel.enabled, true)));
  let n = 0;
  for (const app of apps) {
    const v = pickView(text, await shapeOf(userId, orgId, app.id, app.key));
    if (v) { await save(orgId, app.id, v); n++; }
  }
  return n;
}
