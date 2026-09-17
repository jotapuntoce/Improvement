"use server";

// Aprobación/rechazo de solicitudes de auto-registro (company_request) — distinto de
// provisionOrganization (prospects/actions.js): aquí el requester YA tiene cuenta y sesión real en
// apps/improvement, así que no hay que crear usuario de Supabase Auth ni mandar invitación por
// WhatsApp, solo el organization + membership(owner) + primera etapa del mapa, igual que ahí.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { organization, membership, orgBuildStage, orgKpi, profile, companyRequest } from "@jotapuntoce/db/schema";
import { initialBuildStages } from "@jotapuntoce/ui/building/buildStages.ts";
import { defaultOrgKpis } from "@jotapuntoce/ui/building/kpis.ts";
import { db } from "../../lib/db.js";
import { requirePlatformAdmin } from "../../lib/auth.js";
import { slugify } from "../../lib/slugify.js";

/**
 * Lógica pura — sin guard adentro, para poder probarla sin mockear cookies() de next/headers (mismo
 * patrón que provisionOrganization). El guard vive en el borde: approveCompanyRequestAction, abajo.
 * @param {string} requestId
 * @param {string} adminId
 */
export async function approveCompanyRequest(requestId, adminId) {
  const [request] = await db
    .select()
    .from(companyRequest)
    .where(eq(companyRequest.id, requestId))
    .limit(1);
  if (!request) throw new Error(`company_request ${requestId} no existe`);
  if (request.status !== "pending") {
    throw new Error(`company_request ${requestId} no está pending (status actual: ${request.status})`);
  }

  const slug = `${slugify(request.companyName)}-${randomUUID().slice(0, 8)}`;

  return db.transaction(async (tx) => {
    const [newOrg] = await tx
      .insert(organization)
      .values({ name: request.companyName, slug, industry: request.industry })
      .returning();
    if (!newOrg) throw new Error("insert de organization no devolvió fila");

    await tx
      .insert(membership)
      .values({ userId: request.requesterId, orgId: newOrg.id, role: "owner", acceptedAt: new Date() });

    // Mismo criterio que provisionOrganization: cualquier platform admin entra a la organización
    // nueva con su propia sesión real de apps/improvement, por rol, nunca por id/correo literal.
    const platformAdmins = await tx
      .select({ id: profile.id })
      .from(profile)
      .where(eq(profile.isPlatformAdmin, true));
    for (const admin of platformAdmins) {
      if (admin.id === request.requesterId) continue;
      await tx
        .insert(membership)
        .values({ userId: admin.id, orgId: newOrg.id, role: "owner", acceptedAt: new Date() });
    }

    // Las 8 fases completas, no solo la primera: el tracker del panel del dueño enseña el camino
    // entero desde el día uno (packages/ui/src/building/buildStages.ts).
    await tx
      .insert(orgBuildStage)
      .values(initialBuildStages().map((stage) => ({ ...stage, orgId: newOrg.id })));

    // Los indicadores por defecto en el mismo tx que las fases: una empresa sin filas en org_kpi
    // dibuja una tarjeta sin un solo numero, y el dueno no tendria forma de saber que le falta
    // configurarlos. Son un punto de partida, no un catalogo — los cambia desde configuracion.
    await tx
      .insert(orgKpi)
      .values(defaultOrgKpis().map((kpi) => ({ ...kpi, orgId: newOrg.id })));

    await tx
      .update(companyRequest)
      .set({ status: "approved", orgId: newOrg.id, reviewedBy: adminId, reviewedAt: new Date() })
      .where(eq(companyRequest.id, requestId));

    return newOrg;
  });
}

/** @param {string} requestId */
export async function rejectCompanyRequest(requestId, adminId) {
  const [row] = await db
    .update(companyRequest)
    .set({ status: "rejected", reviewedBy: adminId, reviewedAt: new Date() })
    .where(eq(companyRequest.id, requestId))
    .returning();
  if (!row) throw new Error(`company_request ${requestId} no existe`);
  return row;
}

/** Punto de entrada real como Server Action — guard en el borde. @param {string} requestId */
export async function approveCompanyRequestAction(requestId) {
  const admin = await requirePlatformAdmin();
  return approveCompanyRequest(requestId, admin.id);
}

/** @param {string} requestId */
export async function rejectCompanyRequestAction(requestId) {
  const admin = await requirePlatformAdmin();
  return rejectCompanyRequest(requestId, admin.id);
}
