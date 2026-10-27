// Referidos: tu enlace, tus barcos referidos y lo devengado. Los socios del muelle además devengan al
// cargar, proponen y aprueban atribuciones (dos firmas) y ven el reporte del muelle. Aquí no se paga nada.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Money } from "@/components/Money.tsx";
import { env } from "@/lib/env.ts";
import { getSessionUserId, requireDockOwnership } from "@/server/auth/guard.ts";
import { listDockBarcos } from "@/server/barcos/list.ts";
import { accrueCommissions, approveAttribution, ensureReferralLink, proposeAttribution, referralReport } from "@/server/referrals/referrals.ts";
import { errorCode, errorMessage } from "@/server/error-codes.ts";
import type { Result } from "@/server/result.ts";

function done(base: string, r: Result<unknown>): never {
  if (r.ok) {
    revalidatePath(base);
    redirect(base);
  }
  redirect(`${base}?error=${errorCode(r.error)}`);
}

export default async function ReferidosPage({ params, searchParams }: { params: Promise<{ muelleId: string }>; searchParams: Promise<{ error?: string }> }) {
  const { muelleId } = await params;
  const { error } = await searchParams;
  const base = `/red/${muelleId}/referidos`;
  const userId = await getSessionUserId();
  if (!userId) redirect(`/login?returnTo=${encodeURIComponent(base)}`);
  const link = await ensureReferralLink(userId, muelleId);
  const first = await referralReport(userId, muelleId);
  if (first.isDockOwner) await accrueCommissions(muelleId);
  const report = first.isDockOwner ? await referralReport(userId, muelleId) : first;
  const barcos = report.isDockOwner ? await listDockBarcos(userId, muelleId) : [];
  const url = `${env.NEXT_PUBLIC_SUMMUM_URL ?? ""}/r/${link.code}`;

  async function proponer(formData: FormData) {
    "use server";
    const { userId: actor } = await requireDockOwnership(muelleId);
    done(
      base,
      await proposeAttribution(actor, muelleId, {
        barcoOrgId: formData.get("barcoOrgId")?.toString(),
        code: formData.get("code")?.toString(),
        shareBps: Math.round(Number(formData.get("sharePercent") ?? 0) * 100),
        journeyMonths: formData.get("journeyMonths")?.toString(),
        startsAt: formData.get("startsAt")?.toString(),
      }),
    );
  }

  async function aprobar(formData: FormData) {
    "use server";
    const { userId: actor } = await requireDockOwnership(muelleId);
    done(base, await approveAttribution(actor, formData.get("attributionId")?.toString() ?? ""));
  }

  return (
    <main style={{ padding: "24px" }}>
      <h1>Referidos</h1>
      {errorMessage(error) && <p className="error">{errorMessage(error)}</p>}
      <p>
        Tu enlace: <a href={url}>{url}</a>
      </p>

      <h2>{report.isDockOwner ? "Atribuciones del muelle" : "Tus barcos referidos"}</h2>
      {report.isDockOwner && <p>Devengado, no pagado</p>}
      <ul>
        {report.attributions.map((a) => (
          <li key={a.id}>
            {a.barcoName} · {a.shareBps / 100}% por {a.journeyMonths} meses · <Money cents={a.accruedCents} />
            {a.approved ? " · Aprobada" : " · Pendiente de la otra firma"}
            {report.isDockOwner && !a.approved && (
              <form action={aprobar} style={{ display: "inline-flex" }}>
                <input type="hidden" name="attributionId" value={a.id} />
                <button type="submit">Aprobar</button>
              </form>
            )}
          </li>
        ))}
        {report.attributions.length === 0 && <li>Todavía no hay barcos referidos.</li>}
      </ul>
      <p>
        Total devengado: <Money cents={report.totalCents} />
      </p>

      {report.isDockOwner && (
        <form action={proponer}>
          <h2>Proponer atribución</h2>
          <label>
            Barco
            <select name="barcoOrgId" required>
              {barcos.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label>Código del enlace <input name="code" required maxLength={64} /></label>
          <label>Parte de la comisión (%) <input name="sharePercent" type="number" min={0} max={100} step="0.01" required /></label>
          <label>Meses del recorrido <input name="journeyMonths" type="number" min={1} max={60} required /></label>
          <label>Desde <input name="startsAt" type="date" required /></label>
          <button type="submit">Proponer</button>
        </form>
      )}
    </main>
  );
}
