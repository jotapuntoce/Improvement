// El panel del Director General: la conversación con el dueño y la vuelta que está corriendo.
//
// Es el mueble de la recepción abierto — se llega clicando la pantalla de la pared (ZONAS
// .improvement en lobbyPlano.ts). Aquí sí hay lugar para leer, así que aquí va el hilo completo,
// las siete fases con su avance y la propuesta esperando respuesta.
//
// COMPONENTE TONTO A PROPÓSITO. No hace fetch, no sabe de rutas, no conoce orgId. Recibe los datos
// ya cargados y devuelve los eventos hacia arriba, igual que Lobby.tsx recibe sus puertas ya
// envueltas en Link. Todo lo que sabe de esta empresa entró por props — nada de este archivo
// menciona un org, una empresa ni una persona (.claude/rules/motor-generico.md).
//
// Es cliente ("use client") porque el input de mensaje y los botones de decisión necesitan estado
// y eventos. Es la hoja: la página que lo usa sigue siendo Server Component.
"use client";

import { useState, type FormEvent, type ReactNode } from "react";

/** Las siete fases en orden, con el nombre que ve el dueño. Es el MISMO orden que SIGUIENTE en
 *  server/improvement/phases.ts — aquí solo para dibujar la barra, nunca para decidir nada. */
export const FASES: { id: string; label: string }[] = [
  { id: "observacion", label: "Observa" },
  { id: "inferencia", label: "Infiere" },
  { id: "analisis", label: "Analiza" },
  { id: "sugerencia", label: "Propone" },
  { id: "decision", label: "Decides" },
  { id: "experimentacion", label: "Se prueba" },
  { id: "medicion", label: "Se mide" },
];

export interface PanelMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string | Date;
}

export interface PanelCycle {
  id: string;
  title: string;
  phase: string;
  observation: string | null;
  inference: string | null;
  analysis: string | null;
  aiSuggestion: string | null;
  ownerDecision: string | null;
  result: string | null;
  /** El Análisis de Causa Raíz de esta vuelta. Se enseña entero y no solo su conclusión: el
   *  dueño tiene que poder señalar el eslabón en el que no está de acuerdo, que es la única
   *  forma de discutir un diagnóstico en vez de aceptarlo o rechazarlo a ciegas. */
  rootCause: string | null;
  /** La 6M ya traducida a palabras por el servidor — este paquete no conoce el catálogo. */
  causeCategoryLabel: string | null;
  whys: { pregunta: string; respuesta: string }[];
  contributingFactors: string[];
  verification: string | null;
  /** "alta" | "media" | "baja", ya traducido a su etiqueta. null en vueltas viejas. */
  conviccionLabel: string | null;
  conviccion: string | null;
}

export interface PanelTask {
  id: string;
  title: string;
  description: string | null;
  expectedOutcome: string | null;
  status: string;
  areaName: string | null;
  assigneeName: string | null;
  /** Por qué esta tarea toca la raíz y no el síntoma. Se enseña junto a la tarea porque es lo
   *  que distingue una acción correctiva de un parche, y el dueño decide sobre eso. */
  atacaLaRaiz: string | null;
}

export interface ImprovementPanelProps {
  /** La vuelta viva, o null si no hay ninguna abierta. */
  cycle: PanelCycle | null;
  /** Las tareas que salieron de esa vuelta. */
  tasks: PanelTask[];
  /** El hilo, del más viejo al más nuevo (así se lee una conversación). */
  messages: PanelMessage[];
  /** Envía lo que el dueño escribió. Devuelve el error a mostrar, o null si salió bien. */
  onSend: (text: string) => Promise<string | null>;
  /** Contesta la propuesta. Solo se llama cuando hay una escrita. */
  onDecide: (decision: "acepto" | "rechazo" | "modificar", feedback: string) => Promise<string | null>;
  /** Abre una vuelta nueva. Solo se ofrece cuando no hay ninguna viva. */
  onStart: (title: string) => Promise<string | null>;
  /** Empuja la vuelta una fase sin esperar al cron. */
  onNudge?: () => Promise<string | null>;
  /** Lo que se dibuja debajo del panel — el enlace de regreso, la pared de analytics. */
  children?: ReactNode;
}

const fecha = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** La posición de una fase en la barra. -1 para una fase desconocida: la barra se dibuja vacía en
 *  vez de romperse, que es lo correcto para una fila escrita por una versión que este build no
 *  conoce. */
