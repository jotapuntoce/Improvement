// El Pacto de cada persona de la red: consentimiento expreso, registros diarios por pilar, la posada y los
// pilares del muelle. Datos de salud (LFPDPPP): cada función toca solo las filas de `userId`, salvo los
// pilares, que administra un dueño del muelle. Revocar con `borrar` es su derecho de cancelación.
import { and, asc, eq, gte, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { alias } from "drizzle-orm/pg-core";
import {
  affiliate,
  membership,
  organization,
  PACTO_CONSENT_VERSION,
  pactoConsent,
  pactoEntry,
  pactoPause,
  pactoPillar,
} from "@jotapuntoce/db/schema";
import { assertDockOwner, assertPactoAccess, listMyDocks } from "../auth/guard.ts";
import type { Result } from "../result.ts";
import { mxDate, pillarStatus } from "./streak.ts";

const INVALIDO = "Revisa los datos del formulario.";
const SIN_CONSENTIMIENTO = "Primero acepta el Pacto.";
const MAX_PAUSE_DAYS = 30;
const muelle = alias(organization, "muelle");

/** Uso interno de server/pacto: el llamador ya pasó su guard. */
export async function activeConsent(userId: string) {
  const [row] = await db
    .select()
    .from(pactoConsent)
    .where(and(eq(pactoConsent.profileId, userId), isNull(pactoConsent.revokedAt)));
  return row ?? null;
}

export async function giveConsent(userId: string, muelleId: string): Promise<Result<true>> {
  await assertPactoAccess(userId, muelleId);
  const values = { consentTextVersion: PACTO_CONSENT_VERSION, acceptedAt: new Date(), revokedAt: null };
  await db
    .insert(pactoConsent)
    .values({ profileId: userId, ...values })
    .onConflictDoUpdate({ target: pactoConsent.profileId, set: { ...values, updatedAt: new Date() } });
  return { ok: true, data: true };
}

export async function revokeConsent(userId: string, { borrar }: { borrar: boolean }): Promise<Result<true>> {
  await db.transaction(async (tx) => {
    await tx.update(pactoConsent).set({ revokedAt: new Date(), updatedAt: new Date() }).where(eq(pactoConsent.profileId, userId));
    if (borrar) {
      await tx.delete(pactoEntry).where(eq(pactoEntry.profileId, userId));
      await tx.delete(pactoPause).where(eq(pactoPause.profileId, userId));
    }
  });
  return { ok: true, data: true };
}

const entrySchema = z.object({ pillarId: z.string().uuid(), note: z.string().trim().max(500).nullable() });

export async function logEntry(userId: string, muelleId: string, input: unknown, now = new Date()): Promise<Result<true>> {
  if (!(await activeConsent(userId))) return { ok: false, error: SIN_CONSENTIMIENTO };
  const parsed = entrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: INVALIDO };
  const [pillar] = await db
    .select({ id: pactoPillar.id })
    .from(pactoPillar)
    .where(and(eq(pactoPillar.id, parsed.data.pillarId), eq(pactoPillar.muelleOrgId, muelleId), eq(pactoPillar.active, true)));
  if (!pillar) return { ok: false, error: INVALIDO };
  await db
    .insert(pactoEntry)
    .values({ profileId: userId, pillarId: pillar.id, entryDate: mxDate(now), note: parsed.data.note })
    .onConflictDoUpdate({
      target: [pactoEntry.profileId, pactoEntry.pillarId, pactoEntry.entryDate],
      set: { note: parsed.data.note },
    });
  return { ok: true, data: true };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const pauseSchema = z
  .object({ startsOn: z.string().regex(DAY), endsOn: z.string().regex(DAY), reason: z.string().trim().max(300).nullable() })
  .refine((p) => {
    const days = (Date.parse(`${p.endsOn}T00:00:00Z`) - Date.parse(`${p.startsOn}T00:00:00Z`)) / 86_400_000 + 1;
    return days >= 1 && days <= MAX_PAUSE_DAYS;
  });

export async function pausePacto(userId: string, input: unknown): Promise<Result<true>> {
  if (!(await activeConsent(userId))) return { ok: false, error: SIN_CONSENTIMIENTO };
  const parsed = pauseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: INVALIDO };
  await db.insert(pactoPause).values({ profileId: userId, ...parsed.data });
  return { ok: true, data: true };
}

const laterOf = (a: string, b: string) => (a > b ? a : b);

