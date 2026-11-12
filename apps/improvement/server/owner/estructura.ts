// Lo que el dueño contó en el arranque, convertido en su Improvement — sin IA, con reglas:
// - Sus pantallas: el tablero de prospectos con SUS pasos, el de trabajos con SU proceso, e inventario
//   si lo maneja (apps propias, las mismas que crea a mano).
// - Su proceso conectado: cuando un prospecto llega a su último paso, su trabajo aparece en el primer
//   paso; y al entrar a cada paso se crea la tarea que el dueño dijo que se hace ahí.
// - Su estructura interna: lo que Improvement prescribe según la etapa (manual del Director General en
//   server/ai/knowledge.ts), como necesidades. Con la IA se afina encima; esto es el piso.
// Catálogo genérico: ningún giro, empresa ni persona por nombre (motor genérico).
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { appModel, appStage, organization, orgNeed, orgProfile, ownerMemory } from "@jotapuntoce/db/schema";
import { findOwnerMembership } from "../auth/guard.ts";
import { INVENTARIO, type TemplateApp } from "../apps/templates.ts";
import { slugKey } from "../apps/custom.ts";
import { createRule, setRuleStatus } from "../automations/rules.ts";
import { NEGOCIO_QUESTIONS } from "./diagnostico.ts";

type Answers = Partial<Record<string, string>>;

/** "Me escribe\nLe cotizo" o "Me escribe → le cotizo" o "a, b, c" → pasos limpios, sin repetir. */
export function lines(text: string | undefined): string[] {
  if (!text?.trim()) return [];
  let parts = text.split(/\r?\n|→|->|;/);
  if (parts.length === 1) parts = text.split(",");
  const clean = parts.map((p) => p.replace(/^\s*(\d+\s*[.)-]|[-*•·])\s*/, "").trim()).filter(Boolean);
  return [...new Set(clean)];
}

/** "Diseño: medir y mandar el plano" → paso "Diseño" con su tarea. */
export function step(line: string): { name: string; task: string | null } {
  const i = line.indexOf(":");
  if (i < 1) return { name: line.slice(0, 30), task: null };
  const task = line.slice(i + 1).trim();
  return { name: line.slice(0, i).trim().slice(0, 30), task: task || null };
}

const NO = /^(no\b|nada|ninguno|ninguna|n\/a)/i;
const NADIE = /^(nadie|ninguno|ninguna|no hay|sin\b|vac[ií]o|—|-$)/i;

/** Las respuestas más recientes del dueño a la entrevista del negocio, por nombre de pregunta. */
async function answersOf(userId: string, orgId: string): Promise<Answers> {
  const rows = await db
    .select({ question: ownerMemory.question, answer: ownerMemory.answer })
    .from(ownerMemory)
    .where(and(eq(ownerMemory.orgId, orgId), eq(ownerMemory.ownerId, userId), eq(ownerMemory.topic, "arranque")))
    .orderBy(desc(ownerMemory.createdAt));
  const out: Answers = {};
  for (const q of NEGOCIO_QUESTIONS) out[q.name] = rows.find((r) => r.question === q.question)?.answer;
  return out;
}

/** Sus pantallas, salidas de lo que contó. Van antes que las del giro en la propuesta. */
export function personalApps(a: Answers): TemplateApp[] {
  const apps: TemplateApp[] = [];
  const servicios = lines(a.servicios).map((s) => s.slice(0, 60)).slice(0, 30);
  const servicio = servicios.length
    ? { label: "Servicio", type: "opcion" as const, options: servicios }
    : { label: "Servicio", type: "texto" as const };

  // El último paso que dice el dueño es cuando ya es cliente (así se lo pregunta la entrevista).
  const pasos = lines(a.prospecto).map((l) => step(l).name).slice(0, 12);
  if (pasos.length) {
    apps.push({
      name: "Prospectos", group: "Ventas", role: "prospectos", stages: pasos,
      fields: [{ label: "Teléfono", type: "texto" }, servicio, { label: "Monto estimado", type: "dinero" }],
    });
  }

  const trabajo = lines(a.trabajo).map(step).slice(0, 12);
  if (trabajo.length) {
    apps.push({
      name: "Trabajos", group: "Operación", role: "trabajos", stages: trabajo.map((t) => t.name), tasks: trabajo.map((t) => t.task),
      fields: [servicio, { label: "Fecha de entrega", type: "fecha" }],
    });
  }

  if (a.inventario && !NO.test(a.inventario.trim())) apps.push(INVENTARIO);
  return apps;
}

