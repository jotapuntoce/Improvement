// Los compañeros que una persona puede ver. NUNCA incluye responsibility_level: el Non-negotiable #4
// dice que un empleado jamás lee el de otro, y la forma más segura de cumplirlo es que ese campo no
// exista en el dato que sale de aquí (mismo criterio que listTeamForOwner).
import { and, eq, sql } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, profile } from "@jotapuntoce/db/schema";
import { resolveSection } from "../auth/guard.ts";

export interface Teammate {
  userId: string;
  fullName: string | null;
  email: string;
  jobTitle: string | null;
}

/**
 * El alcance se resuelve ADENTRO (resolveSection), no lo pasa el llamador — mismo patrón que
 * listObjectives: así ninguna pantalla futura puede volver a mandar la señal equivocada. Alcance
 * `area` sin área asignada devuelve cero, nunca la empresa entera — un miembro a medio configurar
 * (p. ej. porque el dueño borró su área, onDelete: set null) nunca ve de más.
 */
export async function listTeammates(userId: string, orgId: string): Promise<Teammate[]> {
  const { membership: member, scope } = await resolveSection(userId, orgId, "equipo");
  if (scope === "ninguno") return [];

  const conditions = [eq(membership.orgId, orgId), eq(profile.isPlatformAdmin, false)];
  if (scope === "area") {
    conditions.push(member.areaId ? eq(membership.areaId, member.areaId) : sql`false`);
  }

  return db
    .select({
      userId: membership.userId,
      fullName: profile.fullName,
      email: profile.email,
      jobTitle: membership.jobTitle,
    })
    .from(membership)
    .innerJoin(profile, eq(profile.id, membership.userId))
    .where(and(...conditions));
}
