// Puente entre datos reales y buildClientList — apps/*/app/** nunca importa @jotapuntoce/db
// directo. La conexión de Drizzle de esta app (DATABASE_URL, pooled) no lleva auth.uid() por
// request, así que la política RLS de membership ("users read their own memberships") no bloquea
// esta consulta cross-usuario a nivel de base de datos — la única capa de seguridad real aquí es
// isPlatformAdmin(userId) en el caller (app/empresas/page.tsx), no RLS. Ver
// docs/superpowers/specs/2026-09-04-panel-clientes-platform-admin-design.md.
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { membership, organization, profile } from "@jotapuntoce/db/schema";
import { buildClientList, type ClientOrgMembership, type ClientProfile, type ClientSummary } from "./clientList.ts";

export async function loadClients(adminUserId: string): Promise<ClientSummary[]> {
  const orgs = await db
    .select({ id: organization.id, name: organization.name })
    .from(membership)
    .innerJoin(organization, eq(organization.id, membership.orgId))
    .where(eq(membership.userId, adminUserId))
    .orderBy(asc(membership.acceptedAt));

  if (orgs.length === 0) return [];

  const orgIds = orgs.map((o) => o.id);
  const allMemberships = await db
    .select({
      orgId: membership.orgId,
      userId: membership.userId,
      role: membership.role,
      acceptedAt: membership.acceptedAt,
    })
    .from(membership)
    .where(inArray(membership.orgId, orgIds));

  const membershipsByOrgId = new Map<string, ClientOrgMembership[]>();
  for (const m of allMemberships) {
    const list = membershipsByOrgId.get(m.orgId) ?? [];
    list.push({
      orgId: m.orgId,
      userId: m.userId,
      role: m.role as ClientOrgMembership["role"],
      acceptedAt: m.acceptedAt,
    });
    membershipsByOrgId.set(m.orgId, list);
  }

  const clientUserIds = Array.from(
    new Set(allMemberships.filter((m) => m.userId !== adminUserId).map((m) => m.userId)),
  );
  if (clientUserIds.length === 0) return [];

  const profiles = await db
    .select({ id: profile.id, fullName: profile.fullName, email: profile.email, avatarColor: profile.avatarColor })
    .from(profile)
    .where(inArray(profile.id, clientUserIds));

  const profilesById = new Map<string, ClientProfile>(profiles.map((p) => [p.id, p]));

  return buildClientList(adminUserId, orgs, membershipsByOrgId, profilesById);
}