/** La propuesta completa: lo suyo primero y luego lo del giro, sin repetir nombres. */
export async function proposalFor(userId: string, orgId: string, template: TemplateApp[]): Promise<TemplateApp[]> {
  const mine = personalApps(await answersOf(userId, orgId));
  const names = new Set(mine.map((m) => m.name));
  return [...mine, ...template.filter((t) => !names.has(t.name))];
}

async function stageKeys(orgId: string, appKey: string): Promise<string[]> {
  const rows = await db
    .select({ key: appStage.key })
    .from(appStage)
    .innerJoin(appModel, eq(appModel.id, appStage.appId))
    .where(and(eq(appStage.orgId, orgId), eq(appModel.key, appKey)))
    .orderBy(asc(appStage.position));
  return rows.map((r) => r.key);
}

/**
 * Conecta el proceso del dueño con reglas activas. Solo sobre apps recién creadas (`created`): volver a
 * pasar por el arranque no duplica reglas. Las tareas son del dueño hasta que arme su equipo.
 */
export async function wireProcess(userId: string, orgId: string, picks: TemplateApp[], created: string[]): Promise<number> {
  const keyOf = (role: TemplateApp["role"]) => {
    const app = picks.find((p) => p.role === role);
    const key = app && slugKey(app.name);
    return key && created.includes(key) ? { app, key } : null;
  };
  const prospectos = keyOf("prospectos");
  const trabajos = keyOf("trabajos");
  const rules: unknown[] = [];

  if (prospectos && trabajos) {
    const last = (await stageKeys(orgId, prospectos.key)).at(-1);
    if (last) {
      rules.push({
        name: "Cliente nuevo → su trabajo", appKey: prospectos.key, trigger: { type: "etapa", to: last },
        actions: [{ type: "crear_registro", app: trabajos.key, title: "{titulo}" }],
      });
    }
  }
  if (trabajos) {
    const keys = await stageKeys(orgId, trabajos.key);
    trabajos.app.tasks?.forEach((task, i) => {
      if (!task || !keys[i]) return;
      rules.push({
        // Un trabajo nace en su primer paso sin "moverse": esa tarea cuelga de "creado".
        name: `${trabajos.app.stages[i]}: ${task}`.slice(0, 80), appKey: trabajos.key, trigger: i === 0 ? { type: "creado" } : { type: "etapa", to: keys[i] },
        actions: [{ type: "crear_tarea", assigneeId: userId, title: `${task} — {titulo}`.slice(0, 160) }],
      });
    });
  }

  let made = 0;
  for (const rule of rules) {
    const r = await createRule(userId, orgId, rule);
    if (!r.ok) continue;
    // El dueño las dictó en su arranque: nacen activas, no en prueba.
    if ((await setRuleStatus(userId, orgId, r.data.id, "activa")).ok) made++;
  }
  return made;
}

