// La pantalla del Director General: la conversación con Improvement, la vuelta que está corriendo
// y cómo le ha ido.
//
// Se llega desde la recepción, clicando la pantalla de la pared (ZONAS.improvement). Tres cosas en
// una pantalla y no tres pantallas: las tres contestan la misma pregunta —"¿cómo va mi empresa y
// qué está haciendo Improvement al respecto?"— y separarlas obligaría al dueño a cruzar tres
// pantallas para entender una sola conversación.
//
// Lo de arriba es lo que ya existía y no se movió: la conversación de arranque, una pregunta a la
// vez, no un cuestionario de ocho campos. Va primero porque hasta que Improvement no sabe cómo
// piensa su dueño, cualquier propuesta que haga está apoyada en la mitad de la información.
//
// Solo dueño, y por una razón de producto y no de permisos: cada Improvement aprende del dueño de
// SU empresa. Un empleado contestando aquí ensuciaría la única fuente que tiene el Director General
// para saber cómo piensa quien dirige.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AnalyticsWall } from "@jotapuntoce/ui/building/AnalyticsWall.tsx";
import {
  CAUSE_CATEGORY_LABEL,
  CONVICTION_LABEL,
  CONVICTION_LEVELS,
  type Conviction,
  type CauseCategory,
} from "@/server/ai/prompts/director";
import { ImprovementPanel } from "@jotapuntoce/ui/building/ImprovementPanel.tsx";
import { findOwnerMembership, getSessionUserId } from "@/server/auth/guard";
import { loadAnalytics } from "@/server/improvement/analytics";
import { listConversation, sendOwnerMessage } from "@/server/improvement/chat";
import { listDelegations } from "@/server/improvement/delegation";
import {
  activeCycle,
  decideCycle,
  nudgeCycle,
  startCycle,
} from "@/server/improvement/motor";
import {
  ARRANQUE_QUESTIONS,
  listOwnerMemory,
  nextArranqueQuestion,
  rememberAnswer,
} from "@/server/owner/memory";

const fecha = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long" });

/** ¿Es una de las 6M que este build conoce? `cause_category` es text en la base, y una fila
 *  escrita por una versión futura con una categoría nueva no puede tumbar la pantalla. */
function esCategoria(v: string | null): v is CauseCategory {
  return v !== null && v in CAUSE_CATEGORY_LABEL;
}

/** Mismo criterio para la convicción: `conviction` es text, y las vueltas anteriores a la
 *  migración que la agregó la tienen en null. Una vuelta vieja se pinta sin el dato, no revienta. */
