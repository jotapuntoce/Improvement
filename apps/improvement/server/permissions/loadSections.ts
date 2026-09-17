// Las secciones que una persona ve en SU empresa, con el nombre que el dueño les puso.
//
// Dos filtros distintos que se ven parecido pero no lo son: `hidden` es del dueño ("esta empresa no
// usa PowerUps") y aplica a todos; el alcance `ninguno` es de la persona. Los dos terminan en lo
// mismo — la sección no se dibuja — pero por razones distintas.
import { eq } from "drizzle-orm";
import { db } from "@jotapuntoce/db";
import { organization, permissionType } from "@jotapuntoce/db/schema";
import { assertMembership } from "../auth/guard.ts";
import { scopeFor, SECTIONS } from "./sections.ts";

export interface VisibleSection {
  slug: string;
  label: string;
  hint: string;
}

interface SectionOverride {
  label?: string;
  hidden?: boolean;
}

export async function loadVisibleSections(userId: string, orgId: string): Promise<VisibleSection[]> {
  const memberRow = await assertMembership(userId, orgId);

  const [org] = await db
    .select({ sectionLabels: organization.sectionLabels })
    .from(organization)
    .where(eq(organization.id, orgId))
    .limit(1);
  const overrides = (org?.sectionLabels ?? {}) as Record<string, SectionOverride>;

  // Los grants se resuelven UNA sola vez aquí, no una por sección: resolveSection haría la misma
  // consulta a membership+permission_type cinco veces por carga del dashboard, todas preguntando lo
  // mismo. scopeFor es pura (server/permissions/sections.ts) — aquí solo se le da de comer, las dos
  // reglas no negociables (dueño ve todo, sin tipo no ve nada) siguen viviendo únicamente ahí.
  let grants: unknown = null;
  if (memberRow.role !== "owner" && memberRow.permissionTypeId) {
    const [type] = await db
      .select({ grants: permissionType.grants })
      .from(permissionType)
      .where(eq(permissionType.id, memberRow.permissionTypeId))
      .limit(1);
    grants = type?.grants ?? null;
  }

  const visibles: VisibleSection[] = [];
  for (const section of SECTIONS) {
    const override = overrides[section.slug] ?? {};
    if (override.hidden) continue;
    if (scopeFor(memberRow.role, grants, section.slug) === "ninguno") continue;

    visibles.push({
      slug: section.slug,
      label: override.label?.trim() || section.label,
      hint: section.hint,
    });
  }

  return visibles;
}
