// Qué catálogo de PowerUps ve un org: el global de siempre o el de la red de su muelle. El modo es una
// fila (muelle_settings.catalog_mode) y se apaga igual que se enciende: las filas globales nunca se tocan.
// No corre en nombre de nadie: lo llaman redeemPowerup y el catálogo, que ya pasaron por assertMembership.
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { CATALOG_MODES, muelleSettings, organization, powerupPartner } from "@jotapuntoce/db/schema";

type CatalogMode = (typeof CATALOG_MODES)[number];

/** El modo del muelle padre del org; sin muelle o sin fila de ajustes, `global`. */
async function catalogScope(orgId: string): Promise<{ mode: CatalogMode; muelleId: string | null }> {
  const [row] = await db
    .select({ muelleId: organization.parentOrgId, mode: muelleSettings.catalogMode })
    .from(organization)
    .leftJoin(muelleSettings, eq(muelleSettings.muelleOrgId, organization.parentOrgId))
    .where(eq(organization.id, orgId));
  return row?.muelleId && row.mode === "red" ? { mode: "red", muelleId: row.muelleId } : { mode: "global", muelleId: null };
}

export async function catalogModeFor(orgId: string): Promise<CatalogMode> {
  return (await catalogScope(orgId)).mode;
}

const inScope = (muelleId: string | null) =>
  muelleId ? eq(powerupPartner.networkOrgId, muelleId) : isNull(powerupPartner.networkOrgId);

export async function listCatalogForOrg(orgId: string) {
  const { muelleId } = await catalogScope(orgId);
  return db
    .select()
    .from(powerupPartner)
    .where(and(eq(powerupPartner.isActive, true), inScope(muelleId)));
}

/** Si el premio pertenece al catálogo del org; `is_active` lo sigue validando quien canjea. */
export async function isInCatalog(partnerId: string, orgId: string): Promise<boolean> {
  const { muelleId } = await catalogScope(orgId);
  const [row] = await db
    .select({ id: powerupPartner.id })
    .from(powerupPartner)
    .where(and(eq(powerupPartner.id, partnerId), inScope(muelleId)));
  return Boolean(row);
}
