// Lo que la página de la oficina 2D lee: el plano confirmado (cualquier miembro) o el borrador (dueño).
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { area, officePlan, officeZone, profile, seat } from "@jotapuntoce/db/schema";
import { findMembership, findOwnerMembership } from "../auth/guard.ts";

export interface OfficeView {
  zones: { kind: string; label: string; x: number; y: number; w: number; h: number; areaId: string | null; color: string | null }[];
  people: { profileId: string; name: string; areaId: string }[];
}

export async function loadOffice(userId: string, orgId: string): Promise<OfficeView | null> {
  if (!(await findMembership(userId, orgId))) return null;
  const [plan] = await db
    .select({ id: officePlan.id })
    .from(officePlan)
    .where(and(eq(officePlan.orgId, orgId), eq(officePlan.status, "confirmed")));
  if (!plan) return null;

  const [zones, people] = await Promise.all([
    db
      .select({
        kind: officeZone.kind,
        label: officeZone.label,
        x: officeZone.x,
        y: officeZone.y,
        w: officeZone.w,
        h: officeZone.h,
        areaId: officeZone.areaId,
        color: area.color,
      })
      .from(officeZone)
      .leftJoin(area, eq(area.id, officeZone.areaId))
      .where(eq(officeZone.planId, plan.id)),
    db
      .select({ profileId: profile.id, fullName: profile.fullName, email: profile.email, areaId: seat.areaId })
      .from(seat)
      .innerJoin(profile, eq(profile.id, seat.holderProfileId))
      .where(and(eq(seat.orgId, orgId), isNotNull(seat.areaId))),
  ]);
  return {
    zones,
    people: people.map((p) => ({ profileId: p.profileId, name: p.fullName ?? p.email, areaId: p.areaId! })),
  };
}

export async function loadOfficeDraft(userId: string, orgId: string) {
  if (!(await findOwnerMembership(userId, orgId))) return null;
  const [draft] = await db
    .select()
    .from(officePlan)
    .where(and(eq(officePlan.orgId, orgId), eq(officePlan.status, "draft")));
  return draft ?? null;
}
