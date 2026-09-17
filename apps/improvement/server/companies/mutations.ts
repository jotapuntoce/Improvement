// Lo poco que el dueño puede cambiar de su propia empresa desde apps/improvement. Todo lo demás de
// `organization` (nombre, slug, fases de construcción) lo mueve Jose Carlos desde apps/admin.
import { eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { organization } from "@jotapuntoce/db/schema";
import { isIndustry } from "@jotapuntoce/ui/building/industries.ts";
import { assertMembership } from "../auth/guard.ts";

/**
 * El giro decide el ícono de la empresa en el panel (AppIconLarge elige su glyph con este valor),
 * así que "personalizar el ícono" y "decir a qué se dedica" son la misma acción.
 *
 * WHEN el giro no es uno de los ids de INDUSTRIES THE SYSTEM SHALL rechazarlo sin escribir: un
 * valor libre caería al glyph default y el dueño vería su cambio guardado sin efecto visible.
 * assertMembership primero — nadie cambia el ícono de una empresa que no es suya.
 */
export async function updateCompanyIndustry(userId: string, orgId: string, industry: string) {
  await assertMembership(userId, orgId);

  if (!isIndustry(industry)) {
    return {
      ok: false as const,
      error: { code: "VALIDATION_ERROR" as const, message: "Ese giro no existe." },
    };
  }

  const [row] = await db
    .update(organization)
    .set({ industry, updatedAt: new Date() })
    .where(eq(organization.id, orgId))
    .returning();
  if (!row) {
    return {
      ok: false as const,
      error: { code: "NOT_FOUND" as const, message: "La empresa no existe." },
    };
  }

  return { ok: true as const, data: row };
}
