// Tema propio del org (organization.theme) y giro libre (organization.industry_custom). El contraste
// AA lo decide packages/ui/src/theme.ts; aquí solo se valida la forma y quién puede escribir.
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { organization } from "@jotapuntoce/db/schema";
import { themeIssues, type OrgTheme, type ThemeIssue } from "@jotapuntoce/ui/theme.ts";
import { findMembership, findOwnerMembership } from "../auth/guard.ts";

const hex = z.string().regex(/^#[0-9a-f]{6}$/i);

/** Lo reusa la propuesta de la oficina (server/office/proposal.ts). */
export const orgThemeSchema = z.object({ bg: hex, textPrimary: hex, accent1: hex, accent2: hex });

type ThemeError =
  | { code: "NOT_FOUND" | "VALIDATION_ERROR"; message: string }
  | { code: "CONTRAST"; message: string; issues: ThemeIssue[] };

const notOwner = { code: "NOT_FOUND", message: "La empresa no existe." } as const;

/**
 * WHEN el tema no pasa AA THE SYSTEM SHALL devolver CONTRAST sin escribir. `null` borra el tema
 * (vuelven los tokens base).
 */
export async function setOrgTheme(
  userId: string,
  orgId: string,
  input: unknown,
): Promise<{ ok: true; data: OrgTheme | null } | { ok: false; error: ThemeError }> {
  if (!(await findOwnerMembership(userId, orgId))) return { ok: false, error: notOwner };

  if (input === null) {
    await db.update(organization).set({ theme: null, updatedAt: new Date() }).where(eq(organization.id, orgId));
    return { ok: true, data: null };
  }

  const parsed = orgThemeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "Cada color debe ser un hex #rrggbb." } };
  }

  const issues = themeIssues(parsed.data);
  if (issues.length > 0) {
    const peor = issues.reduce((a, b) => (a.ratio <= b.ratio ? a : b));
    return {
      ok: false,
      error: { code: "CONTRAST", message: `Contraste ${peor.ratio.toFixed(2)}:1 — mínimo 4.5:1`, issues },
    };
  }

  await db.update(organization).set({ theme: parsed.data, updatedAt: new Date() }).where(eq(organization.id, orgId));
  return { ok: true, data: parsed.data };
}

const industryCustomSchema = z.string().trim().min(1).max(80).nullable();

/** El giro libre cuando el giro es "otro": 1-80 caracteres recortados, o `null` para borrarlo. */
export async function setIndustryCustom(
  userId: string,
  orgId: string,
  text: string | null,
): Promise<{ ok: true; data: string | null } | { ok: false; error: ThemeError }> {
  if (!(await findOwnerMembership(userId, orgId))) return { ok: false, error: notOwner };

  const parsed = industryCustomSchema.safeParse(text);
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "El giro va de 1 a 80 caracteres." } };
  }

  await db
    .update(organization)
    .set({ industryCustom: parsed.data, updatedAt: new Date() })
    .where(eq(organization.id, orgId));
  return { ok: true, data: parsed.data };
}

/** Lo que la pantalla /[org]/marca muestra; `null` si quien pregunta no es el dueño. */
export async function loadBrand(
  userId: string,
  orgId: string,
): Promise<{ industry: string | null; industryCustom: string | null; theme: OrgTheme | null } | null> {
  if (!(await findOwnerMembership(userId, orgId))) return null;
  const [row] = await db
    .select({ industry: organization.industry, industryCustom: organization.industryCustom, theme: organization.theme })
    .from(organization)
    .where(eq(organization.id, orgId))
    .limit(1);
  if (!row) return null;
  const theme = orgThemeSchema.safeParse(row.theme);
  return { industry: row.industry, industryCustom: row.industryCustom, theme: theme.success ? theme.data : null };
}

/** El tema del org para el layout; `null` sin membresía, sin tema o con un tema que no valida. Nunca lanza. */
export async function loadOrgTheme(userId: string, orgId: string): Promise<OrgTheme | null> {
  try {
    if (!(await findMembership(userId, orgId))) return null;
    const [row] = await db
      .select({ theme: organization.theme })
      .from(organization)
      .where(eq(organization.id, orgId))
      .limit(1);
    const parsed = orgThemeSchema.safeParse(row?.theme);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
