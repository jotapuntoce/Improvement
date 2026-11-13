// El equipo y su agente. Dos caminos del registro:
// 1. El dueño, en el arranque, dice quién se encarga de qué (lo que delegó en su plan). Improvement
//    crea su tipo de permiso, su invitación y su agente con lo que le toca.
// 2. La persona, al aceptar, cuenta su trabajo y dónde se le atora. Improvement le dice en qué le
//    facilita el trabajo y su burbuja ya la conoce.
// Sin IA lee palabras clave (como alivio.ts); con la llave, la IA leerá las mismas respuestas.
import { and, asc, eq, isNull } from "drizzle-orm";
import { Resend } from "resend";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { agente, appModel, permissionType } from "@jotapuntoce/db/schema";
import { assertMembership, findOwnerMembership } from "../auth/guard.ts";
import { createInvitation } from "../invitations/mutations.ts";
import { JUGADAS, loadReliefPlan, sucursales, dolorOf } from "../owner/alivio.ts";
import type { InterviewQuestion } from "../owner/diagnostico.ts";
import { env } from "../../lib/env.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
const fail = (message: string, code = "VALIDATION_ERROR") => ({ ok: false as const, error: { code, message } });
const forbidden = fail("Solo el dueño arma su equipo.", "FORBIDDEN");

const POR_SUCURSAL = "Encargado de sucursal";

export interface Sugerida { puesto: string; sucursal: string | null; encargos: string[] }
export interface Equipo { apps: { key: string; name: string }[]; sugeridas: Sugerida[] }

/** Lo que el dueño delegó en su plan, agrupado por quién lo recibe; "cada sucursal" se abre por sucursal. */
export async function teamSuggestion(userId: string, orgId: string): Promise<Result<Equipo>> {
  if (!(await findOwnerMembership(userId, orgId))) return forbidden;
  const [plan, answers, apps] = await Promise.all([
    loadReliefPlan(userId, orgId),
    dolorOf(userId, orgId),
    db.select({ key: appModel.key, name: appModel.name }).from(appModel)
      .where(and(eq(appModel.orgId, orgId), eq(appModel.kind, "custom"))).orderBy(asc(appModel.position)),
  ]);
  const byName = new Map(apps.map((a) => [a.name.toLowerCase(), a.key]));
  const sucs = sucursales(answers.sucursales);
  const rows = new Map<string, Sugerida>();
  const add = (puesto: string, sucursal: string | null, key: string) => {
    const id = `${puesto}|${sucursal ?? ""}`;
    const r = rows.get(id) ?? { puesto, sucursal, encargos: [] };
    if (!r.encargos.includes(key)) r.encargos.push(key);
    rows.set(id, r);
  };
  for (const j of plan?.jugadas ?? []) {
    const jugada = JUGADAS.find((x) => x.key === j.key);
    const key = jugada && byName.get(jugada.app.name.toLowerCase());
    if (!jugada || !key) continue;
    if (jugada.puesto === POR_SUCURSAL && sucs.length) for (const s of sucs) add(`Encargado de ${s}`, s, key);
    else add(jugada.puesto, null, key);
  }
  return { ok: true, data: { apps, sugeridas: [...rows.values()] } };
}

const personaSchema = z.object({
  nombre: z.string().trim().min(2, "Escribe el nombre de cada persona."),
  email: z.email("Revisa el correo de cada persona.").transform((e) => e.toLowerCase()),
  puesto: z.string().trim().min(2).max(80),
  sucursal: z.string().trim().max(60).nullable(),
  encargos: z.array(z.string()).max(40),
});

export interface Invitado { nombre: string; email: string; link: string; enviado: boolean }

/** Lo que ve cada persona del equipo: sus apps, sus objetivos y lo que estorba de lo suyo. */
const GRANTS = { aplicaciones: "empresa", objetivos: "propio", issues: "propio" } as const;

