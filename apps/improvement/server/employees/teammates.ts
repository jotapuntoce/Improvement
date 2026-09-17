// Los compañeros que una persona puede ver. NUNCA incluye responsibility_level: el Non-negotiable #4
// dice que un empleado jamás lee el de otro, y la forma más segura de cumplirlo es que ese campo no
// exista en el dato que sale de aquí (mismo criterio que listTeamForOwner).
import { and, eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, profile } from "@jotapuntoce/db/schema";

export interface Teammate {
  userId: string;
  fullName: string | null;
  email: string;
  jobTitle: string | null;
}

export async function listTeammates(orgId: string, areaId: string | null): Promise<Teammate[]> {
  const conditions = [eq(membership.orgId, orgId), eq(profile.isPlatformAdmin, false)];
  if (areaId) conditions.push(eq(membership.areaId, areaId));

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