export async function myPacto(userId: string, muelleId: string, now = new Date()) {
  await assertPactoAccess(userId, muelleId);
  return pactoStatusOf(userId, muelleId, now);
}

/**
 * El estado del Pacto de una persona en un muelle. Uso interno de server/pacto (myPacto, squadBoard): el
 * llamador ya pasó su guard y decide qué parte enseña — la escuadra, solo el estado de apoyo.
 */
export async function pactoStatusOf(userId: string, muelleId: string, now: Date) {
  const today = mxDate(now);
  const [consent, pillars] = await Promise.all([
    activeConsent(userId),
    db
      .select()
      .from(pactoPillar)
      .where(and(eq(pactoPillar.muelleOrgId, muelleId), eq(pactoPillar.active, true)))
      .orderBy(asc(pactoPillar.position), asc(pactoPillar.name)),
  ]);
  if (!consent) return { consent: null, pillars: pillars.map((p) => ({ id: p.id, name: p.name, todayNote: null, loggedToday: false, streak: 0, risk: null })) };

  // ponytail: lee todo el historial de la persona; acota a la racha más larga posible si crece a años.
  const [entries, pauses] = await Promise.all([
    db
      .select({ pillarId: pactoEntry.pillarId, entryDate: pactoEntry.entryDate, note: pactoEntry.note })
      .from(pactoEntry)
      .where(eq(pactoEntry.profileId, userId)),
    db
      .select({ startsOn: pactoPause.startsOn, endsOn: pactoPause.endsOn })
      .from(pactoPause)
      .where(and(eq(pactoPause.profileId, userId), gte(pactoPause.endsOn, mxDate(consent.acceptedAt)))),
  ]);
  return {
    consent,
    pillars: pillars.map((p) => {
      const mine = entries.filter((e) => e.pillarId === p.id);
      const since = laterOf(mxDate(consent.acceptedAt), mxDate(p.createdAt));
      return {
        id: p.id,
        name: p.name,
        todayNote: mine.find((e) => e.entryDate === today)?.note ?? null,
        loggedToday: mine.some((e) => e.entryDate === today),
        ...pillarStatus({ today, entryDates: mine.map((e) => e.entryDate), pauses, since }),
      };
    }),
  };
}

const pillarSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(60),
  position: z.number().int().min(0).max(1000),
  active: z.boolean(),
});

export async function upsertPillar(userId: string, muelleId: string, input: unknown): Promise<Result<{ id: string }>> {
  await assertDockOwner(userId, muelleId);
  const parsed = pillarSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: INVALIDO };
  const { id, ...values } = parsed.data;
  if (id) {
    const [row] = await db
      .update(pactoPillar)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(pactoPillar.id, id), eq(pactoPillar.muelleOrgId, muelleId)))
      .returning({ id: pactoPillar.id });
    return row ? { ok: true, data: row } : { ok: false, error: INVALIDO };
  }
  const [row] = await db.insert(pactoPillar).values({ muelleOrgId: muelleId, ...values }).returning({ id: pactoPillar.id });
  return { ok: true, data: row! };
}

/** Todos los pilares del muelle, activos e inactivos, para el panel de los socios. */
export async function listPillars(userId: string, muelleId: string) {
  await assertDockOwner(userId, muelleId);
  return db
    .select()
    .from(pactoPillar)
    .where(eq(pactoPillar.muelleOrgId, muelleId))
    .orderBy(asc(pactoPillar.position), asc(pactoPillar.name));
}

/** Los muelles de la persona: los suyos, donde es afiliada activa o donde trabaja en un barco. */
export async function listMyNetworks(userId: string) {
  const [docks, affiliations, crews] = await Promise.all([
    listMyDocks(userId),
    db
      .select({ id: organization.id, name: organization.name })
      .from(affiliate)
      .innerJoin(organization, eq(organization.id, affiliate.muelleOrgId))
      .where(and(eq(affiliate.profileId, userId), eq(affiliate.status, "activa"))),
    db
      .select({ id: muelle.id, name: muelle.name })
      .from(membership)
      .innerJoin(organization, eq(organization.id, membership.orgId))
      .innerJoin(muelle, eq(muelle.id, organization.parentOrgId))
      .where(eq(membership.userId, userId)),
  ]);
  const byId = new Map<string, { id: string; name: string; isAffiliate: boolean }>();
  for (const n of [...docks, ...crews]) byId.set(n.id, { ...n, isAffiliate: byId.get(n.id)?.isAffiliate ?? false });
  for (const n of affiliations) byId.set(n.id, { ...n, isAffiliate: true });
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
}
