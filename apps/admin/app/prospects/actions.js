"use server";

// Server action: provisiona la organización real de un prospecto. Idempotente — si el prospecto ya
// tiene org_id, no crea un segundo org (criterio de aceptación #2), solo devuelve el existente.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { organization, profile, membership, orgBuildStage, prospectCompany } from "@jotapuntoce/db/schema";
import { db, supabaseAdmin } from "../../lib/db.js";
import { requirePlatformAdmin } from "../../lib/auth.js";

function slugify(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Lógica de negocio pura — sin guard adentro a propósito, para que tests/provisioning.test.js pueda
 * invocarla directo sin pasar por un request real de Next (requirePlatformAdmin() usa cookies() de
 * next/headers, que lanza fuera de ese contexto). El guard vive en el borde: provisionOrganizationAction,
 * abajo — mismo patrón que assertMembership/requireOrgMembership en
 * apps/improvement/server/objectives/mutations.ts.
 *
 * @param {string} prospectId
 * @param {string} ownerEmail - Email del dueño de la empresa cliente. El esquema de
 *   `prospect_company` no guarda un email (§4) — Jose Carlos lo provee al momento de provisionar,
 *   igual que en el mundo real: solo él sabe con quién está hablando en ese prospecto.
 */
export async function provisionOrganization(prospectId, ownerEmail) {
  const [prospect] = await db
    .select()
    .from(prospectCompany)
    .where(eq(prospectCompany.id, prospectId))
    .limit(1);
  if (!prospect) throw new Error(`prospect_company ${prospectId} no existe`);

  if (prospect.orgId) {
    const [org] = await db
      .select()
      .from(organization)
      .where(eq(organization.id, prospect.orgId))
      .limit(1);
    return { organization: org, alreadyProvisioned: true };
  }

  // auth.admin.createUser es una llamada externa a la API de Supabase Auth — no puede vivir dentro
  // de la transacción de Postgres de abajo. Solo se alcanza una vez: el chequeo de idempotencia de
  // arriba corta cualquier llamada repetida antes de llegar aquí.
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: ownerEmail,
    email_confirm: true,
  });
  if (authError || !authData.user) {
    throw new Error(`No se pudo crear el usuario dueño: ${authError?.message ?? "sin detalle"}`);
  }
  const ownerId = authData.user.id;

  const slug = `${slugify(prospect.name)}-${randomUUID().slice(0, 8)}`;

  const org = await db.transaction(async (tx) => {
    const [newOrg] = await tx.insert(organization).values({ name: prospect.name, slug }).returning();
    if (!newOrg) throw new Error("insert de organization no devolvió fila");

    await tx.insert(profile).values({ id: ownerId, email: ownerEmail });
    await tx
      .insert(membership)
      .values({ userId: ownerId, orgId: newOrg.id, role: "owner", acceptedAt: new Date() });
    // Primera etapa del Mapa de Construcción — Jose Carlos agrega las siguientes a mano desde
    // apps/admin conforme avanza (paso 14, backlog de prospectos y detalle de organización).
    await tx.insert(orgBuildStage).values({
      orgId: newOrg.id,
      stageOrder: 1,
      stageName: "Análisis",
      description: "Primer levantamiento de la empresa — áreas, roles y objetivos iniciales.",
      status: "en_progreso",
    });
    await tx
      .update(prospectCompany)
      .set({ status: "en_construcción", orgId: newOrg.id })
      .where(eq(prospectCompany.id, prospectId));

    return newOrg;
  });

  return { organization: org, alreadyProvisioned: false };
}

/**
 * Punto de entrada real como Server Action: guard en el borde + delega en provisionOrganization.
 * Es lo que un futuro formulario de /prospects debe invocar — nunca provisionOrganization directo.
 */
export async function provisionOrganizationAction(prospectId, ownerEmail) {
  await requirePlatformAdmin();
  return provisionOrganization(prospectId, ownerEmail);
}

/**
 * Transición manual simple del backlog: en_construcción -> live. Sin provisión adicional — eso ya
 * pasó en provisionOrganization. Lógica pura sin guard adentro, mismo motivo que provisionOrganization.
 * @param {string} prospectId
 */
export async function markProspectLive(prospectId) {
  const [prospect] = await db
    .select()
    .from(prospectCompany)
    .where(eq(prospectCompany.id, prospectId))
    .limit(1);
  if (!prospect) throw new Error(`prospect_company ${prospectId} no existe`);
  if (prospect.status !== "en_construcción") {
    throw new Error(
      `prospect_company ${prospectId} no está en_construcción (status actual: ${prospect.status})`,
    );
  }

  const [updated] = await db
    .update(prospectCompany)
    .set({ status: "live" })
    .where(eq(prospectCompany.id, prospectId))
    .returning();
  if (!updated) throw new Error("update de prospect_company no devolvió fila");

  return updated;
}

/** Punto de entrada real como Server Action — guard en el borde + delega en markProspectLive. */
export async function markProspectLiveAction(prospectId) {
  await requirePlatformAdmin();
  return markProspectLive(prospectId);
}
