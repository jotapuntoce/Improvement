// La hiperpersonalización de cada cliente: seis preguntas que se le hacen al alta y viven en su ficha.
// Las lee quien tenga la sección `clientes`; las escribe el dueño o quien la tenga en `empresa`.
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { client, clientPreference } from "@jotapuntoce/db/schema";
import { resolveSection } from "../auth/guard.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

function fail(message: string, code = "VALIDATION_ERROR"): Result<never> {
  return { ok: false, error: { code, message } };
}

export const HIPER_QUESTIONS = [
  { key: "como_atenderlo", question: "¿Cómo quiere que lo atendamos?" },
  { key: "expectativa", question: "¿Qué espera de nosotros?" },
  { key: "como_arreglarlo", question: "Si fallamos, ¿cómo espera que lo arreglemos y que estemos presentes?" },
  { key: "valor_agregado", question: "¿Qué valor agregado le gustaría recibir?" },
  { key: "extra_por_ser_cliente", question: "¿Qué le gustaría recibir de extra por ser nuestro cliente?" },
  { key: "como_se_siente_valorado", question: "¿Cómo se siente valorado por nosotros?" },
] as const;

export type HiperKey = (typeof HIPER_QUESTIONS)[number]["key"];
export type ClientPreferenceRow = typeof clientPreference.$inferSelect;

const answer = z.string().trim().max(1000, "Cada respuesta va hasta 1000 caracteres.").optional();
const answersSchema = z.object(
  Object.fromEntries(HIPER_QUESTIONS.map((q) => [q.key, answer])) as Record<HiperKey, typeof answer>,
);

async function clientInOrg(orgId: string, clientId: unknown) {
  if (!z.uuid().safeParse(clientId).success) return false;
  const [row] = await db
    .select({ id: client.id })
    .from(client)
    .where(and(eq(client.id, clientId as string), eq(client.orgId, orgId)));
  return Boolean(row);
}

/** La ficha de hiperpersonalización del cliente, o `null` si no hay o si quien pregunta no ve clientes. */
export async function getClientPreference(
  userId: string,
  orgId: string,
  clientId: string,
): Promise<ClientPreferenceRow | null> {
  const { scope } = await resolveSection(userId, orgId, "clientes");
  if (scope === "ninguno" || !z.uuid().safeParse(clientId).success) return null;
  const [row] = await db
    .select()
    .from(clientPreference)
    .where(and(eq(clientPreference.clientId, clientId), eq(clientPreference.orgId, orgId)));
  return row ?? null;
}

/** Guarda las respuestas del cliente (una fila por cliente; la segunda vez actualiza). */
export async function saveClientPreference(
  userId: string,
  orgId: string,
  clientId: string,
  input: unknown,
): Promise<Result<ClientPreferenceRow>> {
  const { scope } = await resolveSection(userId, orgId, "clientes");
  if (scope !== "empresa") return fail("No puedes editar la ficha de este cliente.", "FORBIDDEN");
  const parsed = answersSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Datos inválidos.");
  if (!(await clientInOrg(orgId, clientId))) return fail("Ese cliente no existe en esta empresa.", "NOT_FOUND");

  const [row] = await db
    .insert(clientPreference)
    .values({ orgId, clientId, answers: parsed.data, updatedBy: userId })
    .onConflictDoUpdate({
      target: clientPreference.clientId,
      set: { answers: parsed.data, updatedBy: userId, updatedAt: new Date() },
    })
    .returning();
  if (!row) return fail("No se pudo guardar la ficha.", "DB_ERROR");
  return { ok: true, data: row };
}
