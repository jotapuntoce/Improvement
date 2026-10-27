// "Tu perfil y tu red": el cuestionario de personalidad del dueño y qué especialidad de la red Summum atiende
// cada área. Con eso la sinapsis le propone a la especialista que más se le parece. Solo dueño: 404 al resto.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { PERSONALITY_QUESTIONS } from "@jotapuntoce/db/schema";
import { findOwnerMembership, requireOrgMembership } from "@/server/auth/guard";
import { getOwnerPersonality, saveOwnerPersonality } from "@/server/owner/personality.ts";
import { listAreaSpecialties, listNetworkSpecialties, setAreaSpecialty } from "@/server/sinapsis/proposals.ts";

export default async function PerfilPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { org: orgId } = await params;
  const { error } = await searchParams;
  const { userId } = await requireOrgMembership(orgId);
  if (!(await findOwnerMembership(userId, orgId))) notFound();

  const [personality, network, specialties] = await Promise.all([
    getOwnerPersonality(userId),
    listAreaSpecialties(userId, orgId),
    listNetworkSpecialties(userId, orgId),
  ]);
  const saved = (personality?.answers ?? {}) as Record<string, string>;
  const pagina = `/${orgId}/improvement/perfil`;

  async function contestar(formData: FormData) {
    "use server";
    const { userId: actor } = await requireOrgMembership(orgId);
    const answers = Object.fromEntries(PERSONALITY_QUESTIONS.map((q) => [q.key, formData.get(q.key)?.toString()]));
    const result = await saveOwnerPersonality(actor, orgId, answers);
    if (!result.ok) redirect(`${pagina}?error=${encodeURIComponent(result.error.message)}`);
    revalidatePath(pagina);
    redirect(pagina);
  }

  async function especialidad(formData: FormData) {
    "use server";
    const { userId: actor } = await requireOrgMembership(orgId);
    const result = await setAreaSpecialty(
      actor,
      orgId,
      formData.get("areaId")?.toString() ?? "",
      formData.get("specialtyKey")?.toString() || null,
    );
    if (!result.ok) redirect(`${pagina}?error=${encodeURIComponent(result.error.message)}`);
    revalidatePath(pagina);
    redirect(pagina);
  }

  return (
    <main className="config-page">
      <h1 className="config-title">Tu perfil y tu red</h1>
      {error && <p className="invite-error">{error}</p>}

      <form action={contestar} className="config-card">
        <h2 className="config-card-title">Cómo diriges</h2>
        <p className="config-hint">
          Con esto Improvement elige, entre las especialistas de tu red, a la que trabaja como tú.
        </p>
        {PERSONALITY_QUESTIONS.map((q) => (
          <fieldset key={q.key} className="permiso-field">
            <legend>{q.question}</legend>
            {q.options.map((o) => (
              <label key={o.value}>
                <input type="radio" name={q.key} value={o.value} required defaultChecked={saved[q.key] === o.value} /> {o.label}
              </label>
            ))}
          </fieldset>
        ))}
        <div className="permiso-actions">
          <button type="submit" className="panel-cta">
            Guardar respuestas
          </button>
        </div>
      </form>

      <section className="config-card" aria-labelledby="red">
        <h2 id="red" className="config-card-title">
          Tu red
        </h2>
        {!network.inNetwork ? (
          <p className="config-hint">Tu empresa todavía no está en una red Summum.</p>
        ) : (
          <ul className="equipo-list">
            {network.areas.map((a) => (
              <li key={a.id}>
                <form action={especialidad} className="config-form">
                  <input type="hidden" name="areaId" value={a.id} />
                  <label className="permiso-field">
                    <span>Especialidad de {a.name}</span>
                    <select name="specialtyKey" className="config-input" defaultValue={a.specialtyKey ?? ""}>
                      <option value="">Ninguna</option>
                      {specialties.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="submit" className="panel-btn-ghost">
                    Guardar
                  </button>
                </form>
              </li>
            ))}
            {network.areas.length === 0 && <p className="config-hint">Tu empresa todavía no tiene áreas.</p>}
          </ul>
        )}
      </section>

      <Link href={`/${orgId}/improvement`}>← Volver a Improvement</Link>
    </main>
  );
}
