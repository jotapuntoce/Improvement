// Las secciones de Dirección que una persona ve en su empresa, para el hub y el layout de [org].
//
// Nunca lanza: el layout de TODAS las rutas [org] lo llama, incluidas las de platform admin sin
// membresía. Por eso valida el uuid antes de findMembership (que sí lanzaría con un id inválido) y
// responde [] en vez del 404 de assertMembership.
import { z } from "zod";
import { findMembership } from "../auth/guard.ts";
import { loadVisibleSections, type VisibleSection } from "../permissions/loadSections.ts";
import { DIRECCION_SLUGS } from "../permissions/sections.ts";

export async function loadDireccionNav(userId: string, orgId: string): Promise<VisibleSection[]> {
  if (!z.uuid().safeParse(orgId).success) return [];
  try {
    if (!(await findMembership(userId, orgId))) return [];
    const visibles = await loadVisibleSections(userId, orgId);
    const slugs: readonly string[] = DIRECCION_SLUGS;
    return visibles.filter((s) => slugs.includes(s.slug));
  } catch {
    return [];
  }
}
