// Lealtad bajo la sección `clientes`: el programa (qué funciones prende la empresa), los niveles VIP y
// las experiencias entregadas. "Retorno" = experiencias, no descuentos; su meta vive en el Sello (dato).
// Lo lee quien tenga la sección; escribe el dueño o quien la tenga en `empresa`.
import { and, asc, count, desc, eq, lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { client, deal, experienceGrant, LOYALTY_FEATURES, loyaltyProgram, loyaltyTier } from "@jotapuntoce/db/schema";
import { resolveSection } from "../auth/guard.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

function fail(message: string, code = "VALIDATION_ERROR"): Result<never> {
  return { ok: false, error: { code, message } };
}

export type LoyaltyTierRow = typeof loyaltyTier.$inferSelect;
export type ExperienceGrantRow = typeof experienceGrant.$inferSelect;
export type LoyaltyFeatures = Partial<Record<(typeof LOYALTY_FEATURES)[number], boolean>>;

const featuresSchema = z.strictObject(
  Object.fromEntries(LOYALTY_FEATURES.map((k) => [k, z.boolean().optional()])) as Record<
    (typeof LOYALTY_FEATURES)[number],
    z.ZodOptional<z.ZodBoolean>
  >,
);

const tierSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2, "El nivel lleva un nombre de 2 a 60 letras.").max(60, "El nivel lleva un nombre de 2 a 60 letras."),
  minPurchases: z.coerce.number().int().min(0, "Las compras mínimas no pueden ser negativas."),
  perks: z.string().trim().max(500, "Los beneficios caben en 500 caracteres.").default(""),
  position: z.coerce.number().int().default(0),
});

const grantSchema = z.object({
  clientId: z.uuid("Elige un cliente."),
  title: z.string().trim().min(3, "La experiencia lleva un título de 3 a 160 letras.").max(160),
  valueCents: z.coerce.number().int().min(0, "El valor no puede ser negativo."),
  grantedOn: z.iso.date("Fecha inválida."),
});

async function scopeOf(userId: string, orgId: string) {
  return (await resolveSection(userId, orgId, "clientes")).scope;
}

/** El programa de lealtad del org (funciones prendidas) y sus niveles en orden. */
export async function getProgram(
  userId: string,
  orgId: string,
): Promise<Result<{ features: LoyaltyFeatures; tiers: LoyaltyTierRow[] }>> {
  if ((await scopeOf(userId, orgId)) === "ninguno") return fail("No tienes acceso a clientes.", "FORBIDDEN");
  const [program] = await db.select().from(loyaltyProgram).where(eq(loyaltyProgram.orgId, orgId));
  const tiers = await db
    .select()
    .from(loyaltyTier)
    .where(eq(loyaltyTier.orgId, orgId))
    .orderBy(asc(loyaltyTier.position), asc(loyaltyTier.minPurchases));
  return { ok: true, data: { features: program?.features ?? {}, tiers } };
}

/** Prende o apaga funciones. Solo llaves de LOYALTY_FEATURES con valor booleano; cualquier otra no escribe. */
export async function setFeatures(userId: string, orgId: string, features: unknown): Promise<Result<LoyaltyFeatures>> {
  if ((await scopeOf(userId, orgId)) !== "empresa") return fail("No puedes cambiar el programa de lealtad.", "FORBIDDEN");
  const parsed = featuresSchema.safeParse(features);
  if (!parsed.success) return fail("Solo se pueden prender VIP, referidos, cumpleaños y retos.");
  const [row] = await db
    .insert(loyaltyProgram)
    .values({ orgId, features: parsed.data })
    .onConflictDoUpdate({ target: loyaltyProgram.orgId, set: { features: parsed.data, updatedAt: new Date() } })
    .returning();
  return { ok: true, data: row!.features };
}

/** Crea un nivel, o lo edita si trae `id` de este org. */
export async function upsertTier(userId: string, orgId: string, input: unknown): Promise<Result<LoyaltyTierRow>> {
  if ((await scopeOf(userId, orgId)) !== "empresa") return fail("No puedes editar los niveles.", "FORBIDDEN");
  const parsed = tierSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Datos inválidos.");
  const { id, ...data } = parsed.data;
  if (id) {
    const [row] = await db
      .update(loyaltyTier)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(loyaltyTier.id, id), eq(loyaltyTier.orgId, orgId)))
      .returning();
    return row ? { ok: true, data: row } : fail("Ese nivel no existe.", "NOT_FOUND");
  }
  const [row] = await db.insert(loyaltyTier).values({ orgId, ...data }).returning();
  return { ok: true, data: row! };
}

/** Registra una experiencia entregada a un cliente de este org. */
export async function grantExperience(userId: string, orgId: string, input: unknown): Promise<Result<ExperienceGrantRow>> {
  if ((await scopeOf(userId, orgId)) !== "empresa") return fail("No puedes registrar experiencias.", "FORBIDDEN");
  const parsed = grantSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Datos inválidos.");
  const data = parsed.data;
  const [owned] = await db
    .select({ id: client.id })
    .from(client)
    .where(and(eq(client.id, data.clientId), eq(client.orgId, orgId)));
  if (!owned) return fail("Ese cliente no es de esta empresa.", "NOT_FOUND");
  const [row] = await db.insert(experienceGrant).values({ orgId, grantedBy: userId, ...data }).returning();
  return { ok: true, data: row! };
}

/** El nivel con el mayor `min_purchases` que alcanzan los tratos ganados del cliente, o null. */
export async function tierForClient(orgId: string, clientId: string): Promise<LoyaltyTierRow | null> {
  const [won] = await db
    .select({ n: count() })
    .from(deal)
    .where(and(eq(deal.orgId, orgId), eq(deal.clientId, clientId), eq(deal.stage, "ganado")));
  const [tier] = await db
    .select()
    .from(loyaltyTier)
    .where(and(eq(loyaltyTier.orgId, orgId), lte(loyaltyTier.minPurchases, won?.n ?? 0)))
    .orderBy(desc(loyaltyTier.minPurchases))
    .limit(1);
  return tier ?? null;
}

// Las rutas no importan @jotapuntoce/db: la página lee las llaves desde aquí.
export { LOYALTY_FEATURES };
