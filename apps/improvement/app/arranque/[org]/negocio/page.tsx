// Arranque, paso 1 (segunda parte): ya existe la empresa; ahora Improvement conoce el negocio completo
// — cómo está consolidado, su proceso, quién lleva cada área y los roles. Va a la memoria del dueño.
import { notFound, redirect } from "next/navigation";
import { getSessionUserId, requireOrgMembership } from "@/server/auth/guard.ts";
import { loadArmado } from "@/server/registro/onboarding.ts";
import { NEGOCIO_QUESTIONS, saveInterview } from "@/server/owner/diagnostico.ts";
import { prescribeStructure } from "@/server/owner/estructura.ts";
import { Entrevista } from "@/components/arranque/Entrevista.tsx";
import { ArranqueShell } from "../../ArranqueShell.tsx";

export default async function ArranqueNegocio({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ error?: string }> }) {
  const { org: orgId } = await params;
  const { error } = await searchParams;
  const me = await requireOrgMembership(orgId);
  const armado = await loadArmado(me.userId, orgId);
  if (!armado.ok) notFound();

  async function contar(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    const r = await saveInterview(actor, orgId, "negocio", Object.fromEntries(formData));
    if (!r.ok) redirect(`/arranque/${orgId}/negocio?error=${encodeURIComponent(r.error.message)}`);
    // Sin IA: lo que su empresa necesita por dentro según su etapa y lo que acaba de contar.
    await prescribeStructure(actor, orgId);
    redirect(`/arranque/${orgId}/marca`);
  }

  return (
    <ArranqueShell paso={1} armado={armado.data}>
      <Entrevista action={contar} questions={NEGOCIO_QUESTIONS} label="Cómo es tu negocio" finish="Listo, sigamos" pendingLabel="Guardando…" error={error} />
    </ArranqueShell>
  );
}
