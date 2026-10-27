// Ranking entre afiliadas (solo aquí, en Summum: Improvement nunca ordena por puntaje) y el referente
// público de un enlace /r/[code].
import { and, eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { affiliate, profile, referralLink } from "@jotapuntoce/db/schema";
import { assertNetworkMember } from "../auth/guard.ts";
import { levelFor, memberPoints } from "./levels.ts";

const CODE = /^[A-Za-z0-9_-]{16}$/;

/** Solo afiliadas activas del muelle, por puntos desc y luego por nombre. */
export async function leaderboard(userId: string, muelleId: string) {
  await assertNetworkMember(userId, muelleId);
  const [members, points] = await Promise.all([
    db
      .select({ profileId: affiliate.profileId, displayName: affiliate.displayName })
      .from(affiliate)
      .where(and(eq(affiliate.muelleOrgId, muelleId), eq(affiliate.status, "activa"))),
    memberPoints(muelleId),
  ]);
  return members
    .map((m) => {
      const p = points.get(m.profileId) ?? 0;
      return { profileId: m.profileId, displayName: m.displayName, points: p, level: levelFor(p) };
    })
    .sort((a, b) => b.points - a.points || a.displayName.localeCompare(b.displayName, "es"));
}

/** Sin sesión: solo el primer nombre del referente, o null. */
export async function referrerByCode(code: string): Promise<{ firstName: string } | null> {
  if (!CODE.test(code)) return null;
  const [row] = await db
    .select({ displayName: affiliate.displayName, fullName: profile.fullName })
    .from(referralLink)
    .innerJoin(profile, eq(profile.id, referralLink.profileId))
    .leftJoin(affiliate, and(eq(affiliate.profileId, referralLink.profileId), eq(affiliate.muelleOrgId, referralLink.muelleOrgId)))
    .where(eq(referralLink.code, code))
    .limit(1);
  if (!row) return null;
  const firstName = (row.displayName ?? row.fullName ?? "").trim().split(/\s+/)[0];
  return firstName ? { firstName } : null;
}
