// La parte de Summum que usa el DUEÑO DEL BARCO.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireBarcoOwnership } from "@/server/auth/guard.ts";
import { getBarcoDirectory, saveBarcoListing } from "@/server/directory/directory.ts";
import { listBarcoLedgerForOwner } from "@/server/money/ledger.ts";
import { getAccountStatus } from "@/server/stripe/connect.ts";
import { Money } from "@/components/Money.tsx";
import { errorCode, errorMessage } from "@/server/error-codes.ts";
import { connect, sale } from "./actions.ts";

const SEAL_LABEL: Record<string, string> = {
  vigente: "Vigente",
  en_riesgo: "En riesgo",
  reevaluacion: "En reevaluación",
  suspendido: "Suspendido",
};


export default async function BarcoPage({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ error?: string }> }) {
  const { orgId } = await params;
  const { error } = await searchParams;
  const { userId } = await requireBarcoOwnership(orgId, `/barco/${orgId}`);
  const account = await getAccountStatus(userId, orgId);
  const rows = await listBarcoLedgerForOwner(userId, orgId);
  const { listing, seal } = await getBarcoDirectory(userId, orgId);
  const sealText = !seal
    ? "Sin evaluación del Sello todavía."
    : seal.approvalStatus === "pendiente"
      ? `Evaluación pendiente de firma · Puntaje ${seal.score}`
      : `${SEAL_LABEL[seal.vigencia ?? ""] ?? "Sin vigencia"} · Puntaje ${seal.score}`;

  async function guardarFicha(formData: FormData) {
    "use server";
    const base = `/barco/${orgId}`;
    const { userId: actor } = await requireBarcoOwnership(orgId);
    const r = await saveBarcoListing(actor, orgId, {
      publicSlug: formData.get("publicSlug")?.toString().trim(),
      publicBio: formData.get("publicBio")?.toString().trim() || null,
      optIn: formData.get("optIn") === "on",
    });
    if (!r.ok) redirect(`${base}?error=${errorCode(r.error)}`);
    revalidatePath(base);
    redirect(base);
  }

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text-primary)", padding: "24px" }}>
      <h1>Cobros</h1>
      {errorMessage(error) && <p className="error">{errorMessage(error)}</p>}
      {!account?.chargesEnabled ? (
        <form action={connect}><input type="hidden" name="orgId" value={orgId} /><button type="submit">Conectar mi cuenta de cobro</button></form>
      ) : (
        <form action={sale}>
          <input type="hidden" name="orgId" value={orgId} />
          <input name="description" placeholder="Concepto" required />
          <input name="amount" type="number" step="0.01" min="1" placeholder="Monto MXN" required />
          <button type="submit">Crear liga de cobro</button>
        </form>
      )}
      <table>
        <thead><tr><th>Fecha</th><th>Monto</th><th>Comisión Summum</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}><td>{r.createdAt.toLocaleDateString("es-MX")}</td><td><Money cents={r.grossCents} currency={r.currency} /></td><td><Money cents={r.summumFeeCents} currency={r.currency} /></td></tr>
          ))}
        </tbody>
      </table>

      <section aria-labelledby="directorio">
        <h2 id="directorio">Directorio</h2>
        <p>Sello Cénit: {sealText}</p>
        <form action={guardarFicha}>
          <label>Liga pública <input name="publicSlug" required pattern="[a-z0-9-]{3,60}" defaultValue={listing?.publicSlug ?? ""} /></label>
          <label>Sobre el negocio <textarea name="publicBio" maxLength={1000} defaultValue={listing?.publicBio ?? ""} /></label>
          <label><input type="checkbox" name="optIn" defaultChecked={listing?.optIn ?? false} /> Aparecer en el directorio</label>
          <button type="submit">Guardar ficha</button>
        </form>
      </section>
    </main>
  );
}
