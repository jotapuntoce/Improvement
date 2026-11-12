// Arranque, paso 1 (segunda parte): antes que cualquier pantalla, lo que más le duele al dueño y lo que
// carga. Con eso Improvement arma su plan para quitarle carga (server/owner/alivio.ts).
import { notFound, redirect } from "next/navigation";
import { getSessionUserId, requireOrgMembership } from "@/server/auth/guard.ts";
import { loadArmado } from "@/server/registro/onboarding.ts";
import { DOLOR_QUESTIONS, saveInterview } from "@/server/owner/diagnostico.ts";
import { prescribeRelief } from "@/server/owner/alivio.ts";
import { Entrevista } from "@/components/arranque/Entrevista.tsx";
import { ArranqueShell } from "../../ArranqueShell.tsx";

export default async function ArranqueDolor({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ error?: string }> }) {
  const { org: orgId } = await params;
  const { error } = await searchParams;
  const me = await requireOrgMembership(orgId);
  const armado = await loadArmado(me.userId, orgId);
  if (!armado.ok) notFound();

  async function contar(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    const r = await saveInterview(actor, orgId, "dolor", Object.fromEntries(formData));
    if (!r.ok) redirect(`/arranque/${orgId}/dolor?error=${encodeURIComponent(r.error.message)}`);
    await prescribeRelief(actor, orgId);
    redirect(`/arranque/${orgId}/negocio`);
  }

  return (
    <ArranqueShell paso={1} armado={armado.data}>
      <Entrevista action={contar} questions={DOLOR_QUESTIONS} label="Lo que más te duele" finish="Esto es lo que me pesa" pendingLabel="Guardando…" error={error} />
    </ArranqueShell>
  );
}
