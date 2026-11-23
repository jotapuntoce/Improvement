// La oficina 2D del org: el plano confirmado para quien tiene la sección y, para el dueño, las fotos
// del local y la revisión del borrador que propone la IA. Nada cambia hasta "Confirmar oficina".
import { Office } from "@jotapuntoce/ui/building/Office.tsx";
import { requireSection } from "@/server/auth/guard.ts";
import { loadOffice, loadOfficeDraft } from "@/server/office/loadOffice.ts";
import type { OfficeProposal } from "@/server/office/proposal.ts";
import { confirmarOficina, subirFotos } from "./actions.ts";

export default async function OficinaPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { org: orgId } = await params;
  const { error } = await searchParams;
  const { membership } = await requireSection(orgId, "oficina");
  const esDueno = membership.role === "owner";
  const [office, draft] = await Promise.all([
    loadOffice(membership.userId, orgId),
    esDueno ? loadOfficeDraft(membership.userId, orgId) : null,
  ]);
  const proposal = draft ? (draft.proposal as OfficeProposal) : null;

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-6">
      <h1 className="text-2xl font-semibold">Oficina</h1>
      {error && <p role="alert">{error}</p>}

      {office ? (
        <section aria-labelledby="plano">
          <h2 id="plano" className="text-lg font-semibold">
            Tu plano
          </h2>
          <Office orgName="tu empresa" zones={office.zones} people={office.people} />
        </section>
      ) : (
        <p>Tu empresa todavía no tiene un plano confirmado.</p>
      )}

      {esDueno && (
        <section aria-labelledby="fotos" className="space-y-3">
          <h2 id="fotos" className="text-lg font-semibold">
            Fotos de tu espacio
          </h2>
          <p>Sube de 1 a 6 fotos (JPG, PNG o WebP, hasta 5 MB). La IA solo propone; tú confirmas.</p>
          <form action={subirFotos} className="space-y-3">
            <input type="hidden" name="orgId" value={orgId} />
            <label className="block">
              Fotos del local
              <input type="file" name="fotos" multiple accept="image/jpeg,image/png,image/webp" className="block" />
            </label>
            <button type="submit" className="jpc-back-link">
              Analizar mi espacio
            </button>
          </form>
        </section>
      )}

      {draft && proposal && (
        <section aria-labelledby="revision" className="space-y-4">
          <h2 id="revision" className="text-lg font-semibold">
            Revisa la propuesta
          </h2>
          <form action={confirmarOficina} className="space-y-6">
            <input type="hidden" name="orgId" value={orgId} />
            <input type="hidden" name="planId" value={draft.id} />
            <input type="hidden" name="areas" value={proposal.areas.length} />
            <input type="hidden" name="logo" value={JSON.stringify(proposal.logo)} />
            <input type="hidden" name="notes" value={proposal.notes} />
            {proposal.areas.map((a, i) => (
              <fieldset key={i} className="space-y-2">
                <legend>Área {i + 1}</legend>
                <label className="block">
                  Nombre del área {i + 1}
                  <input name={`area-${i}-name`} defaultValue={a.name} maxLength={40} required className="block" />
                </label>
                <label className="block">
                  Color del área {i + 1}
                  <input type="color" name={`area-${i}-color`} defaultValue={a.color} className="block" />
                </label>
                <label className="block">
                  Puestos del área {i + 1} (uno por línea)
                  <textarea name={`area-${i}-seats`} defaultValue={a.seats.map((s) => s.title).join("\n")} rows={3} className="block" />
                </label>
              </fieldset>
            ))}
            {proposal.theme && (
              <fieldset className="space-y-2">
                <legend>Tema propuesto</legend>
                <input type="hidden" name="theme" value={JSON.stringify(proposal.theme)} />
                <p>
                  Fondo {proposal.theme.bg} · Texto {proposal.theme.textPrimary} · Acentos {proposal.theme.accent1} y{" "}
                  {proposal.theme.accent2}. Se aplica solo si pasa el contraste mínimo.
                </p>
                <label className="block">
                  <input type="checkbox" name="aplicarTema" value="si" defaultChecked /> Aplicar el tema propuesto
                </label>
              </fieldset>
            )}
            <button type="submit" className="jpc-back-link">
              Confirmar oficina
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
