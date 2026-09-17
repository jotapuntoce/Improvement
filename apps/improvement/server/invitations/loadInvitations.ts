// Las invitaciones vivas de una empresa (para que el dueño vea a quién ya invitó) y la resolución de
// un token a la pantalla de aceptación.
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { invitation, organization, permissionType } from "@jotapuntoce/db/schema";
import { hashToken } from "./mutations.ts";

export interface LiveInvitation {
  id: string;
  email: string;
  typeName: string | null;
  expiresAt: Date;
}

export async function listLiveInvitations(orgId: string): Promise<LiveInvitation[]> {
  return db
    .select({
      id: invitation.id,
      email: invitation.email,
      typeName: permissionType.name,
      expiresAt: invitation.expiresAt,
    })
    .from(invitation)
    .leftJoin(permissionType, eq(permissionType.id, invitation.permissionTypeId))
    .where(
      and(
        eq(invitation.orgId, orgId),
        isNull(invitation.acceptedAt),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .orderBy(asc(invitation.expiresAt));
}

export interface OpenInvitation {
  id: string;
  orgId: string;
  orgName: string;
  email: string;
}

/**
 * WHEN el token no existe, ya fue usado o venció THE SYSTEM SHALL devolver null — y la pantalla dice
 * "este enlace ya no sirve" sin decir de qué empresa era: quien tiene un token muerto no tiene por
 * qué enterarse de que esa empresa existe.
 */
export async function findOpenInvitation(token: string): Promise<OpenInvitation | null> {
  const [row] = await db
    .select({
      id: invitation.id,
      orgId: invitation.orgId,
      orgName: organization.name,
      email: invitation.email,
    })
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.orgId))
    .where(
      and(
        eq(invitation.tokenHash, hashToken(token)),
        isNull(invitation.acceptedAt),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return row ?? null;
}
