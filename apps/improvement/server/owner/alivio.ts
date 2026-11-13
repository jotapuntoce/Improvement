// El plan para quitarle carga al dueño, sin IA. Lo que le duele y lo que carga (DOLOR_QUESTIONS) se
// cruzan con un catálogo de jugadas: por cada carga, qué hace Improvement solo, a quién se le delega y
// la app con sus reglas que lo ejecuta. El dueño se queda con lo que no se delega (P10 del manual del
// Director General). Todo es catálogo + datos del dueño: nada por cliente.
// ponytail: palabras clave sobre sus respuestas; con la llave de la IA, el modelo elige las mismas
// jugadas leyendo su historia completa.
import { and, desc, eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { objective, orgNeed, ownerMemory } from "@jotapuntoce/db/schema";
import { findOwnerMembership } from "../auth/guard.ts";
import { INVENTARIO, type TemplateApp } from "../apps/templates.ts";
import { slugKey } from "../apps/custom.ts";
import { toKey } from "../apps/fields.ts";
import { createRule, setRuleStatus } from "../automations/rules.ts";
import { createObjective } from "../objectives/mutations.ts";
import { DOLOR_QUESTIONS } from "./diagnostico.ts";
import { lines, stageKeys } from "./estructura.ts";

type Answers = Partial<Record<string, string>>;

/** Una regla escrita contra nombres (etapa por posición, campo por etiqueta); se resuelve al crear la app. */
type Trigger = { type: "creado" } | { type: "etapa"; stage: number } | { type: "fecha"; field: string; days: number } | { type: "sin_actividad"; days: number };
type Action = { type: "tarea"; title: string; dueInDays?: number } | { type: "aviso"; text: string };
interface Regla { name: string; trigger: Trigger; action: Action }

export interface Jugada {
  key: string;
  label: string;
  says: RegExp;
  improvement: string;
  delega: string;
  app: TemplateApp;
  reglas: Regla[];
}

const SUC = "Sucursal";
const app = (name: string, group: string, stages: string[], fields: TemplateApp["fields"]): TemplateApp => ({ name, group, stages, fields });

export const JUGADAS: Jugada[] = [
  {
    key: "nomina", label: "Sueldos y nómina", says: /sueldo|n[oó]mina|salario|pagar a (mi|los) (gente|empleados)/i,
    improvement: "Te recuerdo la nómina 2 días antes y te la dejo lista para que solo la apruebes.",
    delega: "Quien lleve la administración: captura faltas, horas extra y adelantos.",
    app: app("Nómina", "Administración", ["Por revisar", "Aprobada", "Pagada"], [{ label: "Fecha de pago", type: "fecha" }, { label: "Monto", type: "dinero" }]),
    reglas: [{ name: "Nómina: revisar 2 días antes", trigger: { type: "fecha", field: "Fecha de pago", days: 2 }, action: { type: "tarea", title: "Revisar y aprobar la nómina — {titulo}" } }],
  },
  {
    key: "caja", label: "Finanzas y caja", says: /finanza|caja|dinero|corte|flujo|ganancia|utilidad|cuentas/i,
    improvement: "Cada sucursal cierra su corte del día; te aviso solo si hay diferencia o si nadie lo cerró.",
    delega: "El encargado de cada sucursal: hacer el corte diario.",
    app: app("Corte de caja", "Administración", ["Pendiente", "Cuadrado", "Con diferencia"], [{ label: "Fecha", type: "fecha" }, { label: "Venta del día", type: "dinero" }, { label: "Diferencia", type: "dinero" }]),
    reglas: [
      { name: "Corte con diferencia", trigger: { type: "etapa", stage: 2 }, action: { type: "aviso", text: "Corte con diferencia: {titulo}" } },
      { name: "Corte sin cerrar", trigger: { type: "sin_actividad", days: 1 }, action: { type: "aviso", text: "Corte sin cerrar desde ayer: {titulo}" } },
    ],
  },
  {
    key: "administracion", label: "Administración", says: /administra|renta|luz|impuesto|sat\b|pagos?\b|servicios|factura/i,
    improvement: "Renta, luz, impuestos y servicios: te aviso 3 días antes de cada vencimiento.",
    delega: "Tu contador o un administrador: pagar y guardar comprobantes.",
    app: app("Pagos y obligaciones", "Administración", ["Por pagar", "Pagado"], [{ label: "Fecha límite", type: "fecha" }, { label: "Monto", type: "dinero" }]),
    reglas: [{ name: "Pago por vencer", trigger: { type: "fecha", field: "Fecha límite", days: 3 }, action: { type: "tarea", title: "Pagar — {titulo}" } }],
  },
  {
    key: "proveedores", label: "Proveedores y compras", says: /proveedor|compra|pedido|insumo|surtir/i,
    improvement: "Cuando algo baja del mínimo te armo el pedido; tú o tu encargado solo lo mandan.",
    delega: "El encargado de compras o de cada sucursal.",
    app: app("Pedidos a proveedores", "Operación", ["Por pedir", "Pedido", "Recibido"], [{ label: "Proveedor", type: "texto" }, { label: "Monto", type: "dinero" }, { label: "Fecha de entrega", type: "fecha" }]),
    reglas: [
      { name: "Pedido nuevo", trigger: { type: "creado" }, action: { type: "tarea", title: "Mandar el pedido — {titulo}", dueInDays: 1 } },
      { name: "Hoy llega un pedido", trigger: { type: "fecha", field: "Fecha de entrega", days: 0 }, action: { type: "aviso", text: "Hoy llega: {titulo}" } },
    ],
  },
  {
    key: "inventario", label: "Inventario", says: /inventario|almac[eé]n|existencia|stock|merma/i,
    improvement: "Llevo existencias con su mínimo y punto de reorden; si algo baja, nace su pedido.",
    delega: "Quien recibe la mercancía: actualizar existencias.",
    app: INVENTARIO,
    // Con proveedores en el plan, lo que pasa a "Por pedir" abre su pedido (se agrega en wireRelief).
    reglas: [],
  },
  {
    key: "marketing", label: "Marketing y redes", says: /marketing|redes|publicidad|contenido|instagram|tiktok|facebook|clientes nuevos/i,
    improvement: "Llevo tu calendario de contenido y te recuerdo un día antes de cada publicación.",
    delega: "Alguien del equipo o una agencia: grabar y publicar.",
    app: app("Contenido", "Ventas", ["Idea", "Grabando", "Publicado"], [{ label: "Red", type: "opcion", options: ["Instagram", "TikTok", "Facebook", "WhatsApp"] }, { label: "Fecha de publicación", type: "fecha" }]),
    reglas: [{ name: "Publicación mañana", trigger: { type: "fecha", field: "Fecha de publicación", days: 1 }, action: { type: "tarea", title: "Grabar y publicar — {titulo}" } }],
  },
  {
    key: "rh", label: "RH y contratación", says: /\brh\b|recursos humanos|contrat|personal|vacante|rotaci[oó]n|faltan? (gente|cocinero|mesero)|renunci/i,
    improvement: "Llevo cada vacante de punta a punta y te digo qué sigue; la capacitación sale del manual.",
    delega: "El encargado de cada sucursal: primeras entrevistas.",
    app: app("Vacantes y personal", "Administración", ["Vacante", "Entrevistas", "Contratado", "Capacitación"], [{ label: "Puesto", type: "texto" }]),
    reglas: [
      { name: "Agendar entrevistas", trigger: { type: "etapa", stage: 1 }, action: { type: "tarea", title: "Agendar entrevistas — {titulo}", dueInDays: 2 } },
      { name: "Capacitar al nuevo", trigger: { type: "etapa", stage: 3 }, action: { type: "tarea", title: "Capacitar con el manual — {titulo}", dueInDays: 3 } },
    ],
  },
  {
    key: "operacion", label: "Operación diaria", says: /operaci[oó]n|abrir|cerrar|apertura|turno|limpieza|cocina/i,
    improvement: "Checklist de apertura y cierre por sucursal; te aviso solo si alguno no se hizo.",
    delega: "El encargado de turno.",
    app: app("Apertura y cierre", "Operación", ["Pendiente", "Hecho"], [{ label: "Fecha", type: "fecha" }]),
    reglas: [{ name: "Apertura o cierre sin hacer", trigger: { type: "sin_actividad", days: 1 }, action: { type: "aviso", text: "No se marcó como hecho: {titulo}" } }],
  },
  {
    key: "fuegos", label: "Apagar fuegos", says: /fuego|urgencia|imprevist|problema|queja|atenci[oó]n a clientes|todo yo|de todo/i,
    improvement: "Cada fuego se anota y lo atiende el encargado; te aviso solo si lleva un día sin resolverse. Los que se repiten se vuelven proceso.",
    delega: "El encargado de cada sucursal: atender el fuego y anotarlo.",
    app: app("Fuegos", "Operación", ["Reportado", "En atención", "Resuelto"], [{ label: "Qué pasó", type: "texto" }, { label: "Se repite", type: "si_no" }]),
    reglas: [{ name: "Fuego sin atender", trigger: { type: "sin_actividad", days: 1 }, action: { type: "aviso", text: "Fuego sin resolver desde ayer: {titulo}" } }],
  },
];

/** Lo que el Director General no delega (manual, P10). */
export const QUEDA_TU = ["El plan y las metas", "El dinero: precios, inversiones y préstamos", "Elegir y acompañar a tus encargados", "Revisar los números una vez por semana"];

/** "Centro\nCumbres" → nombres; "2" → Sucursal 1, Sucursal 2; "no" → ninguna. */
export function sucursales(text: string | undefined): string[] {
  const t = text?.trim() ?? "";
  if (!t || /^(no\b|nada|ninguna|solo una|una sola|n\/a)/i.test(t)) return [];
  const n = /^\d+$/.exec(t) ? Number(t) : 0;
  if (n) return n > 1 ? Array.from({ length: Math.min(n, 30) }, (_, i) => `Sucursal ${i + 1}`) : [];
  const names = lines(t).map((s) => s.slice(0, 60)).slice(0, 30);
  return names.length > 1 ? names : [];
}

export interface PlanAlivio {
  dolor: string | null;
  foco: string | null;
  jugadas: (Pick<Jugada, "key" | "label" | "improvement" | "delega"> & { duele: boolean })[];
  quedaTu: string[];
  apps: TemplateApp[];
}

/** Con varias sucursales, toda app lleva su campo Sucursal (una sola vez). */
export function withSucursal(t: TemplateApp, sucs: string[]): TemplateApp {
  if (!sucs.length || t.fields.some((f) => f.label === SUC)) return t;
  return { ...t, fields: [...t.fields, { label: SUC, type: "opcion", options: sucs }] };
}

/** "RH y contratación" → "RH y contratación"; "Sueldos y nómina" → "sueldos y nómina". Las siglas se quedan. */
const enFrase = (label: string) => label.split(" ").map((w) => (w.length > 1 && w === w.toUpperCase() ? w : w.toLowerCase())).join(" ");

/** El plan, de sus respuestas. Primero lo que más le duele. */
export function reliefPlan(a: Answers): PlanAlivio {
  const dolor = a.dolor?.trim() || null;
  // Solo lo que dijo que le duele o marcó; el último fuego solo enciende la jugada de fuegos.
  const fuego = !!a.fuego?.trim();
  const picked = JUGADAS
    .map((j) => ({ j, duele: !!dolor && j.says.test(dolor) }))
    .filter(({ j, duele }) => duele || j.says.test(a.cargas ?? "") || (fuego && j.key === "fuegos"))
    .sort((x, y) => Number(y.duele) - Number(x.duele));
  const sucs = sucursales(a.sucursales);
  const foco = a.foco?.trim() || null;
  return {
    dolor,
    foco,
    jugadas: picked.map(({ j, duele }) => ({ key: j.key, label: j.label, improvement: j.improvement, delega: j.delega, duele })),
    quedaTu: foco ? [`Tu foco: ${foco.slice(0, 120)}`, ...QUEDA_TU] : QUEDA_TU,
    apps: picked.map(({ j }) => ({ ...withSucursal(j.app, sucs), relief: j.key })),
  };
}

/** Sus respuestas más recientes de la conversación del dolor. */
export async function dolorOf(userId: string, orgId: string): Promise<Answers> {
  const rows = await db
    .select({ question: ownerMemory.question, answer: ownerMemory.answer })
    .from(ownerMemory)
    .where(and(eq(ownerMemory.orgId, orgId), eq(ownerMemory.ownerId, userId), eq(ownerMemory.topic, "arranque")))
    .orderBy(desc(ownerMemory.createdAt));
  const out: Answers = {};
  for (const q of DOLOR_QUESTIONS) out[q.name] = rows.find((r) => r.question === q.question)?.answer;
  return out;
}

export async function loadReliefPlan(userId: string, orgId: string): Promise<PlanAlivio | null> {
  if (!(await findOwnerMembership(userId, orgId))) return null;
  const plan = reliefPlan(await dolorOf(userId, orgId));
  return plan.dolor || plan.jugadas.length ? plan : null;
}

/**
 * Al contar su dolor: lo que conviene soltar queda como necesidad (lo que más duele, severidad 3) y su
 * foco como su meta principal. Idempotente por título. Solo el dueño.
 */
export async function prescribeRelief(userId: string, orgId: string): Promise<number> {
  if (!(await findOwnerMembership(userId, orgId))) return 0;
  const plan = reliefPlan(await dolorOf(userId, orgId));
  const have = new Set((await db.select({ title: orgNeed.title }).from(orgNeed).where(eq(orgNeed.orgId, orgId))).map((n) => n.title));
  const nuevas = plan.jugadas
    .map((j) => ({ orgId, title: `Soltar: ${enFrase(j.label)}`, detail: `${j.improvement} Delegar a: ${j.delega}`, severity: j.duele ? 3 : 2, source: "improvement" as const }))
    .filter((n) => !have.has(n.title));
  if (nuevas.length) await db.insert(orgNeed).values(nuevas);

  if (plan.foco) {
    const title = `Mi foco como director: ${plan.foco}`.slice(0, 200);
    const [dup] = await db.select({ id: objective.id }).from(objective).where(and(eq(objective.orgId, orgId), eq(objective.title, title)));
    if (!dup) {
      await createObjective(userId, orgId, {
        title, description: plan.dolor ? `Para dejar de cargar con: ${plan.dolor.slice(0, 1500)}` : null,
        impactWeight: 50, dueDate: new Date(Date.now() + 90 * 864e5), areaId: null, assignedEmployeeId: null, needId: null,
        kind: "non_ipa", evidenceType: "ninguna",
      });
    }
  }
  return nuevas.length;
}

/** Al aceptar la propuesta: enciende las reglas de cada jugada cuya app se acaba de crear (aunque la renombre). */
export async function wireRelief(userId: string, orgId: string, picks: TemplateApp[], created: string[]): Promise<number> {
  const keyOf = (pred: (p: TemplateApp) => boolean) => {
    const p = picks.find(pred);
    const k = p && slugKey(p.name);
    return k && created.includes(k) ? k : null;
  };
  const rules: unknown[] = [];
  for (const j of JUGADAS) {
    const appKey = keyOf((p) => p.relief === j.key);
    if (!appKey) continue;
    const stages = await stageKeys(orgId, appKey);
    for (const r of j.reglas) {
      const trigger = r.trigger.type === "etapa" ? { type: "etapa", to: stages[r.trigger.stage] }
        : r.trigger.type === "fecha" ? { type: "fecha", field: toKey(r.trigger.field), days: r.trigger.days }
        : r.trigger;
      const a = r.action;
      const action = a.type === "tarea" ? { type: "crear_tarea", assigneeId: userId, title: a.title, dueInDays: a.dueInDays }
        : { type: "avisar", userId, text: a.text, channel: "in_app" };
      rules.push({ name: r.name, appKey, trigger, actions: [action] });
    }
  }
  // Con inventario y proveedores: lo que pasa a "Por pedir" abre su pedido.
  const inv = keyOf((p) => p.relief === "inventario" || p.name === INVENTARIO.name);
  const ped = keyOf((p) => p.relief === "proveedores");
  if (inv && ped) {
    const porPedir = (await stageKeys(orgId, inv))[1];
    if (porPedir) rules.push({ name: "Se acaba → su pedido", appKey: inv, trigger: { type: "etapa", to: porPedir }, actions: [{ type: "crear_registro", app: ped, title: "{titulo}" }] });
  }
  let made = 0;
  for (const rule of rules) {
    const r = await createRule(userId, orgId, rule);
    if (r.ok && (await setRuleStatus(userId, orgId, r.data.id, "activa")).ok) made++;
  }
  return made;
}
