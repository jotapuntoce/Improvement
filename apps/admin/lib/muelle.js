// El muelle al que se cuelga un barco nuevo: el ÚNICO muelle del que quien aprueba es dueño. Con
// cero o más de uno, null — el barco queda sin muelle y se cuelga con `pnpm db:muelle`, nunca a
// ciegas en el muelle equivocado. Por rol y por dato, nunca por id literal (motor genérico).
import { and, eq } from "drizzle-orm";
import { membership, organization } from "@jotapuntoce/db/schema";

/** @param {any} tx @param {string | null | undefined} userId @returns {Promise<string | null>} */
export async function findDockOfOwner(tx, userId) {
  if (!userId) return null;
  const rows = await tx
    .select({ id: organization.id })
    .from(organization)
    .innerJoin(membership, eq(membership.orgId, organization.id))
    .where(and(eq(organization.kind, "muelle"), eq(membership.userId, userId), eq(membership.role, "owner")))
    .limit(2);
  return rows.length === 1 ? rows[0].id : null;
}
