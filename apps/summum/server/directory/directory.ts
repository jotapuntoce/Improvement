// El directorio público de Summum: barcos y afiliadas con opt-in propio y un Sello aprobado vigente o en
// riesgo. Las lecturas corren sin sesión, así que devuelven solo columnas públicas: nunca un id interno,
// un monto ni una nota. El opt-in del barco lo guarda su dueño (assertBarcoOwner).
import { and, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { affiliate, barcoListing, organization, sealEvaluation } from "@jotapuntoce/db/schema";
import { assertBarcoOwner } from "../auth/guard.ts";
import type { Result } from "../result.ts";

const INVALIDO = "Revisa los datos del formulario.";

export interface DirectoryEntry {
  kind: "barco" | "afiliada";
  displayName: string;
  slug: string;
  publicBio: string | null;
  score: number;
  vigencia: "vigente" | "en_riesgo";
  approvedAt: Date | null;
}

const evalCols = {
  score: sealEvaluation.score,
  vigencia: sealEvaluation.vigencia,
  approvedAt: sealEvaluation.approvedAt,
};

/** Se queda con la evaluación más reciente de cada sujeto y solo si sigue vigente o en riesgo. */
function latestPublic<T extends { key: string; vigencia: string | null }>(rows: T[]) {
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (seen.has(r.key)) return false;
    seen.add(r.key);
    return r.vigencia === "vigente" || r.vigencia === "en_riesgo";
  });
}

export async function listDirectory(): Promise<DirectoryEntry[]> {
  const approved = eq(sealEvaluation.approvalStatus, "aprobada");
  const [affiliates, barcos] = await Promise.all([
    db
      .select({ key: affiliate.publicSlug, displayName: affiliate.displayName, slug: affiliate.publicSlug, publicBio: affiliate.publicBio, ...evalCols })
      .from(sealEvaluation)
      .innerJoin(affiliate, eq(affiliate.id, sealEvaluation.affiliateId))
      .where(and(approved, eq(affiliate.directoryOptIn, true)))
      .orderBy(desc(sealEvaluation.approvedAt)),
    db
      .select({ key: barcoListing.publicSlug, displayName: organization.name, slug: barcoListing.publicSlug, publicBio: barcoListing.publicBio, ...evalCols })
      .from(sealEvaluation)
      .innerJoin(barcoListing, eq(barcoListing.barcoOrgId, sealEvaluation.barcoOrgId))
      .innerJoin(organization, eq(organization.id, sealEvaluation.barcoOrgId))
      .where(and(approved, eq(barcoListing.optIn, true)))
      .orderBy(desc(sealEvaluation.approvedAt)),
  ]);
  const entries = [
    ...latestPublic(affiliates).map(({ key: _k, ...r }) => ({ ...r, kind: "afiliada" as const })),
    ...latestPublic(barcos).map(({ key: _k, ...r }) => ({ ...r, kind: "barco" as const })),
  ] as DirectoryEntry[];
  return entries.sort((a, b) => a.displayName.localeCompare(b.displayName, "es"));
}

// ponytail: arma el directorio entero para una ficha; consulta por slug cuando pase de unos cientos.
export async function getDirectoryEntry(slug: string): Promise<DirectoryEntry | null> {
  return (await listDirectory()).find((e) => e.slug === slug) ?? null;
}

/** Lo que el dueño del barco ve de su Sello y su ficha. */
export async function getBarcoDirectory(userId: string, barcoId: string) {
  await assertBarcoOwner(userId, barcoId);
  const [[listing], [seal]] = await Promise.all([
    db.select().from(barcoListing).where(eq(barcoListing.barcoOrgId, barcoId)),
    db
      .select({ ...evalCols, approvalStatus: sealEvaluation.approvalStatus })
      .from(sealEvaluation)
      .where(and(eq(sealEvaluation.barcoOrgId, barcoId), ne(sealEvaluation.approvalStatus, "rechazada")))
      .orderBy(desc(sealEvaluation.createdAt))
      .limit(1),
  ]);
  return { listing: listing ?? null, seal: seal ?? null };
}

const listingSchema = z.object({
  publicSlug: z.string().regex(/^[a-z0-9-]{3,60}$/),
  publicBio: z.string().max(1000).nullable(),
  optIn: z.boolean(),
});

export async function saveBarcoListing(userId: string, barcoId: string, input: unknown): Promise<Result<true>> {
  await assertBarcoOwner(userId, barcoId);
  const parsed = listingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: INVALIDO };
  const { publicSlug } = parsed.data;
  const [[takenByAffiliate], [takenByBarco]] = await Promise.all([
    db.select({ slug: affiliate.publicSlug }).from(affiliate).where(eq(affiliate.publicSlug, publicSlug)).limit(1),
    db
      .select({ slug: barcoListing.publicSlug })
      .from(barcoListing)
      .where(and(eq(barcoListing.publicSlug, publicSlug), ne(barcoListing.barcoOrgId, barcoId)))
      .limit(1),
  ]);
  if (takenByAffiliate || takenByBarco) return { ok: false, error: INVALIDO };
  await db
    .insert(barcoListing)
    .values({ barcoOrgId: barcoId, ...parsed.data })
    .onConflictDoUpdate({ target: barcoListing.barcoOrgId, set: { ...parsed.data, updatedAt: new Date() } });
  return { ok: true, data: true };
}
