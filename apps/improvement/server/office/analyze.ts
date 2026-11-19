// Fotos del local → borrador de oficina. La IA solo propone: nada cambia hasta que el dueño confirma
// (paso de confirmación). Un org tiene a lo más un `draft`; analizar de nuevo lo reemplaza.
import { and, eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { area, officePlan, organization } from "@jotapuntoce/db/schema";
import { INDUSTRIES, industryAreas } from "@jotapuntoce/ui/building/industries.ts";
import { findOwnerMembership } from "../auth/guard.ts";
import { generateStructured, type SuggestionProvider } from "../ai/gateway.ts";
import { buildOfficePrompt, OFFICE_SYSTEM_PROMPT } from "../ai/prompts/office.ts";
import { readSpacePhotos, type SpaceStorage } from "./photos.ts";
import { officeProposalSchema } from "./proposal.ts";

type Failure = { ok: false; error: { code: string; message: string } };

export async function analyzeSpace(
  userId: string,
  orgId: string,
  paths: string[],
  deps: { storage?: SpaceStorage; provider?: SuggestionProvider } = {},
): Promise<{ ok: true; data: { planId: string } } | Failure> {
  if (!(await findOwnerMembership(userId, orgId))) return { ok: false, error: { code: "NOT_FOUND", message: "No encontrado." } };

  const photos = await readSpacePhotos(userId, orgId, paths, deps.storage);
  if (!photos.ok) return photos;

  const [[org], areas] = await Promise.all([
    db
      .select({ industry: organization.industry, industryCustom: organization.industryCustom })
      .from(organization)
      .where(eq(organization.id, orgId)),
    db.select({ name: area.name }).from(area).where(eq(area.orgId, orgId)),
  ]);
  const industry = org?.industry ?? null;

  const result = await generateStructured({
    orgId,
    purpose: "oficina",
    category: "oficina",
    system: OFFICE_SYSTEM_PROMPT,
    prompt: buildOfficePrompt({
      industryLabel: INDUSTRIES.find((i) => i.id === industry)?.label ?? null,
      industryCustom: org?.industryCustom ?? null,
      templateAreas: industryAreas(industry),
      existingAreas: areas.map((a) => a.name),
    }),
    schema: officeProposalSchema,
    toText: (p) => `Propuesta de oficina con ${p.areas.length} áreas`,
    basedOn: { fotos: paths },
    images: photos.data,
    maxOutputTokens: 2048,
    provider: deps.provider,
  });
  if (!result.ok) return result;

  const proposal = result.data.parsed;
  const planId = await db.transaction(async (tx) => {
    await tx.delete(officePlan).where(and(eq(officePlan.orgId, orgId), eq(officePlan.status, "draft")));
    const [row] = await tx
      .insert(officePlan)
      .values({ orgId, status: "draft", sourcePhotos: paths, proposal, logo: proposal.logo, createdBy: userId })
      .returning({ id: officePlan.id });
    if (!row) throw new Error("insert de office_plan no devolvió fila");
    return row.id;
  });
  return { ok: true, data: { planId } };
}
