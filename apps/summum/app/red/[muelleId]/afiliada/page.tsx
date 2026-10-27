// La afiliada ve y edita su perfil público y contesta el cuestionario de personalidad. Solo ella: sin fila
// de afiliada en ese muelle, 404.
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { PERSONALITY_QUESTIONS } from "@jotapuntoce/db/schema";
import { getSessionUserId, listMyBarcos } from "@/server/auth/guard.ts";
import { answerQuestionnaire, getMyAffiliate, saveAffiliateProfile } from "@/server/affiliates/affiliates.ts";
import { errorCode, errorMessage } from "@/server/error-codes.ts";
import type { Result } from "@/server/result.ts";

function done(base: string, r: Result<unknown>): never {
  if (r.ok) {
    revalidatePath(base);
    redirect(base);
  }
  redirect(`${base}?error=${errorCode(r.error)}`);
}

export default async function MiPerfilAfiliadaPage({ params, searchParams }: { params: Promise<{ muelleId: string }>; searchParams: Promise<{ error?: string }> }) {
  const { muelleId } = await params;
  const { error } = await searchParams;
  const base = `/red/${muelleId}/afiliada`;
  const userId = await getSessionUserId();
  if (!userId) redirect(`/login?returnTo=${encodeURIComponent(base)}`);
  const mine = await getMyAffiliate(userId, muelleId);
  if (!mine) notFound();
  const barcos = await listMyBarcos(userId);

  async function guardarPerfil(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    done(
      base,
      await saveAffiliateProfile(actor, muelleId, {
        publicBio: formData.get("publicBio")?.toString().trim() || null,
        directoryOptIn: formData.get("directoryOptIn") === "on",
        barcoOrgId: formData.get("barcoOrgId")?.toString() || null,
      }),
    );
  }

  async function contestar(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    const answers = Object.fromEntries(PERSONALITY_QUESTIONS.map((q) => [q.key, formData.get(q.key)?.toString()]));
    done(base, await answerQuestionnaire(actor, muelleId, answers));
  }

  return (
    <main style={{ padding: "24px" }}>
      <h1>Mi perfil de afiliada</h1>
      {errorMessage(error) && <p className="error">{errorMessage(error)}</p>}
      {mine.status === "suspendida" && <p>Tu afiliación está suspendida: no puedes contestar el cuestionario.</p>}

      <h2>Perfil público</h2>
      <form action={guardarPerfil}>
        <label>
          Sobre mí
          <textarea name="publicBio" maxLength={1000} defaultValue={mine.publicBio ?? ""} />
        </label>
        <label>
          <input type="checkbox" name="directoryOptIn" defaultChecked={mine.directoryOptIn} /> Aparecer en el directorio
        </label>
        <label>
          Mi negocio en Improvement
          <select name="barcoOrgId" defaultValue={mine.barcoOrgId ?? ""}>
            <option value="">Ninguno</option>
            {barcos.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Guardar perfil</button>
      </form>

      <h2>Cuestionario de personalidad y enfoque</h2>
      <form action={contestar}>
        {PERSONALITY_QUESTIONS.map((q) => (
          <fieldset key={q.key}>
            <legend>{q.question}</legend>
            {q.options.map((o) => (
              <label key={o.value}>
                <input type="radio" name={q.key} value={o.value} required /> {o.label}
              </label>
            ))}
          </fieldset>
        ))}
        <button type="submit">Guardar respuestas</button>
      </form>
    </main>
  );
}
