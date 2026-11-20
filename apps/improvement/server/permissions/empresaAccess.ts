// La membresía si la persona tiene la sección con alcance `empresa` (el dueño siempre); si no, null.
// Nunca lanza: resolveSection sí lanza sin membresía, por eso se busca la membresía antes.
import { z } from "zod";
import { findMembership, resolveSection } from "../auth/guard.ts";
import type { SectionSlug } from "./sections.ts";

export async function empresaAccess(userId: string, orgId: string, slug: SectionSlug) {
  if (!z.uuid().safeParse(orgId).success || !(await findMembership(userId, orgId))) return null;
  const { membership, scope } = await resolveSection(userId, orgId, slug);
  return scope === "empresa" ? membership : null;
}