/** Por cada persona: su tipo de permiso, su invitación (por correo si hay Resend) y su agente. */
export async function inviteTeam(userId: string, orgId: string, input: unknown, origin: string): Promise<Result<Invitado[]>> {
  if (!(await findOwnerMembership(userId, orgId))) return forbidden;
  const parsed = z.array(personaSchema).max(30).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisa los datos del equipo.");
  const valid = new Set((await db.select({ key: appModel.key }).from(appModel).where(eq(appModel.orgId, orgId))).map((a) => a.key));
  const out: Invitado[] = [];
  for (const p of parsed.data) {
    const name = `Equipo: ${p.puesto}`.slice(0, 80);
    const [tipo] = await db.insert(permissionType).values({ orgId, name, grants: GRANTS })
      .onConflictDoUpdate({ target: [permissionType.orgId, permissionType.name], set: { grants: GRANTS } })
      .returning({ id: permissionType.id });
    const inv = await createInvitation(userId, orgId, p.email, tipo!.id);
    if (!inv.ok) return inv;
    const values = { nombre: p.nombre, puesto: p.puesto, sucursal: p.sucursal, encargos: p.encargos.filter((k) => valid.has(k)) };
    await db.insert(agente).values({ orgId, email: p.email, ...values })
      .onConflictDoUpdate({ target: [agente.orgId, agente.email], set: { ...values, updatedAt: new Date() } });
    const link = `${origin}/invitacion/${inv.data.token}`;
    out.push({ nombre: p.nombre, email: p.email, link, enviado: await sendInvite(p.nombre, p.email, p.puesto, link) });
  }
  return { ok: true, data: out };
}

async function sendInvite(nombre: string, email: string, puesto: string, link: string): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false;
  try {
    const r = await new Resend(env.RESEND_API_KEY).emails.send({
      from: "Improvement <improvement@jotapuntoce.com>",
      to: email,
      subject: `${nombre.split(" ")[0]}, tu agente de Improvement te espera`,
      text: `Hola ${nombre}:\n\nTe invitaron a Improvement como ${puesto}. Ahí tienes un agente hecho para tu trabajo: te dice qué toca hoy y te quita lo que se repite.\n\nEntra aquí (vale 7 días): ${link}\n\nImprovement`,
    });
    return !r.error;
  } catch {
    return false;
  }
}

// Conocer el trabajo de la persona: lo que hace, lo que repite y dónde se le atora.
export const EMPLEADO_QUESTIONS: InterviewQuestion[] = [
  { name: "trabajo", question: "Cuéntame tu trabajo: ¿qué haces en un día normal?", why: "Con esto tu agente sabe qué es lo tuyo.", placeholder: "Abro la sucursal, reviso que haya de todo, cobro, hago el corte…" },
  { name: "repite", question: "¿Qué haces que se repite cada día o cada semana?", placeholder: "El corte, el pedido de los martes, el reporte al dueño…" },
  { name: "friccion", question: "¿Dónde se te atora tu trabajo? ¿Qué es lo más pesado o lo que más tiempo te quita?", why: "Por aquí empiezo a ayudarte.", placeholder: "Cuadrar la caja, esperar a que me autoricen, que me pidan todo por WhatsApp…" },
  { name: "espera", question: "¿Qué esperas de otros para poder avanzar?", placeholder: "Que el dueño apruebe, que el proveedor llegue…" },
  { name: "herramientas", question: "¿Con qué trabajas hoy?", placeholder: "WhatsApp, una libreta, Excel…" },
  { name: "ayuda", question: "Si tuvieras un asistente, ¿qué le pedirías primero?", placeholder: "Que me recuerde los pedidos…" },
];

export interface MiAgente {
  nombre: string;
  puesto: string;
  sucursal: string | null;
  apps: { key: string; name: string }[];
  respuestas: Record<string, string>;
  conocido: boolean;
}

export async function loadMiAgente(userId: string, orgId: string): Promise<MiAgente | null> {
  await assertMembership(userId, orgId);
  const [a] = await db.select().from(agente).where(and(eq(agente.orgId, orgId), eq(agente.userId, userId)));
  if (!a) return null;
  const apps = a.encargos.length
    ? (await db.select({ key: appModel.key, name: appModel.name }).from(appModel).where(eq(appModel.orgId, orgId))).filter((x) => a.encargos.includes(x.key))
    : [];
  return { nombre: a.nombre, puesto: a.puesto, sucursal: a.sucursal, apps, respuestas: a.respuestas, conocido: Object.keys(a.respuestas).length > 0 };
}

