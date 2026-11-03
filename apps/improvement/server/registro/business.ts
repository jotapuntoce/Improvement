// Alta de un negocio por su propio dueño (registro abierto). Perfil, organización, membresía de
// dueño y perfil de negocio en una transacción; las apps base se siembran al final. "Solicitar
// empresa" (company_request) queda para lo que Jotapuntoce construye a la medida.
import { z } from "zod";
import { db } from "@jotapuntoce/db";
import { membership, organization, orgProfile, profile, TEAM_SIZES } from "@jotapuntoce/db/schema";
import { INDUSTRIES } from "@jotapuntoce/ui/building/industries.ts";
import { ensureOrgApps } from "../apps/catalog.ts";
import { slugKey } from "../apps/custom.ts";
import { templateFor } from "../apps/templates.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

const Input = z.object({
  fullName: z.string().trim().min(2, "Escribe tu nombre.").max(80),
  name: z.string().trim().min(2, "Escribe el nombre del negocio.").max(80),
  industry: z.enum(INDUSTRIES.map((i) => i.id), "Elige un giro."),
  teamSize: z.enum(TEAM_SIZES, "Elige cuántos son."),
  city: z.string().trim().min(2, "Escribe tu ciudad.").max(60),
});

/** `user` sale de la sesión (getSessionUser), nunca del formulario. */
export async function createOwnBusiness(user: { id: string; email: string }, input: unknown): Promise<Result<{ orgId: string }>> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Datos inválidos." } };
  const { fullName, name, industry, teamSize, city } = parsed.data;
  const orgId = await db.transaction(async (tx) => {
    await tx.insert(profile).values({ id: user.id, email: user.email, fullName }).onConflictDoUpdate({ target: profile.id, set: { fullName } });
    const [org] = await tx
      .insert(organization)
      .values({ name, slug: `${slugKey(name) || "negocio"}-${crypto.randomUUID().slice(0, 8)}`, industry, kind: "barco" })
      .returning({ id: organization.id });
    await tx.insert(membership).values({ userId: user.id, orgId: org!.id, role: "owner", acceptedAt: new Date() });
    await tx.insert(orgProfile).values({ orgId: org!.id, teamSize, city, templateKey: templateFor(industry).key });
    return org!.id;
  });
  await ensureOrgApps(orgId);
  return { ok: true, data: { orgId } };
}
