// ¿Este id es de ESTA empresa? Un solo lugar para la pregunta que se hace cada vez que un id de tipo
// de permiso o de área llega desde un formulario: el navegador puede mandar cualquier uuid, y sin
// este chequeo el dueño de una empresa podría conceder el tipo de otra.
//
// Lo usan invitations/mutations.ts (al invitar y al aceptar) y employees/mutations.ts (al cambiarle
// el acceso a alguien). Es un select previo y no un constraint porque no hay nada que insertar: la
// respuesta decide entre escribir y devolver NOT_FOUND, no entre dos filas en conflicto.
import { and, eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { area, client, orgNeed, permissionType, project } from "@jotapuntoce/db/schema";

export async function belongsToOrg(
  table: typeof permissionType | typeof area | typeof orgNeed | typeof client | typeof project,
  id: string,
  orgId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, id), eq(table.orgId, orgId)))
    .limit(1);
  return Boolean(row);
}