export async function saveConocerte(userId: string, orgId: string, input: Record<string, unknown>): Promise<Result<{ saved: number }>> {
  await assertMembership(userId, orgId);
  const respuestas: Record<string, string> = {};
  for (const q of EMPLEADO_QUESTIONS) {
    const v = z.string().trim().max(2000).catch("").parse(input[q.name] ?? "");
    if (v.length >= 2) respuestas[q.name] = v;
  }
  // Aunque salte todo, ya lo conoció: no se le vuelve a preguntar al entrar.
  if (!Object.keys(respuestas).length) respuestas.trabajo = "(no contó)";
  const r = await db.update(agente).set({ respuestas, updatedAt: new Date() })
    .where(and(eq(agente.orgId, orgId), eq(agente.userId, userId))).returning({ id: agente.id });
  return r.length ? { ok: true, data: { saved: Object.keys(respuestas).length } } : fail("No encontré tu agente.", "NOT_FOUND");
}

// En qué le facilita Improvement el trabajo, según lo que contó. Primero lo que se le atora.
const FACILITA: { says: RegExp; ayuda: string }[] = [
  { says: /repit|repet|siempre lo mismo|cada d[ií]a|cada semana|diario/i, ayuda: "Lo que repites lo vuelvo una lista con recordatorio: tú solo marcas que quedó." },
  { says: /excel|libreta|papel|cuaderno|hoja/i, ayuda: "Lo que llevas en Excel o en libreta vive en tus apps: se captura una vez y el dueño lo ve sin pedírtelo." },
  { says: /whats|mensaje|llamad|me piden/i, ayuda: "Lo que te piden por WhatsApp lo apuntas en la burbuja y queda como tarea: ya no se pierde en el chat." },
  { says: /esper|aprob|autoriz|due[ñn]o|jefe|permiso/i, ayuda: "Lo que esperas de alguien se vuelve su tarea con fecha; te aviso cuando lo resuelva." },
  { says: /olvid|se me pasa|record|fecha/i, ayuda: "Te recuerdo antes de cada fecha: pagos, pedidos, cortes y entregas." },
  { says: /caja|corte|cuadr|dinero|cobr|diferencia/i, ayuda: "El corte se captura en un minuto; si no cuadra, el aviso al dueño lo mando yo." },
  { says: /pedido|proveedor|se acab|falta|surtir|inventario/i, ayuda: "Cuando algo se acaba lo mueves a \"Por pedir\" y el pedido se arma solo." },
  { says: /fuego|queja|problema|urgen|imprevist/i, ayuda: "Cada fuego se anota en un minuto y queda quién lo atiende; si se repite, se vuelve proceso." },
  { says: /turno|falt[oó]|personal|horario|cubrir/i, ayuda: "Los turnos y las faltas quedan anotados; el dueño se entera sin que tengas que buscarlo." },
  { says: /report|inform|avisar al|cuentas al/i, ayuda: "El reporte al dueño sale solo de lo que capturas: ya no lo armas aparte." },
];

/** Lo que Improvement le dice a la persona: en qué le facilita el trabajo. */
export function helpFor(r: Record<string, string>): string[] {
  const atora = `${r.friccion ?? ""}\n${r.ayuda ?? ""}`;
  const resto = Object.values(r).join("\n");
  const first = FACILITA.filter((f) => f.says.test(atora));
  const then = FACILITA.filter((f) => !first.includes(f) && f.says.test(resto));
  const all = [...first, ...then].map((f) => f.ayuda);
  return all.length ? all.slice(0, 6) : ["Cuéntame en la burbuja lo que se te atore y lo vuelvo tarea, recordatorio o proceso."];
}

/** Para la burbuja: quién es, qué le toca y dónde se le atora. */
export function agenteBrief(a: MiAgente): string {
  const r = a.respuestas;
  return [
    `Puesto: ${a.puesto}${a.sucursal ? ` (${a.sucursal})` : ""}`,
    a.apps.length ? `Se encarga de: ${a.apps.map((x) => x.name).join(", ")}` : null,
    r.trabajo ? `Su trabajo: ${r.trabajo}` : null,
    r.friccion ? `Dónde se le atora: ${r.friccion}` : null,
    r.espera ? `Espera de otros: ${r.espera}` : null,
    r.herramientas ? `Trabaja con: ${r.herramientas}` : null,
    r.ayuda ? `Lo primero que pediría: ${r.ayuda}` : null,
  ].filter(Boolean).join("\n");
}