// Lo que toda empresa necesita por dentro, encendido por etapa (manual del Director General, Paso 0):
// 0 nano · 1 micro · 2 pequeña en adelante. "industrial" e "inventario" son capas que se suman.
interface Pieza { title: string; detail: string; severity: 1 | 2 | 3; desde?: number; hasta?: number; capa?: "industrial" | "inventario" }
export const ESTRUCTURA: Pieza[] = [
  { title: "Caja diaria y margen real por servicio o producto", detail: "Saber cada día cuánto entra y sale, y cuánto deja cada venta después de merma, flete, comisión y descuentos.", severity: 3 },
  { title: "Plan de una página", detail: "De 3 a 7 metas, cada una con un solo responsable, un número y una fecha.", severity: 2 },
  { title: "Motor de clientes: contenido que traiga prospectos", detail: "Un mensaje claro de qué problema resuelves, contenido constante que cuente tu trabajo real y una meta diaria de mensajes y llamadas.", severity: 2 },
  { title: "Obligaciones fiscales y estrategia fiscal", detail: "Declaraciones, facturación y estrategia fiscal al día, revisadas con un experto.", severity: 2 },
  { title: "Revisión legal del negocio", detail: "Constitución, contratos con clientes y proveedores, permisos y aviso de privacidad.", severity: 1 },
  { title: "Innovación con dirección", detail: "Una mejora al mes, solo la que baja costo, sube calidad o protege la caja.", severity: 1 },
  { title: "Validar vendiendo antes de invertir", detail: "Vender primero en el canal más barato antes de gastar en local, equipo o inventario.", severity: 1, hasta: 0 },
  { title: "Corte de caja diario y pendientes críticos", detail: "Diez minutos al día, de pie.", severity: 2, desde: 1 },
  { title: "Junta semanal de revisión del plan", detail: "Día y hora fijos; cada meta en verde, amarillo o rojo.", severity: 2, desde: 1 },
  { title: "Manual de lo repetitivo", detail: "Lo que se hace igual cada vez, por escrito, para que no dependa de una sola persona.", severity: 2, desde: 1 },
  { title: "Presupuesto anual y flujo de efectivo a 13 semanas", detail: "Saber hoy si alcanza la caja dentro de tres meses.", severity: 2, desde: 2 },
  { title: "Permisos por rol y separación de funciones", detail: "Quien pide no aprueba, y quien paga no concilia.", severity: 2, desde: 2 },
  { title: "Seguridad, calidad y mantenimiento", detail: "Indicadores diarios de seguridad, calidad, costo, entrega y productividad, y mantenimiento preventivo.", severity: 3, capa: "industrial" },
  { title: "Existencias con mínimo y punto de reorden", detail: "Punto de reorden = consumo diario × días que tarda el proveedor + inventario de seguridad.", severity: 2, capa: "inventario" },
];

const ETAPA: Record<string, number> = { solo: 0, "2-5": 1, "6-20": 2, "21+": 2 };
const INDUSTRIAL = new Set(["manufactura", "construccion"]);

/** Lo que Improvement prescribe para esta empresa, sin IA. Puro: se prueba sin base. */
export function prescribe(org: { industry: string | null; teamSize: string | null }, a: Answers): { title: string; detail: string; severity: number }[] {
  const etapa = ETAPA[org.teamSize ?? ""] ?? 0;
  const capas = new Set<string>();
  if (org.industry && INDUSTRIAL.has(org.industry)) capas.add("industrial");
  if (a.inventario && !NO.test(a.inventario.trim())) capas.add("inventario");
  const out = ESTRUCTURA.filter((p) => (p.capa ? capas.has(p.capa) : etapa >= (p.desde ?? 0) && etapa <= (p.hasta ?? 9)))
    .map(({ title, detail, severity }) => ({ title, detail, severity }));

  // Lo que el dueño dijo y pesa: áreas sin nadie a cargo, y lo que se detiene si él falta.
  for (const l of lines(a.areas)) {
    const [area, quien] = l.split(/:|—| - /).map((s) => s.trim());
    if (area && quien && NADIE.test(quien)) out.push({ title: `Nadie lleva ${area.toLowerCase()}`.slice(0, 120), detail: `Lo dijiste así: «${l}».`, severity: 3 });
  }
  if (a.ausencia && !NO.test(a.ausencia.trim())) {
    out.push({ title: "Lo que depende solo de ti", detail: `Si faltas dos semanas: ${a.ausencia.slice(0, 500)}`, severity: 3 });
  }
  return out;
}

/** Escribe lo prescrito como necesidades. Idempotente por título: reenviar el arranque no duplica. */
export async function prescribeStructure(userId: string, orgId: string): Promise<number> {
  if (!(await findOwnerMembership(userId, orgId))) return 0;
  const [[org], a, existing] = await Promise.all([
    db.select({ industry: organization.industry, teamSize: orgProfile.teamSize }).from(organization).leftJoin(orgProfile, eq(orgProfile.orgId, organization.id)).where(eq(organization.id, orgId)),
    answersOf(userId, orgId),
    db.select({ title: orgNeed.title }).from(orgNeed).where(eq(orgNeed.orgId, orgId)),
  ]);
  if (!org) return 0;
  const have = new Set(existing.map((n) => n.title));
  const nuevas = prescribe(org, a).filter((p) => !have.has(p.title));
  if (nuevas.length) await db.insert(orgNeed).values(nuevas.map((n) => ({ orgId, title: n.title, detail: n.detail, severity: n.severity, source: "improvement" })));
  return nuevas.length;
}
