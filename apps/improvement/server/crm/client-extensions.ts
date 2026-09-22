// El CRM que Improvement lee, encima del CRM ligero que ya existía.
//
// server/clients/mutations.ts sigue siendo el CRUD de la pantalla de Clientes y no se toca: alta,
// baja, nombre, notas, semáforo. Lo que falta para que un Director General pueda opinar es el
// CONTEXTO — quién lleva la cuenta, cuándo se habló por última vez, cuánto vale, en qué etapa va y
// qué preocupa de ella. Eso vive aquí.
//
// Por qué un archivo aparte y no más funciones allá: la pantalla de Clientes no necesita nada de
// esto para funcionar, y el motor sí. Separados, cambiar el criterio de riesgo no toca el CRUD.
//
// Regla que este archivo NO rompe: el riesgo se calcula con umbrales, no con nombres. Ningún
// cliente, empresa ni giro aparece aquí (.claude/rules/motor-generico.md).
import { and, asc, desc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { area, client } from "@jotapuntoce/db/schema";
import { assertMembership, findOwnerMembership } from "../auth/guard.ts";
import { belongsToOrg } from "../db/belongsToOrg.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

function fail(message: string, code = "VALIDATION_ERROR"): Result<never> {
  return { ok: false, error: { code, message } };
}

export const DEAL_STAGES = [
  "prospecto",
  "calificado",
  "propuesta",
  "negociacion",
  "ganado",
  "perdido",
] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

export const DEAL_STAGE_LABEL: Record<DealStage, string> = {
  prospecto: "Prospecto",
  calificado: "Calificado",
  propuesta: "Propuesta enviada",
  negociacion: "En negociación",
  ganado: "Ganado",
  perdido: "Perdido",
};

/**
 * Los motivos por los que una cuenta preocupa. Catálogo cerrado y no texto libre: lo que va a leer
 * el motor tiene que poder agruparse entre ciclos ("de diez cuentas perdidas, siete traían
 * pago_tardio"), y con texto libre eso no se puede contar.
 */
export const RISK_FACTORS = [
  "sin_respuesta",
  "pago_tardio",
  "bajo_uso",
  "queja_abierta",
  "cambio_de_contacto",
  "competencia",
] as const;
export type RiskFactor = (typeof RISK_FACTORS)[number];

export const RISK_FACTOR_LABEL: Record<RiskFactor, string> = {
  sin_respuesta: "No contesta",
  pago_tardio: "Pago atrasado",
  bajo_uso: "Dejó de usarlo",
  queja_abierta: "Queja sin cerrar",
  cambio_de_contacto: "Cambió de contacto",
  competencia: "Está viendo a otro",
};

/**
 * A los cuántos días sin contacto una cuenta empieza a contar como abandonada.
 *
 * Una constante y no una columna de configuración: hasta que un dueño pida cambiarla, un valor
 * configurable es una perilla que nadie mueve y que hay que sostener para siempre. El día que
 * alguien la pida, se vuelve config de la organización y este comentario se borra.
 */
export const DIAS_SIN_CONTACTO_RIESGO = 21;

export interface ClientContext {
  id: string;
  name: string;
  healthStatus: string;
  notes: string | null;
  areaId: string | null;
  areaName: string | null;
  areaColor: string | null;
  lastContactAt: Date | null;
  nextFollowUpAt: Date | null;
  dealValue: string | null;
  dealStage: DealStage;
  riskFactors: string[];
  /** Días desde el último contacto, o null si nunca se registró uno. */
  diasSinContacto: number | null;
  /** Si esta cuenta debería estar en la lista de riesgo, y por qué. */
  enRiesgo: boolean;
  motivos: string[];
}

function diasDesde(fecha: Date | null, ahora: Date): number | null {
  if (!fecha) return null;
  return Math.floor((ahora.getTime() - fecha.getTime()) / 86_400_000);
}

/**
 * Por qué preocupa una cuenta, en texto que el dueño y el modelo leen igual.
 *
 * Tres señales y no una: el semáforo que alguien puso a mano, el silencio medido en días y el
 * seguimiento que ya se venció. Las tres por separado porque una cuenta puede estar marcada como
 * sana y llevar cuarenta días sin que nadie la llame — y ese es justo el caso que el semáforo solo
 * no detecta, porque nadie se acuerda de moverlo.
 */
export function motivosDeRiesgo(
  c: {
    healthStatus: string;
    lastContactAt: Date | null;
    nextFollowUpAt: Date | null;
    riskFactors: unknown;
  },
  ahora = new Date(),
): string[] {
  const motivos: string[] = [];

  if (c.healthStatus === "at_risk") motivos.push("Marcada en riesgo");

  const dias = diasDesde(c.lastContactAt, ahora);
  if (dias === null) motivos.push("Nunca se registró un contacto");
  else if (dias >= DIAS_SIN_CONTACTO_RIESGO) motivos.push(`${dias} días sin contacto`);

  if (c.nextFollowUpAt && c.nextFollowUpAt.getTime() < ahora.getTime()) {
    motivos.push("El seguimiento ya se venció");
  }

  // Los factores capturados a mano se suman, traducidos. Un valor viejo que ya no esté en el
  // catálogo se muestra tal cual en vez de desaparecer: el dueño lo escribió por algo.
  const factores = Array.isArray(c.riskFactors) ? c.riskFactors : [];
  for (const f of factores) {
    if (typeof f !== "string") continue;
    motivos.push(RISK_FACTOR_LABEL[f as RiskFactor] ?? f);
  }

  return motivos;
}

function toContext(
  r: {
    id: string;
    name: string;
    healthStatus: string;
    notes: string | null;
    areaId: string | null;
    areaName: string | null;
    areaColor: string | null;
    lastContactAt: Date | null;
    nextFollowUpAt: Date | null;
    dealValue: string | null;
    dealStage: string;
    riskFactors: unknown;
  },
  ahora: Date,
): ClientContext {
  const motivos = motivosDeRiesgo(r, ahora);
  return {
    ...r,
    dealStage: r.dealStage as DealStage,
    riskFactors: Array.isArray(r.riskFactors) ? (r.riskFactors as string[]) : [],
    diasSinContacto: diasDesde(r.lastContactAt, ahora),
    enRiesgo: motivos.length > 0,
    motivos,
  };
}

const COLUMNAS = {
  id: client.id,
  name: client.name,
  healthStatus: client.healthStatus,
  notes: client.notes,
  areaId: client.areaId,
  areaName: area.name,
  areaColor: area.color,
  lastContactAt: client.lastContactAt,
  nextFollowUpAt: client.nextFollowUpAt,
  dealValue: client.dealValue,
  dealStage: client.dealStage,
  riskFactors: client.riskFactors,
};

/**
 * La cartera con su contexto: área responsable, etapa, valor, silencio y riesgo ya calculado.
 *
 * El alcance se resuelve ADENTRO (assertMembership). Clientes es una sección de alcance `empresa`
 * únicamente (server/permissions/sections.ts), así que aquí no hay recorte por área — lo que sí
 * hay es el área RESPONSABLE de cada cuenta, que es dato y no permiso.
 */
export async function listClientContext(
  userId: string,
  orgId: string,
  opts: { areaId?: string | null; stage?: DealStage } = {},
): Promise<ClientContext[]> {
  await assertMembership(userId, orgId);
  const ahora = new Date();

  const conditions = [eq(client.orgId, orgId)];
  if (opts.areaId) conditions.push(eq(client.areaId, opts.areaId));
  if (opts.stage) conditions.push(eq(client.dealStage, opts.stage));

  const rows = await db
    .select(COLUMNAS)
    .from(client)
    .leftJoin(area, eq(area.id, client.areaId))
    .where(and(...conditions))
    .orderBy(desc(client.dealValue), asc(client.name));

  return rows.map((r) => toContext(r, ahora));
}

/**
 * Las cuentas que necesitan que alguien haga algo hoy.
 *
 * El corte se hace en SQL y no filtrando en memoria sobre toda la cartera: una empresa con mil
 * clientes no tiene por qué traerse mil filas para quedarse con ocho. El `enRiesgo` calculado
 * después coincide con este where por construcción — los tres términos son los mismos.
 */
export async function listClientsAtRisk(userId: string, orgId: string): Promise<ClientContext[]> {
  await assertMembership(userId, orgId);
  const ahora = new Date();
  const corte = new Date(ahora.getTime() - DIAS_SIN_CONTACTO_RIESGO * 86_400_000);

  const rows = await db
    .select(COLUMNAS)
    .from(client)
    .leftJoin(area, eq(area.id, client.areaId))
    .where(
      and(
        eq(client.orgId, orgId),
        // Las cuentas ya cerradas no son riesgo: una cuenta perdida no se recupera llamándola hoy,
        // y una ganada que no se ha tocado en un mes es normal.
        sql`${client.dealStage} not in ('ganado','perdido')`,
        or(
          eq(client.healthStatus, "at_risk"),
          isNull(client.lastContactAt),
          lte(client.lastContactAt, corte),
          lte(client.nextFollowUpAt, ahora),
          sql`jsonb_array_length(${client.riskFactors}) > 0`,
        ),
      ),
    )
    .orderBy(asc(client.lastContactAt), desc(client.dealValue));

  return rows.map((r) => toContext(r, ahora));
}

const contactoSchema = z.object({
  /** Qué se habló. Se apila en las notas del cliente, con fecha. */
  note: z.string().trim().min(3, "Escribe aunque sea una línea de qué se habló.").max(1000),
  /** Cuándo toca volver. null = todavía no se sabe. */
  nextFollowUpAt: z.coerce.date().nullable().optional(),
  healthStatus: z.enum(["healthy", "neutral", "at_risk"]).optional(),
});

/**
 * Registra que alguien habló con el cliente.
 *
 * Mueve `last_contact_at` a ahora y apila la nota — no la reemplaza. Un CRM que pisa la nota
 * anterior cada vez que alguien llama borra justo el historial por el que existe: la tercera
 * llamada sin respuesta solo se ve si las dos primeras siguen escritas.
 *
 * Cualquiera del equipo puede registrar un contacto, no solo el dueño: quien habló con el cliente
 * es quien sabe qué se dijo, y obligarlo a pedirle al dueño que lo capture garantiza que no se
 * capture.
 */
export async function registerContact(
  userId: string,
  orgId: string,
  clientId: string,
  input: unknown,
): Promise<Result<{ id: string; lastContactAt: Date }>> {
  await assertMembership(userId, orgId);

  const parsed = contactoSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Datos inválidos.");
  const { note, nextFollowUpAt, healthStatus } = parsed.data;

  const ahora = new Date();
  const sello = ahora.toISOString().slice(0, 10);
  const linea = `[${sello}] ${note}`;

  const [row] = await db
    .update(client)
    .set({
      lastContactAt: ahora,
      ...(nextFollowUpAt !== undefined ? { nextFollowUpAt } : {}),
      ...(healthStatus ? { healthStatus } : {}),
      // Apila arriba: lo último hablado es lo primero que alguien necesita leer.
      notes: sql`case when ${client.notes} is null or ${client.notes} = '' then ${linea} else ${linea} || E'\\n' || ${client.notes} end`,
      updatedAt: ahora,
    })
    .where(and(eq(client.id, clientId), eq(client.orgId, orgId)))
    .returning({ id: client.id, lastContactAt: client.lastContactAt });

  if (!row?.lastContactAt) return fail("Ese cliente no existe en esta empresa.", "NOT_FOUND");
  return { ok: true, data: { id: row.id, lastContactAt: row.lastContactAt } };
}

const contextoSchema = z.object({
  areaId: z.uuid().nullable().optional(),
  dealValue: z.coerce.number().min(0).nullable().optional(),
  dealStage: z.enum(DEAL_STAGES).optional(),
  riskFactors: z.array(z.enum(RISK_FACTORS)).optional(),
  nextFollowUpAt: z.coerce.date().nullable().optional(),
});

/**
 * Cambia el contexto comercial de una cuenta: quién la lleva, cuánto vale, en qué etapa va.
 *
 * Solo el dueño, a diferencia de registerContact: mover una cuenta a "ganado" o cambiarle el valor
 * es una decisión comercial, no el registro de una llamada.
 */
export async function updateClientContext(
  userId: string,
  orgId: string,
  clientId: string,
  input: unknown,
): Promise<Result<true>> {
  if (!(await findOwnerMembership(userId, orgId))) {
    return fail("Solo el dueño mueve la etapa o el valor de una cuenta.", "FORBIDDEN");
  }

  const parsed = contextoSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Datos inválidos.");
  const d = parsed.data;

  if (d.areaId && !(await belongsToOrg(area, d.areaId, orgId))) {
    return fail("Esa área no es de esta empresa.");
  }

  const [row] = await db
    .update(client)
    .set({
      ...(d.areaId !== undefined ? { areaId: d.areaId } : {}),
      ...(d.dealValue !== undefined
        ? { dealValue: d.dealValue === null ? null : d.dealValue.toFixed(2) }
        : {}),
      ...(d.dealStage ? { dealStage: d.dealStage } : {}),
      ...(d.riskFactors ? { riskFactors: d.riskFactors } : {}),
      ...(d.nextFollowUpAt !== undefined ? { nextFollowUpAt: d.nextFollowUpAt } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(client.id, clientId), eq(client.orgId, orgId)))
    .returning({ id: client.id });

  return row ? { ok: true, data: true } : fail("Ese cliente no existe en esta empresa.", "NOT_FOUND");
}