function indiceDeFase(phase: string): number {
  return FASES.findIndex((f) => f.id === phase);
}

export function ImprovementPanel({
  cycle,
  tasks,
  messages,
  onSend,
  onDecide,
  onStart,
  onNudge,
  children,
}: ImprovementPanelProps) {
  const [texto, setTexto] = useState("");
  const [titulo, setTitulo] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  /** Un solo envoltorio para las cuatro acciones: bloquea, corre, guarda el error. Sin esto, cada
   *  botón repetiría el mismo try/finally y alguno se quedaría sin el `setOcupado(false)`. */
  async function correr(accion: () => Promise<string | null>, alTerminar?: () => void) {
    setOcupado(true);
    setError(null);
    try {
      const err = await accion();
      setError(err);
      if (!err) alTerminar?.();
    } finally {
      setOcupado(false);
    }
  }

  const actual = cycle ? indiceDeFase(cycle.phase) : -1;
  const esperandoDecision = Boolean(cycle && cycle.phase === "sugerencia" && cycle.aiSuggestion);

  return (
    <section className="jpc-dg">
      {error && (
        <p className="jpc-dg-error" role="alert">
          {error}
        </p>
      )}

      {cycle ? (
        <article className="jpc-dg-ciclo">
          <h2 className="jpc-dg-titulo">{cycle.title}</h2>

          <ol className="jpc-dg-fases" aria-label="Las siete fases de esta vuelta">
            {FASES.map((f, i) => (
              <li
                key={f.id}
                className={
                  i < actual ? "es-hecha" : i === actual ? "es-actual" : "es-pendiente"
                }
                aria-current={i === actual ? "step" : undefined}
              >
                <span>{f.label}</span>
              </li>
            ))}
          </ol>

          <dl className="jpc-dg-razonamiento">
            <Paso titulo="Lo que observé" texto={cycle.observation} />
            <Paso titulo="Lo que infiero" texto={cycle.inference} />
          </dl>

          <CausaRaiz cycle={cycle} />

          <dl className="jpc-dg-razonamiento">
            <Paso titulo="Lo que estimo" texto={cycle.analysis} />
            <Paso titulo="Cómo sabremos si funcionó" texto={cycle.verification} />
            <Paso titulo="Lo que te propongo" texto={cycle.aiSuggestion} destacado />
          </dl>

          {cycle.conviccion && cycle.aiSuggestion && (
            /* Qué tan convencido está, junto a la propuesta y no dentro de ella. Sirve para que
               "esta sí" y "esta es una apuesta" no se lean igual — que es justo lo que pasaba
               cuando todo salía con el mismo tono seguro. */
            <p className={`jpc-dg-conviccion es-${cycle.conviccion}`}>
              {cycle.conviccionLabel ?? cycle.conviccion}
            </p>
          )}

          {tasks.length > 0 && (
            <>
              <h3 className="jpc-dg-subtitulo">Lo que hay que hacer</h3>
              <ul className="jpc-dg-tareas">
                {tasks.map((t) => (
                  <li key={t.id}>
                    <strong>{t.title}</strong>
                    {t.description && <p>{t.description}</p>}
                    <p className="jpc-dg-meta">
                      {[t.areaName, t.assigneeName, t.status].filter(Boolean).join(" · ")}
                      {t.expectedOutcome && ` — se espera: ${t.expectedOutcome}`}
                    </p>
                    {t.atacaLaRaiz && (
                      <p className="jpc-dg-raiz-tarea">Ataca la raíz: {t.atacaLaRaiz}</p>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          {esperandoDecision && (
            <div className="jpc-dg-decision">
              <label htmlFor="jpc-dg-feedback">Dime por qué (opcional, pero lo recuerdo)</label>
              <textarea
                id="jpc-dg-feedback"
                rows={2}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                disabled={ocupado}
              />
              <div className="jpc-dg-botones">
                {(
                  [
                    ["acepto", "Hazlo"],
                    ["modificar", "Cámbialo"],
                    ["rechazo", "No"],
                  ] as const
                ).map(([d, label]) => (
                  <button
                    key={d}
                    type="button"
                    disabled={ocupado}
                    className={d === "acepto" ? "panel-cta" : "panel-btn-ghost"}
                    onClick={() => correr(() => onDecide(d, feedback), () => setFeedback(""))}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {onNudge && !esperandoDecision && cycle.phase !== "cerrado" && (
            <button
              type="button"
              className="panel-btn-ghost"
              disabled={ocupado}
              onClick={() => correr(onNudge)}
            >
              Avanza ya
            </button>
          )}
        </article>
      ) : (
        <form
          className="jpc-dg-nueva"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (titulo.trim().length < 3) return;
            correr(() => onStart(titulo), () => setTitulo(""));
          }}
        >
          <h2 className="jpc-dg-titulo">¿Qué quieres que mire?</h2>
          <p className="jpc-dg-meta">
            Dame un tema y arranco una vuelta: observo, te digo qué creo que pasa, te propongo algo
            y lo medimos. Tú decides si se hace.
          </p>
          <input
            type="text"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Las entregas van tarde"
            minLength={3}
            required
            disabled={ocupado}
          />
          <button type="submit" className="panel-cta" disabled={ocupado}>
            Empezar
          </button>
        </form>
      )}

      <h3 className="jpc-dg-subtitulo">Conversación</h3>
      <ul className="jpc-dg-hilo">
        {messages.length === 0 && (
          <li className="jpc-dg-meta">Todavía no nos hemos dicho nada.</li>
        )}
        {messages.map((m) => (
          <li key={m.id} className={m.role === "dueno" ? "es-mio" : "es-suyo"}>
            <p>{m.content}</p>
            <time className="jpc-dg-meta">{fecha.format(new Date(m.createdAt))}</time>
          </li>
        ))}
      </ul>

      <form
        className="jpc-dg-escribir"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (!texto.trim()) return;
          correr(() => onSend(texto), () => setTexto(""));
        }}
      >
        <label htmlFor="jpc-dg-mensaje" className="jpc-dg-meta">
          Cuéntame algo que no se vea en los datos
        </label>
        <textarea
          id="jpc-dg-mensaje"
          rows={3}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          disabled={ocupado}
          required
        />
        <button type="submit" className="panel-cta" disabled={ocupado || !texto.trim()}>
          Enviar
        </button>
      </form>

      {children}
    </section>
  );
}

/**
 * El Análisis de Causa Raíz de la vuelta: la cadena de porqués, la raíz y su categoría.
 *
 * Va entre la inferencia y el análisis porque ese es su lugar en el método, y se dibuja como
 * una escalera numerada y no como un párrafo: el valor de los cinco porqués está en ver el
 * DESCENSO — dónde se pasó del síntoma a la condición que lo permitió. En prosa eso se pierde.
 *
 * No se dibuja nada hasta que la fase de inferencia corrió.
 */
function CausaRaiz({ cycle }: { cycle: PanelCycle }) {
  if (!cycle.rootCause && cycle.whys.length === 0) return null;

  return (
    <section className="jpc-dg-acr">
      <h3 className="jpc-dg-subtitulo">Por qué pasa esto</h3>

      {cycle.whys.length > 0 && (
        <ol className="jpc-dg-porques">
          {cycle.whys.map((w, i) => (
            <li key={i}>
              <span className="jpc-dg-porque-p">{w.pregunta}</span>
              <span className="jpc-dg-porque-r">{w.respuesta}</span>
            </li>
          ))}
        </ol>
      )}

      {cycle.rootCause && (
        <p className="jpc-dg-raiz">
          <strong>Causa raíz:</strong> {cycle.rootCause}
          {cycle.causeCategoryLabel && (
            <span className="jpc-dg-categoria">{cycle.causeCategoryLabel}</span>
          )}
        </p>
      )}

      {cycle.contributingFactors.length > 0 && (
        <p className="jpc-dg-meta">
          También contribuyó, sin ser la raíz: {cycle.contributingFactors.join(" · ")}
        </p>
      )}
    </section>
  );
}

/** Un paso del razonamiento. No se dibuja hasta que tiene texto: un encabezado vacío le dice al
 *  dueño que ahí falta algo, cuando lo que pasa es que esa fase todavía no corrió. */
function Paso({
  titulo,
  texto,
  destacado = false,
}: {
  titulo: string;
  texto: string | null;
  destacado?: boolean;
}) {
  if (!texto) return null;
  return (
    <div className={destacado ? "jpc-dg-paso es-destacado" : "jpc-dg-paso"}>
      <dt>{titulo}</dt>
      <dd>{texto}</dd>
    </div>
  );
}
