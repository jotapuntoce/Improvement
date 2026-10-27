// Mi transformación: el Pacto de la persona en esta red. Sin consentimiento vigente, el aviso de privacidad
// (LFPDPPP, texto v1 del blueprint §14) y la casilla; nada se registra antes. Con consentimiento: racha y
// riesgo por pilar, posada, retos, el estado de su escuadra y la revocación con borrado. Sin acceso: 404.
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { getSessionUserId } from "@/server/auth/guard.ts";
import { giveConsent, logEntry, myPacto, pausePacto, revokeConsent } from "@/server/pacto/pacto.ts";
import { joinChallenge, listChallenges, mySquads, squadBoard } from "@/server/pacto/squads.ts";
import type { PillarRisk } from "@/server/pacto/streak.ts";
import { errorCode, errorMessage } from "@/server/error-codes.ts";
import type { Result } from "@/server/result.ts";

const RISK_LABEL: Record<PillarRisk, string> = {
  al_dia: "Al día",
  pendiente: "Pendiente hoy",
  peligro: "En peligro",
  desliz: "Desliz — aquí estamos para apoyarte",
};
const SUPPORT_LABEL = { bien: "Bien", apoyo: "Necesita apoyo" } as const;

function done(base: string, r: Result<unknown>): never {
  if (r.ok) {
    revalidatePath(base);
    redirect(base);
  }
  redirect(`${base}?error=${errorCode(r.error)}`);
}

async function actor() {
  const userId = await getSessionUserId();
  if (!userId) notFound();
  return userId;
}

export default async function MiTransformacionPage({ params, searchParams }: { params: Promise<{ muelleId: string }>; searchParams: Promise<{ error?: string }> }) {
  const { muelleId } = await params;
  const { error } = await searchParams;
  const base = `/red/${muelleId}/mi-transformacion`;
  const userId = await getSessionUserId();
  if (!userId) redirect(`/login?returnTo=${encodeURIComponent(base)}`);
  const pacto = await myPacto(userId, muelleId);

  async function aceptar(formData: FormData) {
    "use server";
    if (formData.get("acepto") !== "on") redirect(`${base}?error=invalido`);
    done(base, await giveConsent(await actor(), muelleId));
  }

  async function registrar(formData: FormData) {
    "use server";
    done(
      base,
      await logEntry(await actor(), muelleId, {
        pillarId: formData.get("pillarId")?.toString(),
        note: formData.get("note")?.toString().trim() || null,
      }),
    );
  }

  async function posada(formData: FormData) {
    "use server";
    done(
      base,
      await pausePacto(await actor(), {
        startsOn: formData.get("startsOn")?.toString(),
        endsOn: formData.get("endsOn")?.toString(),
        reason: formData.get("reason")?.toString().trim() || null,
      }),
    );
  }

  async function unirme(formData: FormData) {
    "use server";
    done(base, await joinChallenge(await actor(), formData.get("challengeId")?.toString() ?? ""));
  }

  async function revocar(formData: FormData) {
    "use server";
    done(base, await revokeConsent(await actor(), { borrar: formData.get("borrar") === "on" }));
  }

  if (!pacto.consent) {
    return (
      <main style={{ padding: "24px" }}>
        <h1>Mi transformación</h1>
        {errorMessage(error) && <p className="error">{errorMessage(error)}</p>}
        <section aria-labelledby="aviso">
          <h2 id="aviso">Aviso de privacidad</h2>
          <p>
            <strong>Tus registros del Pacto son tuyos.</strong> Si aceptas, Summum guarda lo que registres de cada pilar (la
            fecha y una nota opcional) para mostrarte tu racha y avisarte cuando necesites apoyo. Nadie más lo ve: ni tu
            escuadra, ni los socios, ni tu empresa. Tu escuadra solo ve si estás &quot;Bien&quot; o &quot;Necesitas
            apoyo&quot;. Puedes pausar con una posada sin perder tu racha, y puedes revocar este consentimiento cuando
            quieras; si marcas &quot;Borrar mis registros&quot;, los eliminamos. Participar es voluntario y no cambia nada de
            tu trabajo ni de tu Sello.
          </p>
          <form action={aceptar}>
            <label>
              <input type="checkbox" name="acepto" required /> Acepto que Summum guarde mis registros del Pacto
            </label>
            <button type="submit">Aceptar</button>
          </form>
        </section>
      </main>
    );
  }

  const [challenges, squads] = await Promise.all([listChallenges(userId, muelleId), mySquads(userId, muelleId)]);
  const boards = await Promise.all(squads.map(async (s) => ({ ...s, board: await squadBoard(userId, s.id) })));

  return (
    <main style={{ padding: "24px" }}>
      <h1>Mi transformación</h1>
      {errorMessage(error) && <p className="error">{errorMessage(error)}</p>}

      <h2>Mis pilares</h2>
      <ul>
        {pacto.pillars.map((p) => (
          <li key={p.id}>
            <strong>{p.name}</strong> · Racha {p.streak} · {p.risk ? RISK_LABEL[p.risk] : ""}
            <form action={registrar} style={{ display: "inline-flex" }}>
              <input type="hidden" name="pillarId" value={p.id} />
              <label>
                Nota de {p.name} <input name="note" maxLength={500} defaultValue={p.todayNote ?? ""} />
              </label>
              <button type="submit">Registrar hoy</button>
            </form>
          </li>
        ))}
        {pacto.pillars.length === 0 && <li>Tu red todavía no define pilares.</li>}
      </ul>

      <h2>Posada</h2>
      <form action={posada}>
        <label>Desde <input type="date" name="startsOn" required /></label>
        <label>Hasta <input type="date" name="endsOn" required /></label>
        <label>Motivo (opcional) <input name="reason" maxLength={300} /></label>
        <button type="submit">Pedir posada</button>
      </form>

      <h2>Retos</h2>
      <ul>
        {challenges.map((c) => (
          <li key={c.id}>
            {c.title} · hasta {c.endsOn}
            <form action={unirme} style={{ display: "inline-flex" }}>
              <input type="hidden" name="challengeId" value={c.id} />
              <button type="submit">Unirme</button>
            </form>
          </li>
        ))}
        {challenges.length === 0 && <li>No hay retos activos.</li>}
      </ul>

      {boards.map((s) => (
        <section key={s.id} aria-label={`Escuadra ${s.name}`}>
          <h2>Escuadra {s.name}</h2>
          <ul>
            {s.board.map((m, i) => (
              <li key={i}>
                {m.name} · {SUPPORT_LABEL[m.supportStatus]}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <h2>Revocar consentimiento</h2>
      <form action={revocar}>
        <label>
          <input type="checkbox" name="borrar" /> Borrar mis registros
        </label>
        <button type="submit">Revocar consentimiento</button>
      </form>
    </main>
  );
}
