// El cuestionario de personalidad y enfoque del dueño: el mismo de las afiliadas de Summum, para que la
// sinapsis proponga a la especialista que más se le parece. Cada quien lee solo lo suyo.
import { and, eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { PERSONALITY_VERSION, personalityAnswersValid, personalityProfile } from "@jotapuntoce/db/schema";
import { findOwnerMembership } from "../auth/guard.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

export async function getOwnerPersonality(userId: string) {
  const [row] = await db
    .select()
    .from(personalityProfile)
    .where(and(eq(personalityProfile.profileId, userId), eq(personalityProfile.subjectKind, "dueno")));
  return row ?? null;
}

export async function saveOwnerPersonality(userId: string, orgId: string, answers: unknown): Promise<Result<true>> {
  if (!(await findOwnerMembership(userId, orgId))) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Solo el dueño contesta este cuestionario." } };
  }
  if (!personalityAnswersValid(answers)) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "Contesta las nueve preguntas." } };
  }
  const values = { answers, orgId, questionnaireVersion: PERSONALITY_VERSION };
  await db
    .insert(personalityProfile)
    .values({ profileId: userId, subjectKind: "dueno", ...values })
    .onConflictDoUpdate({
      target: [personalityProfile.profileId, personalityProfile.subjectKind],
      set: { ...values, updatedAt: new Date() },
    });
  return { ok: true, data: true };
}
