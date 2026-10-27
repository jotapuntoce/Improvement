// Panel de los socios: las especialidades de la red y sus afiliadas (alta, estado). El motor es
// server/affiliates/affiliates.ts; cada acción vuelve a pedir la sesión de dueño del muelle.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDockOwnership } from "@/server/auth/guard.ts";
import {
  createSpecialty,
  listAffiliates,
  listSpecialties,
  registerAffiliate,
  setAffiliateStatus,
} from "@/server/affiliates/affiliates.ts";
import { errorCode, errorMessage } from "@/server/error-codes.ts";
import type { Result } from "@/server/result.ts";

const STATUS_LABEL = { activa: "Activa", suspendida: "Suspendida" } as const;

function done(base: string, r: Result<unknown>): never {
  if (r.ok) {
    revalidatePath(base);
    redirect(base);
  }
  redirect(`${base}?error=${errorCode(r.error)}`);
}

export default async function AfiliadasPage({ params, searchParams }: { params: Promise<{ muelleId: string }>; searchParams: Promise<{ error?: string }> }) {
  const { muelleId } = await params;
  const { error } = await searchParams;
  const base = `/muelle/${muelleId}/afiliadas`;
  const { userId } = await requireDockOwnership(muelleId, base);
  const [specialties, affiliates] = await Promise.all([listSpecialties(muelleId), listAffiliates(userId, muelleId)]);
  const labelOf = (key: string) => specialties.find((s) => s.key === key)?.label ?? key;

  async function nuevaEspecialidad(formData: FormData) {
    "use server";
    const { userId: actor } = await requireDockOwnership(muelleId);
    done(base, await createSpecialty(actor, muelleId, { key: formData.get("key")?.toString().trim(), label: formData.get("label")?.toString() }));
  }

  async function alta(formData: FormData) {
    "use server";
    const { userId: actor } = await requireDockOwnership(muelleId);
    done(
      base,
      await registerAffiliate(actor, muelleId, {
        email: formData.get("email")?.toString(),
        displayName: formData.get("displayName")?.toString(),
        specialtyKeys: formData.getAll("specialtyKeys").map(String),
      }),
    );
  }

  async function cambiarEstado(formData: FormData) {
    "use server";
    const { userId: actor } = await requireDockOwnership(muelleId);
    done(base, await setAffiliateStatus(actor, formData.get("affiliateId")?.toString() ?? "", formData.get("status")));
  }

  return (
    <main>
      <h1>Afiliadas</h1>
      {errorMessage(error) && <p className="error">{errorMessage(error)}</p>}

      <h2>Especialidades</h2>
      <ul>
        {specialties.map((s) => (
          <li key={s.id}>{s.label} ({s.key})</li>
        ))}
        {specialties.length === 0 && <li>Sin especialidades todavía.</li>}
      </ul>
      <form action={nuevaEspecialidad}>
        <label>Llave <input name="key" required pattern="[a-z0-9-]{2,40}" placeholder="contabilidad" /></label>
        <label>Nombre <input name="label" required minLength={2} maxLength={80} /></label>
        <button type="submit">Agregar especialidad</button>
      </form>

      <h2>Dar de alta</h2>
      <form action={alta}>
        <label>Correo <input name="email" type="email" required /></label>
        <label>Nombre <input name="displayName" required minLength={2} maxLength={120} /></label>
        <fieldset>
          <legend>Especialidades</legend>
          {specialties.map((s) => (
            <label key={s.id}>
              <input type="checkbox" name="specialtyKeys" value={s.key} /> {s.label}
            </label>
          ))}
        </fieldset>
        <button type="submit">Dar de alta</button>
      </form>

      <h2>Red</h2>
      <ul>
        {affiliates.map((a) => (
          <li key={a.id}>
            {a.displayName} · {a.specialtyKeys.map(labelOf).join(", ")} · {STATUS_LABEL[a.status]}
            <form action={cambiarEstado} style={{ display: "inline-flex" }}>
              <input type="hidden" name="affiliateId" value={a.id} />
              <input type="hidden" name="status" value={a.status === "activa" ? "suspendida" : "activa"} />
              <button type="submit">{a.status === "activa" ? "Suspender" : "Reactivar"}</button>
            </form>
          </li>
        ))}
        {affiliates.length === 0 && <li>Sin afiliadas todavía.</li>}
      </ul>
    </main>
  );
}
