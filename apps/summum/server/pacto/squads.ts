// Escuadras y retos del Pacto. Las arma un dueño del muelle; la escuadra se ve entre sí, pero solo como
// nombre y estado de apoyo (bien / apoyo): nunca registros, notas ni pilares de nadie.
import { and, asc, count, eq, gte, lte } from "drizzle-orm";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { challenge, challengeParticipant, pactoPillar, profile, squad, squadMember } from "@jotapuntoce/db/schema";
import { assertDockOwner, assertPactoAccess, listMyDocks } from "../auth/guard.ts";
import type { Result } from "../result.ts";
import { activeConsent, pactoStatusOf } from "./pacto.ts";
import { mxDate, supportStatus, type PillarRisk } from "./streak.ts";

const INVALIDO = "Revisa los datos del formulario.";
const SIN_CONSENTIMIENTO = "Primero acepta el Pacto.";
const uuid = z.string().uuid();

async function squadById(squadId: string) {
  if (!uuid.safeParse(squadId).success) notFound();
  const [row] = await db.select().from(squad).where(eq(squad.id, squadId)).limit(1);
  if (!row) notFound();
  return row;
}

export async function createSquad(userId: string, muelleId: string, name: unknown): Promise<Result<{ id: string }>> {
  await assertDockOwner(userId, muelleId);
  const parsed = z.string().trim().min(2).max(60).safeParse(name);
  if (!parsed.success) return { ok: false, error: INVALIDO };
  const [row] = await db.insert(squad).values({ muelleOrgId: muelleId, name: parsed.data, createdBy: userId }).returning({ id: squad.id });
  return { ok: true, data: row! };
}

export async function addSquadMember(userId: string, squadId: string, email: unknown): Promise<Result<true>> {
  const sq = await squadById(squadId);
  await assertDockOwner(userId, sq.muelleOrgId);
  const parsed = z.string().trim().toLowerCase().email().safeParse(email);
  if (!parsed.success) return { ok: false, error: INVALIDO };
  const [person] = await db.select({ id: profile.id }).from(profile).where(eq(profile.email, parsed.data)).limit(1);
  if (!person) return { ok: false, error: INVALIDO };
  // Solo gente de la red del muelle que ya aceptó el Pacto; assertPactoAccess lanza 404 si no es de la red.
  const inNetwork = await assertPactoAccess(person.id, sq.muelleOrgId).then(
    () => true,
    (e: unknown) => {
      if ((e as { digest?: string })?.digest === "NEXT_HTTP_ERROR_FALLBACK;404") return false;
      throw e;
    },
  );
  if (!inNetwork || !(await activeConsent(person.id))) return { ok: false, error: INVALIDO };
  await db.insert(squadMember).values({ squadId, profileId: person.id }).onConflictDoNothing();
  return { ok: true, data: true };
}

/** Por integrante, solo `{ name, supportStatus }`. Miembro de la escuadra o dueño del muelle; si no, 404. */
export async function squadBoard(userId: string, squadId: string, now = new Date()) {
  const sq = await squadById(squadId);
  const members = await db
    .select({ profileId: squadMember.profileId, fullName: profile.fullName })
    .from(squadMember)
    .innerJoin(profile, eq(profile.id, squadMember.profileId))
    .where(eq(squadMember.squadId, squadId))
    .orderBy(asc(profile.fullName));
  const isMember = members.some((m) => m.profileId === userId);
  if (!isMember && !(await listMyDocks(userId)).some((d) => d.id === sq.muelleOrgId)) notFound();

  return Promise.all(
    members.map(async (m) => {
      const { pillars } = await pactoStatusOf(m.profileId, sq.muelleOrgId, now);
      const risks = pillars.map((p) => p.risk).filter((r): r is PillarRisk => r !== null);
      return { name: m.fullName ?? "Integrante", supportStatus: supportStatus(risks) };
    }),
  );
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const challengeSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    pillarId: uuid.nullable(),
    squadId: uuid.nullable(),
    startsOn: z.string().regex(DAY),
    endsOn: z.string().regex(DAY),
  })
  .refine((c) => c.endsOn >= c.startsOn);

export async function createChallenge(userId: string, muelleId: string, input: unknown): Promise<Result<{ id: string }>> {
  await assertDockOwner(userId, muelleId);
  const parsed = challengeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: INVALIDO };
  const { pillarId, squadId } = parsed.data;
  const [pillarOk, squadOk] = await Promise.all([
    pillarId
      ? db.select({ id: pactoPillar.id }).from(pactoPillar).where(and(eq(pactoPillar.id, pillarId), eq(pactoPillar.muelleOrgId, muelleId))).then((r) => r.length > 0)
      : true,
    squadId
      ? db.select({ id: squad.id }).from(squad).where(and(eq(squad.id, squadId), eq(squad.muelleOrgId, muelleId))).then((r) => r.length > 0)
      : true,
  ]);
  if (!pillarOk || !squadOk) return { ok: false, error: INVALIDO };
  const [row] = await db
    .insert(challenge)
    .values({ muelleOrgId: muelleId, ...parsed.data, createdBy: userId })
    .returning({ id: challenge.id });
  return { ok: true, data: row! };
}

export async function joinChallenge(userId: string, challengeId: string): Promise<Result<true>> {
  if (!uuid.safeParse(challengeId).success) notFound();
  const [row] = await db.select({ muelleOrgId: challenge.muelleOrgId }).from(challenge).where(eq(challenge.id, challengeId)).limit(1);
  if (!row) notFound();
  await assertPactoAccess(userId, row.muelleOrgId);
  if (!(await activeConsent(userId))) return { ok: false, error: SIN_CONSENTIMIENTO };
  await db.insert(challengeParticipant).values({ challengeId, profileId: userId }).onConflictDoNothing();
  return { ok: true, data: true };
}

export async function listChallenges(userId: string, muelleId: string, now = new Date()) {
  await assertPactoAccess(userId, muelleId);
  const today = mxDate(now);
  return db
    .select({ id: challenge.id, title: challenge.title, startsOn: challenge.startsOn, endsOn: challenge.endsOn, pillarId: challenge.pillarId })
    .from(challenge)
    .where(and(eq(challenge.muelleOrgId, muelleId), lte(challenge.startsOn, today), gte(challenge.endsOn, today)))
    .orderBy(asc(challenge.endsOn));
}

/** Las escuadras del muelle con cuántos integrantes tienen, para el panel de los socios. */
export async function listSquads(userId: string, muelleId: string) {
  await assertDockOwner(userId, muelleId);
  return db
    .select({ id: squad.id, name: squad.name, members: count(squadMember.id) })
    .from(squad)
    .leftJoin(squadMember, eq(squadMember.squadId, squad.id))
    .where(eq(squad.muelleOrgId, muelleId))
    .groupBy(squad.id, squad.name)
    .orderBy(asc(squad.name));
}

/** Las escuadras de la persona en este muelle (normalmente una). */
export async function mySquads(userId: string, muelleId: string) {
  await assertPactoAccess(userId, muelleId);
  return db
    .select({ id: squad.id, name: squad.name })
    .from(squadMember)
    .innerJoin(squad, eq(squad.id, squadMember.squadId))
    .where(and(eq(squadMember.profileId, userId), eq(squad.muelleOrgId, muelleId)))
    .orderBy(asc(squad.name));
}
