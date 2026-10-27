// Propuestas de especialista para los socios: firman dos y el dueño del barco decide al final en Improvement.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDockOwnership } from "@/server/auth/guard.ts";
import { approveProposal, listProposals, rejectProposal } from "@/server/sinapsis/approvals.ts";
import { errorCode, errorMessage } from "@/server/error-codes.ts";

const STATUS_LABEL = { propuesta: "Por firmar", aprobada_socios: "Firmada por los socios", activa: "Activa", rechazada: "Rechazada" } as const;
const SEVERITY_LABEL: Record<number, string> = { 1: "Leve", 2: "Moderada", 3: "Crítica" };

export default async function SinapsisPage({ params, searchParams }: { params: Promise<{ muelleId: string }>; searchParams: Promise<{ error?: string }> }) {
  const { muelleId } = await params;
  const { error } = await searchParams;
  const base = `/muelle/${muelleId}/sinapsis`;
  const { userId } = await requireDockOwnership(muelleId, base);
  const proposals = await listProposals(userId, muelleId);

  async function decidir(formData: FormData) {
    "use server";
    const { userId: actor } = await requireDockOwnership(muelleId);
    const id = formData.get("proposalId")?.toString() ?? "";
    const r = formData.get("decision") === "aprobar" ? await approveProposal(actor, id) : await rejectProposal(actor, id);
    if (!r.ok) redirect(`${base}?error=${errorCode(r.error)}`);
    revalidatePath(base);
    redirect(base);
  }

  return (
    <main>
      <h1>Sinapsis</h1>
      <p>El dueño del negocio decide al final.</p>
      {errorMessage(error) && <p className="error">{errorMessage(error)}</p>}
      <ul>
        {proposals.map((p) => (
          <li key={p.id}>
            <strong>{p.affiliateName}</strong> para {p.barcoName}: {p.needTitle} ({SEVERITY_LABEL[p.needSeverity] ?? p.needSeverity}) · Sello{" "}
            {p.sealScore ?? "sin Sello"} · Afinidad {p.matchScore} % · {STATUS_LABEL[p.status]}
            {p.firstPartnerEmail && <em> — firmó {p.firstPartnerId === userId ? "tú" : p.firstPartnerEmail}</em>}
            {(p.status === "propuesta" || p.status === "aprobada_socios") && (
              <form action={decidir} style={{ display: "inline-flex" }}>
                <input type="hidden" name="proposalId" value={p.id} />
                {p.status === "propuesta" && p.firstPartnerId !== userId && <button name="decision" value="aprobar">Aprobar</button>}
                <button name="decision" value="rechazar">Rechazar</button>
              </form>
            )}
          </li>
        ))}
        {proposals.length === 0 && <li>No hay propuestas de especialista.</li>}
      </ul>
    </main>
  );
}
