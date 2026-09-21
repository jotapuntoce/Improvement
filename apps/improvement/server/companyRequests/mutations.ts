// Auto-registro de empresa: un cliente YA logueado pide agregar otra empresa a su portafolio. Sin
// requireOrgMembership/assertMembership — no hay org todavía, el único guard es "hay sesión"
// (getSessionUserId, resuelto por el caller en app/empresas/page.tsx). Jose Carlos aprueba o rechaza
// desde apps/admin (server/companyRequests/actions.js allá) — ese archivo crea el organization real.
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { companyRequest } from "@jotapuntoce/db/schema";
import { isIndustry } from "@jotapuntoce/ui/building/industries.ts";

export async function createCompanyRequest(
  userId: string,
  input: { companyName: string; industry?: string | null },
) {
  const companyName = input.companyName.trim();
  if (!companyName) {
    return {
      ok: false as const,
      error: { code: "VALIDATION_ERROR" as const, message: "El nombre de la empresa es requerido." },
    };
  }

  const [row] = await db
    .insert(companyRequest)
    .values({
      requesterId: userId,
      companyName,
      industry: isIndustry(input.industry) ? input.industry : null,
    })
    .returning();
  if (!row) throw new Error("insert de company_request no devolvió fila");

  return { ok: true as const, data: row };
}

/**
 * WHEN una solicitud ya fue aprobada THE SYSTEM SHALL excluirla de este resultado (criterio #1) —
 * la empresa real ya aparece vía loadCompanies, mostrarla aquí también duplicaría el ícono. Pendiente
 * y rechazada sí se muestran: el cliente necesita ver en qué quedó su solicitud (estilo tracker).
 */
export async function listMyCompanyRequests(userId: string) {
  return db
    .select()
    .from(companyRequest)
    .where(and(eq(companyRequest.requesterId, userId), ne(companyRequest.status, "approved")))
    .orderBy(desc(companyRequest.createdAt));
}
