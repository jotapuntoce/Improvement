// La conversación con Improvement: donde el Director General de esta empresa aprende de su dueño.
//
// Una pregunta a la vez, no un cuestionario de ocho campos. Ocho cajas vacías se contestan con ocho
// frases de compromiso; una pregunta sola se contesta.
//
// Solo dueño, y por una razón de producto y no de permisos: cada Improvement aprende del dueño de
// SU empresa. Un empleado contestando aquí ensuciaría la única fuente que tiene el Director General
// para saber cómo piensa quien dirige.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { findOwnerMembership, getSessionUserId } from "@/server/auth/guard";
import {
  ARRANQUE_QUESTIONS,
  listOwnerMemory,
  nextArranqueQuestion,
  rememberAnswer,
} from "@/server/owner/memory";

const fecha = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long" });

export default async function ImprovementPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { org: orgId } = await params;
  const { error } = await searchParams;

  const userId = await getSessionUserId();
  if (!userId) notFound();
  if (!(await findOwnerMembership(userId, orgId))) notFound();

  const memoria = await listOwnerMemory(userId, orgId);
  const pregunta = nextArranqueQuestion(memoria);
  const contestadas = ARRANQUE_QUESTIONS.length - countPendientes(memoria);
  const pagina = `/${orgId}/improvement`;

  async function responder(formData: FormData) {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) notFound();
    const result = await rememberAnswer(actor, orgId, {
      question: formData.get("question")?.toString() || null,
      answer: formData.get("answer")?.toString() ?? "",
      topic: formData.get("question") ? "arranque" : "observacion",
    });
    if (!result.ok) redirect(`${pagina}?error=${encodeURIComponent(result.error.message)}`);
    revalidatePath(pagina);
    redirect(pagina);
  }

  return (
    <main className="config-page">
      <h1 className="config-title">Improvement</h1>
      <p className="config-hint">
        Soy el director general de tu empresa. Para dirigirla como la dirigirías tú, necesito
        conocerte: cómo trabajas, cómo piensas, cómo decides y qué ves cuando la imaginas terminada.
      </p>

      {error && <p className="invite-error">{error}</p>}

      {pregunta ? (
        <form action={responder} className="config-card">
          <p className="config-hint">
            Pregunta {contestadas + 1} de {ARRANQUE_QUESTIONS.length}
          </p>
          <p className="objetivo-title">{pregunta.question}</p>
          <input type="hidden" name="question" value={pregunta.question} />
          <textarea name="answer" rows={4} required minLength={3} className="config-input" />
          <div className="permiso-actions">
            <button type="submit" className="panel-cta">
              Contestar
            </button>
          </div>
        </form>
      ) : (
        <div className="config-card">
          <h2 className="config-card-title">Ya te conozco lo suficiente para empezar.</h2>
          <p className="config-hint">
            Contestaste las {ARRANQUE_QUESTIONS.length} preguntas de arranque. De aquí en adelante
            aprendo de lo que haces: qué objetivos emites, qué necesidades registras y qué decides
            cuando algo se atora. Si algo cambia, cuéntamelo abajo.
          </p>
        </div>
      )}

      <form action={responder} className="config-card">
        <h2 className="config-card-title">Cuéntame algo</h2>
        <p className="config-hint">
          Lo que quieras que sepa y que no te pregunté. Nada de esto se borra ni se corrige: si
          cambias de opinión, escríbelo otra vez y lo nuevo es lo que vale.
        </p>
        <textarea name="answer" rows={3} required minLength={3} className="config-input" />
        <div className="permiso-actions">
          <button type="submit" className="panel-btn-ghost">
            Guardar
          </button>
        </div>
      </form>

      {memoria.length > 0 && (
        <>
          <h2 className="config-card-title">Lo que sé de ti</h2>
          <ul className="equipo-list">
            {memoria.map((m) => (
              <li key={m.id} className="config-card">
                {m.question && <p className="config-hint">{m.question}</p>}
                <p className="equipo-name">{m.answer}</p>
                <p className="config-hint">{fecha.format(m.createdAt)}</p>
              </li>
            ))}
          </ul>
        </>
      )}

      <Link href="/empresas">← Volver a mis empresas</Link>
    </main>
  );
}

/** Cuántas preguntas de arranque siguen sin contestar, con la memoria ya cargada. */
function countPendientes(memoria: { question: string | null }[]): number {
  const hechas = new Set(memoria.map((m) => m.question));
  return ARRANQUE_QUESTIONS.filter((q) => !hechas.has(q.question)).length;
}