function esConviccion(v: string | null): v is Conviction {
  return v !== null && (CONVICTION_LEVELS as readonly string[]).includes(v);
}

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

  const pagina = `/${orgId}/improvement`;

  const [memoria, ciclo, mensajes, analytics] = await Promise.all([
    listOwnerMemory(userId, orgId),
    activeCycle(userId, orgId),
    listConversation(userId, orgId),
    loadAnalytics(userId, orgId),
  ]);

  // Las tareas solo de la vuelta viva: las de las cerradas ya están contadas en la pared de
  // resultados, y traerlas todas llenaría el panel de trabajo que ya pasó.
  const tareas = ciclo ? await listDelegations(userId, orgId, ciclo.id) : [];

  const pregunta = nextArranqueQuestion(memoria);
  const contestadas = ARRANQUE_QUESTIONS.length - countPendientes(memoria);

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

  // Las cuatro acciones del panel. Devuelven el mensaje de error o null — el panel lo dibuja sin
  // navegar, que es lo que hace que escribir en el chat no recargue la pantalla entera.
  //
  // Cada una vuelve a resolver la sesión en vez de usar el `userId` que cerró el closure: una
  // Server Action es un endpoint público con su propio id, y confiar en el valor que quedó del
  // render sería confiar en quién pintó la página, no en quién la está llamando.
  async function enviarMensaje(text: string): Promise<string | null> {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) return "Tu sesión expiró.";
    const r = await sendOwnerMessage(actor, orgId, { content: text });
    if (!r.ok) return r.error.message;
    revalidatePath(pagina);
    return null;
  }

  async function decidir(
    decision: "acepto" | "rechazo" | "modificar",
    feedback: string,
  ): Promise<string | null> {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) return "Tu sesión expiró.";
    const vivo = await activeCycle(actor, orgId);
    if (!vivo) return "No hay ninguna vuelta abierta.";
    const r = await decideCycle(actor, orgId, vivo.id, { decision, feedback });
    if (!r.ok) return r.error.message;
    revalidatePath(pagina);
    return null;
  }

  async function empezar(title: string): Promise<string | null> {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) return "Tu sesión expiró.";
    const r = await startCycle(actor, orgId, { title });
    if (!r.ok) return r.error.message;
    revalidatePath(pagina);
    return null;
  }

  async function empujar(): Promise<string | null> {
    "use server";
    const actor = await getSessionUserId();
    if (!actor) return "Tu sesión expiró.";
    const vivo = await activeCycle(actor, orgId);
    if (!vivo) return "No hay ninguna vuelta abierta.";
    const r = await nudgeCycle(actor, orgId, vivo.id);
    if (!r.ok) return r.error.message;
    revalidatePath(pagina);
    // Que la fase no se moviera no es un error, pero el dueño merece saber por qué: "esperando tu
    // decisión" y "el proveedor está saturado" se ven igual desde afuera si no se le dice.
    return r.data.from === r.data.to ? (r.data.reason ?? null) : null;
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

      <ImprovementPanel
        cycle={
          ciclo
            ? {
                id: ciclo.id,
                title: ciclo.title,
                phase: ciclo.phase,
                observation: ciclo.observation,
                inference: ciclo.inference,
                analysis: ciclo.analysis,
                aiSuggestion: ciclo.aiSuggestion,
                ownerDecision: ciclo.ownerDecision,
                result: ciclo.result,
                rootCause: ciclo.rootCause,
                // La 6M se traduce AQUÍ y no en packages/ui: el paquete de UI no conoce el
                // catálogo, y no tiene por qué — recibe la etiqueta ya en palabras.
                causeCategoryLabel: esCategoria(ciclo.causeCategory)
                  ? CAUSE_CATEGORY_LABEL[ciclo.causeCategory]
                  : null,
                // jsonb llega como unknown: se valida la forma al leer. Una fila vieja o escrita
                // a mano deja la escalera vacía, nunca revienta la pantalla.
                whys: Array.isArray(ciclo.whys)
                  ? (ciclo.whys as { pregunta: string; respuesta: string }[])
                  : [],
                contributingFactors: Array.isArray(ciclo.contributingFactors)
                  ? (ciclo.contributingFactors as string[])
                  : [],
                verification: ciclo.verification,
                conviccion: ciclo.conviction,
                // La etiqueta se traduce AQUÍ, como la 6M: packages/ui no conoce el catálogo.
                conviccionLabel: esConviccion(ciclo.conviction)
                  ? CONVICTION_LABEL[ciclo.conviction]
                  : null,
              }
            : null
        }
        tasks={tareas.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          expectedOutcome: t.expectedOutcome,
          status: t.status,
          areaName: t.areaName,
          assigneeName: t.assigneeName,
          atacaLaRaiz: t.attacksRoot,
        }))}
        // El hilo llega del más nuevo al más viejo (así se pagina); se lee al revés.
        messages={[...mensajes].reverse().map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
        }))}
        onSend={enviarMensaje}
        onDecide={decidir}
        onStart={empezar}
        onNudge={empujar}
      />

      <AnalyticsWall {...analytics} />

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

      <Link href={`/empresas/${orgId}`}>← Volver a la recepción</Link>
    </main>
  );
}

/** Cuántas preguntas de arranque siguen sin contestar, con la memoria ya cargada. */
function countPendientes(memoria: { question: string | null }[]): number {
  const hechas = new Set(memoria.map((m) => m.question));
  return ARRANQUE_QUESTIONS.filter((q) => !hechas.has(q.question)).length;
}
