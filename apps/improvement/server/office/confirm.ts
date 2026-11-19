// Confirmar el borrador de oficina: lo único que convierte la propuesta de la IA en datos reales
// (áreas, puestos, tema y zonas). Todo o nada, en una transacción.
import { and, eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { area, officePlan, officeZone, organization, seat } from "@jotapuntoce/db/schema";
import { industryAreas } from "@jotapuntoce/ui/building/industries.ts";
import { officeLayout, type OfficeZoneLayout } from "@jotapuntoce/ui/building/officeLayout.ts";
import { themeIssues } from "@jotapuntoce/ui/theme.ts";
import { findOwnerMembership } from "../auth/guard.ts";
import { officeProposalSchema } from "./proposal.ts";

type Failure = { ok: false; error: { code: "NOT_FOUND" | "VALIDATION_ERROR"; message: string } };

const normalize = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export async function confirmOfficePlan(
  userId: string,
  orgId: string,
  planId: string,
  edited: unknown,
): Promise<{ ok: true; data: { planId: string; zones: OfficeZoneLayout[]; themeSkipped: boolean } } | Failure> {
  const notFound: Failure = { ok: false, error: { code: "NOT_FOUND", message: "No encontrado." } };
  if (!(await findOwnerMembership(userId, orgId))) return notFound;
  const [plan] = await db
    .select({ id: officePlan.id })
    .from(officePlan)
    .where(and(eq(officePlan.id, planId), eq(officePlan.orgId, orgId), eq(officePlan.status, "draft")));
  if (!plan) return notFound;
  const parsed = officeProposalSchema.safeParse(edited);
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Propuesta inválida." } };
  }
  const proposal = parsed.data;
  const themeOk = proposal.theme !== null && themeIssues(proposal.theme).length === 0;

  const zones = await db.transaction(async (tx) => {
    const [org] = await tx.select({ industry: organization.industry }).from(organization).where(eq(organization.id, orgId));
    const existing = await tx.select({ id: area.id, name: area.name }).from(area).where(eq(area.orgId, orgId));
    const byName = new Map(existing.map((a) => [normalize(a.name), a] as const));

    const placed: { id: string; name: string }[] = [];
    for (const p of proposal.areas) {
      let row = byName.get(normalize(p.name));
      if (!row) {
        const [created] = await tx.insert(area).values({ orgId, name: p.name, color: p.color }).returning({ id: area.id, name: area.name });
        if (!created) throw new Error("insert de area no devolvió fila");
        row = created;
        byName.set(normalize(p.name), row);
      }
      if (!placed.some((a) => a.id === row.id)) placed.push(row);

      const titles = new Set(
        (await tx.select({ title: seat.title }).from(seat).where(and(eq(seat.orgId, orgId), eq(seat.areaId, row.id)))).map((s) => s.title),
      );
      const nuevos = p.seats.map((s, position) => ({ ...s, position })).filter((s) => !titles.has(s.title));
      if (nuevos.length) {
        await tx.insert(seat).values(nuevos.map((s) => ({ orgId, areaId: row.id, title: s.title, roles: [], position: s.position })));
      }
    }

    if (themeOk) await tx.update(organization).set({ theme: proposal.theme }).where(eq(organization.id, orgId));

    await tx.delete(officePlan).where(and(eq(officePlan.orgId, orgId), eq(officePlan.status, "confirmed")));
    await tx
      .update(officePlan)
      .set({ status: "confirmed", proposal, confirmedAt: new Date(), confirmedBy: userId })
      .where(eq(officePlan.id, planId));

    const layout = officeLayout(industryAreas(org?.industry ?? null), placed);
    await tx.insert(officeZone).values(
      layout.map((z) => ({ orgId, planId, areaId: z.areaId ?? null, kind: z.kind, label: z.label, x: z.x, y: z.y, w: z.w, h: z.h })),
    );
    return layout;
  });

  return { ok: true, data: { planId, zones, themeSkipped: proposal.theme !== null && !themeOk } };
}
