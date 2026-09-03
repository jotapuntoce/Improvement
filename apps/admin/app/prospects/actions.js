"use server";

// Server actions del backlog de prospectos. Modelo: prospectClient (la persona, ej. Jaime Salinas) ->
// N prospectCompany (sus empresas, ej. Camibel, Afianza) -> cada prospectCompany se provisiona a su
// propio organization. provisionOrganization es idempotente en dos niveles: no crea un segundo
// organization para el mismo prospecto (como antes), y ahora tampoco crea un segundo usuario de
// Supabase Auth para el mismo cliente — si Jaime ya tiene cuenta por Camibel, provisionar Afianza
// reutiliza ese mismo usuario y solo agrega el membership de la org nueva.
import { randomUUID, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  organization,
  profile,
  membership,
  orgBuildStage,
  prospectClient,
  prospectCompany,
} from "@jotapuntoce/db/schema";
import { db, supabaseAdmin } from "../../lib/db.js";
import { requirePlatformAdmin } from "../../lib/auth.js";
import { sendWhatsAppMessage } from "../../lib/whatsapp.js";

function slugify(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// 12 caracteres url-safe — nunca se guarda en la base de datos, solo vive en memoria durante esta
// llamada y viaja al cliente por WhatsApp. No hay pantalla de "cambiar contraseña" en
// apps/improvement todavía (fuera de alcance de este cambio) — queda documentado como límite
// conocido, no como descuido.
function generateTempPassword() {
  return randomBytes(9).toString("base64url");
}

/**
 * Crea el prospectClient (la persona) junto con su primera prospectCompany, en una sola transacción
 * — en este dominio un cliente nunca existe sin al menos una empresa asociada.
 */
export async function createProspectClient({
  fullName,
  email,
  whatsappPhone,
  companyCount,
  companyName,
  industry,
  notes,
  priority,
}) {
  return db.transaction(async (tx) => {
    const [client] = await tx
      .insert(prospectClient)
      .values({
        fullName,
        email,
        whatsappPhone,
        companyCount: Number.isFinite(companyCount) && companyCount > 0 ? companyCount : 1,
      })
      .returning();
    if (!client) throw new Error("insert de prospect_client no devolvió fila");

    const [company] = await tx
      .insert(prospectCompany)
      .values({
        prospectClientId: client.id,
        name: companyName,
        industry: industry || null,
        notes: notes || null,
        priority: Number.isFinite(priority) ? priority : 0,
      })
      .returning();
    if (!company) throw new Error("insert de prospect_company no devolvió fila");

    return { client, company };
  });
}

/** Punto de entrada real como Server Action — guard en el borde + parseo de FormData. */
export async function createProspectClientAction(formData) {
  await requirePlatformAdmin();

  const fullName = formData.get("fullName")?.toString().trim();
  const email = formData.get("email")?.toString().trim();
  const whatsappPhone = formData.get("whatsappPhone")?.toString().trim();
  const companyName = formData.get("companyName")?.toString().trim();
  if (!fullName || !email || !whatsappPhone || !companyName) return;

  await createProspectClient({
    fullName,
    email,
    whatsappPhone,
    companyCount: Number(formData.get("companyCount")),
    companyName,
    industry: formData.get("industry")?.toString().trim() || null,
    notes: formData.get("notes")?.toString().trim() || null,
    priority: Number(formData.get("priority")),
  });
}

/** Agrega otra empresa (prospectCompany) a un prospectClient que ya existe — ej. Afianza para Jaime. */
export async function addProspectCompany({ prospectClientId, name, industry, notes, priority }) {
  const [company] = await db
    .insert(prospectCompany)
    .values({
      prospectClientId,
      name,
      industry: industry || null,
      notes: notes || null,
      priority: Number.isFinite(priority) ? priority : 0,
    })
    .returning();
  if (!company) throw new Error("insert de prospect_company no devolvió fila");
  return company;
}

/** Punto de entrada real como Server Action — guard en el borde + parseo de FormData. */
export async function addProspectCompanyAction(formData) {
  await requirePlatformAdmin();

  const prospectClientId = formData.get("prospectClientId")?.toString();
  const name = formData.get("name")?.toString().trim();
  if (!prospectClientId || !name) return;

  await addProspectCompany({
    prospectClientId,
    name,
    industry: formData.get("industry")?.toString().trim() || null,
    notes: formData.get("notes")?.toString().trim() || null,
    priority: Number(formData.get("priority")),
  });
}

/**
 * Lógica de negocio pura — sin guard adentro a propósito, para que tests/prospects.test.js pueda
 * invocarla directo sin pasar por un request real de Next (requirePlatformAdmin() usa cookies() de
 * next/headers, que lanza fuera de ese contexto). El guard vive en el borde: provisionOrganizationAction,
 * abajo — mismo patrón que assertMembership/requireOrgMembership en
 * apps/improvement/server/objectives/mutations.ts.
 *
 * @param {string} prospectId
 */
export async function provisionOrganization(prospectId) {
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
    return { organization: org, alreadyProvisioned: true, whatsapp: null };
  }

  const [client] = await db
    .select()
    .from(prospectClient)
    .where(eq(prospectClient.id, prospect.prospectClientId))
    .limit(1);
  if (!client) throw new Error(`prospect_client ${prospect.prospectClientId} no existe`);

  // Idempotencia POR PERSONA REAL, no solo por prospecto: si el email de este cliente ya es un
  // profile (porque ya provisionamos otra de sus empresas), reutiliza ese mismo usuario —
  // auth.admin.createUser con un email que ya existe en Supabase Auth falla, y un cliente puede
  // tener N empresas bajo el mismo login (criterio explícito de Jose Carlos: Jaime Salinas, dueño de
  // Camibel y Afianza).
  const [existingProfile] = await db
    .select()
    .from(profile)
    .where(eq(profile.email, client.email))
    .limit(1);

  let ownerId;
  let tempPassword = null;
  const isNewUser = !existingProfile;

  if (existingProfile) {
    ownerId = existingProfile.id;
  } else {
    // auth.admin.createUser es una llamada externa a la API de Supabase Auth — no puede vivir dentro
    // de la transacción de Postgres de abajo. Solo se alcanza una vez: el chequeo de idempotencia de
    // arriba corta cualquier llamada repetida antes de llegar aquí.
    tempPassword = generateTempPassword();
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: client.email,
      password: tempPassword,
      email_confirm: true,
    });
    if (authError || !authData.user) {
      throw new Error(`No se pudo crear el usuario dueño: ${authError?.message ?? "sin detalle"}`);
    }
    ownerId = authData.user.id;
  }

  const slug = `${slugify(prospect.name)}-${randomUUID().slice(0, 8)}`;

  const org = await db.transaction(async (tx) => {
    const [newOrg] = await tx.insert(organization).values({ name: prospect.name, slug }).returning();
    if (!newOrg) throw new Error("insert de organization no devolvió fila");

    if (isNewUser) {
      await tx.insert(profile).values({ id: ownerId, email: client.email, fullName: client.fullName });
    }
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

  // Invitación por WhatsApp: solo tiene sentido cuando se crea la cuenta por primera vez — si el
  // cliente ya tenía acceso por otra empresa, ya sabe entrar y no le mandamos una segunda
  // contraseña temporal que además invalidaría la primera.
  let whatsapp = null;
  if (isNewUser) {
    const loginUrl = `${
      process.env.NEXT_PUBLIC_IMPROVEMENT_URL || "https://improvement-jotapuntoces-projects.vercel.app"
    }/login`;
    const body =
      `Hola ${client.fullName} 👋 Ya tienes acceso a Improvement, el panel de ${prospect.name}.\n\n` +
      `Entra aquí: ${loginUrl}\n` +
      `Usuario: ${client.email}\n` +
      `Contraseña temporal: ${tempPassword}\n\n` +
      `Te recomendamos cambiarla la primera vez que entres.`;
    whatsapp = await sendWhatsAppMessage({ to: client.whatsappPhone, body });
  }

  return { organization: org, alreadyProvisioned: false, whatsapp };
}

/**
 * Punto de entrada real como Server Action: guard en el borde + delega en provisionOrganization.
 */
export async function provisionOrganizationAction(prospectId) {
  await requirePlatformAdmin();
  return provisionOrganization(prospectId);
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
