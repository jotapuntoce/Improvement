// La marca del negocio. Sus colores entran como variables CSS que pisan los tokens dentro del shell
// del org; ningún hex se escribe en componentes.
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { orgBrand } from "@jotapuntoce/db/schema";
import { assertMembership, findOwnerMembership } from "../auth/guard.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
export interface Brand { logoUrl: string | null; coverUrl: string | null; primaryColor: string | null; secondaryColor: string | null }

const EMPTY: Brand = { logoUrl: null, coverUrl: null, primaryColor: null, secondaryColor: null };

/** Valor inicial de los selectores de color cuando el negocio aún no elige: el verde de Improvement
 *  (--brand-improvement-1/2 en tokens.css). Un <input type="color"> exige hex, no var(). */
export const DEFAULT_PICKER = { primary: "#1fbe79", secondary: "#98e33b" } as const;

export async function getBrand(userId: string, orgId: string): Promise<Brand> {
  await assertMembership(userId, orgId);
  const [row] = await db.select().from(orgBrand).where(eq(orgBrand.orgId, orgId));
  return row ? { logoUrl: row.logoUrl, coverUrl: row.coverUrl, primaryColor: row.primaryColor, secondaryColor: row.secondaryColor } : EMPTY;
}

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "El color va como #RRGGBB.");
const httpsUrl = z.url({ protocol: /^https?$/, error: "La dirección debe empezar con https://." });
const brandSchema = z.object({
  logoUrl: httpsUrl.nullish(),
  coverUrl: httpsUrl.nullish(),
  primaryColor: hex.nullish(),
  secondaryColor: hex.nullish(),
});

export async function saveBrand(userId: string, orgId: string, input: unknown): Promise<Result<true>> {
  if (!(await findOwnerMembership(userId, orgId))) return { ok: false, error: { code: "FORBIDDEN", message: "Solo el dueño cambia la marca." } };
  const parsed = brandSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Datos inválidos." } };
  // Solo se tocan las llaves que llegaron: guardar el color no borra el logo.
  const values = Object.fromEntries(Object.entries(parsed.data).map(([k, v]) => [k, v ?? null]));
  await db.insert(orgBrand).values({ orgId, ...values }).onConflictDoUpdate({ target: orgBrand.orgId, set: { ...values, updatedAt: new Date() } });
  return { ok: true, data: true };
}

/** Variables CSS del shell del org. Solo los colores que el dueño definió; lo demás sigue los tokens. */
export function brandStyle(brand: Brand): Record<string, string> {
  const style: Record<string, string> = {};
  if (brand.primaryColor) style["--accent-1"] = brand.primaryColor;
  if (brand.secondaryColor) style["--accent-2"] = brand.secondaryColor;
  return style;
}
