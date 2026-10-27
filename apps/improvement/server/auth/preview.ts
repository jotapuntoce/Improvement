// "Vista previa como": el dueño elige un tipo de permiso y ve su Improvement como lo vería ese tipo.
// Solo escribe la cookie; la lee getPreviewGrants (guard.ts), que vuelve a comprobar que es el dueño.
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { permissionType } from "@jotapuntoce/db/schema";
import { findOwnerMembership, PREVIEW_COOKIE } from "./guard.ts";

/** Activa (o quita, con null) la vista previa. Ignora en silencio a quien no es dueño o un tipo ajeno. */
export async function setPreview(userId: string, orgId: string, permissionTypeId: string | null): Promise<void> {
  if (!(await findOwnerMembership(userId, orgId))) return;
  const jar = await cookies();
  const parsed = z.uuid().safeParse(permissionTypeId);
  if (!parsed.success) {
    jar.delete(PREVIEW_COOKIE);
    return;
  }
  const [type] = await db
    .select({ id: permissionType.id })
    .from(permissionType)
    .where(and(eq(permissionType.id, parsed.data), eq(permissionType.orgId, orgId)));
  if (!type) return;
  jar.set(PREVIEW_COOKIE, `${orgId}:${type.id}`, { httpOnly: true, sameSite: "lax", secure: true, path: "/" });
}
