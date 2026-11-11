// Arranque, paso 3 (primera parte): el resultado que el dueño espera de su ERP/CRM — qué quiere ver,
// cómo lo quiere ver y qué debe avisarle. Al terminar, Improvement hace su primer análisis del negocio
// con su conocimiento experto; si la IA no responde, el arranque sigue y el análisis queda pendiente.
import { notFound, redirect } from "next/navigation";
import { getSessionUserId, requireOrgMembership } from "@/server/auth/guard.ts";
import { loadArmado } from "@/server/registro/onboarding.ts";
import { analyzeBusiness, RESULTADO_QUESTIONS, saveInterview } from "@/server/owner/diagnostico.ts";
import { Entrevista } from "@/components/arranque/Entrevista.tsx";
import { ArranqueShell } from "../../ArranqueShell.tsx";

export default async function ArranqueResultado({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ error?: string }> }) {
  const { org: orgId } = await params;
  const { error } = await searchParams;
  const me = await requireOrgMembership(orgId);
  const armado = await loadArmado(me.userId, orgId);
  if (!armado.ok) notFound();

  async function esperar(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    const r = await saveInterview(actor, orgId, "resultado", Object.fromEntries(formData));
    if (!r.ok) redirect(`/arranque/${orgId}/resultado?error=${encodeURIComponent(r.error.message)}`);
    const a = await analyzeBusiness(actor, orgId);
    if (!a.ok) console.warn(`[arranque] análisis pendiente para ${orgId}: ${a.error.code}`);
    redirect(`/arranque/${orgId}/propuesta`);
  }

  return (
    <ArranqueShell paso={3} armado={armado.data}>
      <Entrevista action={esperar} questions={RESULTADO_QUESTIONS} label="Lo que esperas de tu Improvement"
        finish="Analiza mi negocio" pendingLabel="Improvement está analizando tu negocio…" error={error} />
    </ArranqueShell>
  );
}
