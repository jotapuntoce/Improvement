// La barra izquierda: empresas del usuario, grupos con sus apps visibles y, para el dueño, los tipos
// de permiso con los que puede previsualizar. "Vista previa" solo reduce lo visible.
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { appGroup, appModel, membership, organization, permissionType } from "@jotapuntoce/db/schema";
import { assertMembership } from "../auth/guard.ts";
import { loadVisibleSections } from "../permissions/loadSections.ts";
import { ensureOrgApps } from "./catalog.ts";

export interface SidebarApp { key: string; name: string; icon: string | null; href: string }
export interface Sidebar {
  orgs: { id: string; name: string }[];
  groups: { name: string; apps: SidebarApp[] }[];
  /** Solo para el dueño: los tipos con los que puede ver "como". Null para los demás. */
  permissionTypes: { id: string; name: string }[] | null;
}

export async function loadSidebar(userId: string, orgId: string, previewGrants: Record<string, string> | null = null): Promise<Sidebar> {
  const me = await assertMembership(userId, orgId);
  await ensureOrgApps(orgId);
  const [orgs, visible, groups, apps, types] = await Promise.all([
    db
      .select({ id: organization.id, name: organization.name })
      .from(membership)
      .innerJoin(organization, eq(organization.id, membership.orgId))
      .where(and(eq(membership.userId, userId), isNotNull(membership.acceptedAt)))
      .orderBy(asc(organization.name)),
    loadVisibleSections(userId, orgId),
    db.select().from(appGroup).where(eq(appGroup.orgId, orgId)).orderBy(asc(appGroup.position)),
    db.select().from(appModel).where(and(eq(appModel.orgId, orgId), eq(appModel.enabled, true))).orderBy(asc(appModel.position)),
    me.role === "owner"
      ? db.select({ id: permissionType.id, name: permissionType.name }).from(permissionType).where(eq(permissionType.orgId, orgId)).orderBy(asc(permissionType.name))
      : Promise.resolve(null),
  ]);
  const allowed = new Set<string>(visible.map((s) => s.slug));
  const canSee = (section: string) => allowed.has(section) && (!previewGrants || (previewGrants[section] ?? "ninguno") !== "ninguno");
  return {
    orgs,
    groups: groups
      .map((g) => ({
        name: g.name,
        apps: apps
          .filter((a) => a.groupId === g.id && canSee(a.section))
          .map((a) => ({ key: a.key, name: a.name, icon: a.icon, href: `/${orgId}/a/${a.key}` })),
      }))
      .filter((g) => g.apps.length > 0),
    permissionTypes: types,
  };
}
