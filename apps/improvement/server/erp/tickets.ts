// Postventa: los tickets de lo que pasa después de entregar, bajo la sección `postventa`. Los lee quien la
// tenga; abrir, mover y calificar es del dueño o de quien la tenga en `empresa`. Resuelto ⇔ resolved_at,
// y la satisfacción solo se califica resuelto — la base lo hace cumplir.
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { client, project, ticket, TICKET_STATUSES } from "@jotapuntoce/db/schema";
import { resolveSection } from "../auth/guard.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

function fail(message: string, code = "VALIDATION_ERROR"): Result<never> {
  return { ok: false, error: { code, message } };
}

export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type TicketRow = typeof ticket.$inferSelect;

const isUuid = (id: unknown): id is string => z.uuid().safeParse(id).success;

const openTicketSchema = z.object({
  clientId: z.uuid("Elige un cliente."),
  projectId: z.uuid().nullable(),
  title: z.string().trim().min(3, "El ticket lleva un título de al menos 3 letras.").max(160),
  detail: z.string().trim().max(2000, "El detalle va hasta 2000 caracteres.").nullable(),
  severity: z.coerce.number().int().min(1, "La severidad va de 1 a 3.").max(3, "La severidad va de 1 a 3."),
});

async function canWrite(userId: string, orgId: string) {
  return (await resolveSection(userId, orgId, "postventa")).scope === "empresa";
}

/** Abre un ticket en `abierto`. El cliente y el proyecto (si viene) tienen que ser de esta empresa. */
export async function openTicket(userId: string, orgId: string, input: unknown): Promise<Result<TicketRow>> {
  if (!(await canWrite(userId, orgId))) return fail("No puedes abrir tickets.", "FORBIDDEN");
  const parsed = openTicketSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Datos inválidos.");
  const data = parsed.data;

  const [owned] = await db
    .select({ id: client.id })
    .from(client)
    .where(and(eq(client.id, data.clientId), eq(client.orgId, orgId)));
  if (!owned) return fail("Ese cliente no existe en esta empresa.", "NOT_FOUND");
  if (data.projectId) {
    const [p] = await db
      .select({ id: project.id })
      .from(project)
      .where(and(eq(project.id, data.projectId), eq(project.orgId, orgId)));
    if (!p) return fail("Ese proyecto no existe en esta empresa.", "NOT_FOUND");
  }

  const [row] = await db
    .insert(ticket)
    .values({ orgId, ...data, createdBy: userId })
    .returning();
  if (!row) return fail("No se pudo guardar el ticket.", "DB_ERROR");
  return { ok: true, data: row };
}

/** Mueve un ticket; resolverlo fija resolved_at, sacarlo de resuelto borra resolved_at y la calificación. */
export async function moveTicket(userId: string, orgId: string, ticketId: string, status: unknown): Promise<Result<true>> {
  if (!(await canWrite(userId, orgId))) return fail("No puedes mover tickets.", "FORBIDDEN");
  const parsed = z.enum(TICKET_STATUSES).safeParse(status);
  if (!parsed.success) return fail("Ese estado no existe.");
  if (!isUuid(ticketId)) return fail("Ese ticket no existe en esta empresa.", "NOT_FOUND");

  const resolved = parsed.data === "resuelto";
  const [row] = await db
    .update(ticket)
    .set({
      status: parsed.data,
      resolvedAt: resolved ? new Date() : null,
      ...(resolved ? {} : { satisfaction: null }),
      updatedAt: new Date(),
    })
    .where(and(eq(ticket.id, ticketId), eq(ticket.orgId, orgId)))
    .returning({ id: ticket.id });
  if (!row) return fail("Ese ticket no existe en esta empresa.", "NOT_FOUND");
  return { ok: true, data: true };
}

/** Califica (1-5) un ticket resuelto. Sin resolver: INVALID_TRANSITION. */
export async function rateTicket(userId: string, orgId: string, ticketId: string, satisfaction: unknown): Promise<Result<true>> {
  if (!(await canWrite(userId, orgId))) return fail("No puedes calificar tickets.", "FORBIDDEN");
  const parsed = z.coerce.number().int().min(1).max(5).safeParse(satisfaction);
  if (!parsed.success) return fail("La satisfacción va de 1 a 5.");
  if (!isUuid(ticketId)) return fail("Ese ticket no existe en esta empresa.", "NOT_FOUND");

  const [current] = await db
    .select({ status: ticket.status })
    .from(ticket)
    .where(and(eq(ticket.id, ticketId), eq(ticket.orgId, orgId)));
  if (!current) return fail("Ese ticket no existe en esta empresa.", "NOT_FOUND");
  if (current.status !== "resuelto") return fail("Solo se califica un ticket resuelto.", "INVALID_TRANSITION");

  await db
    .update(ticket)
    .set({ satisfaction: parsed.data, updatedAt: new Date() })
    .where(and(eq(ticket.id, ticketId), eq(ticket.orgId, orgId)));
  return { ok: true, data: true };
}

/** Los tickets del org con el nombre del cliente, los más recientes primero. Sin la sección, `[]`. */
export async function listTickets(userId: string, orgId: string) {
  const { scope } = await resolveSection(userId, orgId, "postventa");
  if (scope === "ninguno") return [];
  return db
    .select({
      id: ticket.id,
      title: ticket.title,
      detail: ticket.detail,
      severity: ticket.severity,
      status: ticket.status,
      openedAt: ticket.openedAt,
      resolvedAt: ticket.resolvedAt,
      satisfaction: ticket.satisfaction,
      clientId: ticket.clientId,
      clientName: client.name,
      projectId: ticket.projectId,
    })
    .from(ticket)
    .innerJoin(client, eq(client.id, ticket.clientId))
    .where(eq(ticket.orgId, orgId))
    .orderBy(desc(ticket.openedAt));
}
