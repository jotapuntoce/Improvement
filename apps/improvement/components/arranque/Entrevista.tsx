"use client";
// Una entrevista del arranque: Improvement pregunta una cosa a la vez y el dueño contesta con sus
// palabras (Enter sigue, Shift+Enter baja de línea). Todas las respuestas viven en el mismo <form> y
// viajan juntas a la Server Action (prop: components/** no importa server/**). Se puede saltar una
// pregunta: Improvement la retoma después en la conversación.
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Isotipo } from "@/components/brand/Isotipo.tsx";
import { ARRANQUE_FORM } from "./armadoDatos.ts";

export interface EntrevistaPregunta { name: string; question: string; why?: string; placeholder?: string; /** Casillas en vez de texto: viaja como "A, B, C". */ options?: string[] }

function Seguir({ last, empty, finish, pendingLabel }: { last: boolean; empty: boolean; finish: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="arr-primary" disabled={pending} aria-disabled={pending}>
      {pending ? pendingLabel : last ? finish : empty ? "Saltar por ahora" : "Seguir"}
    </button>
  );
}

export function Entrevista({ action, questions, label, finish, pendingLabel, error, children }: {
  action: (formData: FormData) => Promise<void>;
  questions: EntrevistaPregunta[];
  label: string;
  finish: string;
  pendingLabel: string;
  error?: string;
  children?: React.ReactNode;
}) {
  const [q, setQ] = useState(0);
  const [v, setV] = useState<Record<string, string>>({});
  const area = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  const p = questions[q]!;
  const last = q === questions.length - 1;

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    area.current?.querySelector<HTMLElement>(`[data-q="${q}"] textarea, [data-q="${q}"] input[type=checkbox]`)?.focus();
  }, [q]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!last) { e.preventDefault(); setQ(q + 1); }
  }

  return (
    <form id={ARRANQUE_FORM} action={action} onSubmit={onSubmit} className="arr-ask" aria-label={label}>
      <div className="arr-bubble">
        <Isotipo />
        <div>
          <h1 className="arr-q" id="arr-q">{p.question}</h1>
          {p.why && <p className="arr-why">{p.why}</p>}
        </div>
      </div>
      {error && <p className="arr-error" role="alert">{error}</p>}
      {children}
      <div ref={area}>
        {questions.map((x, i) => (
          <div key={x.name} data-q={i} hidden={i !== q}>
            {x.options ? (
              <fieldset className="arr-checks" aria-label={x.question}>
                <input type="hidden" name={x.name} value={v[x.name] ?? ""} />
                {x.options.map((o) => {
                  const marked = (v[x.name] ?? "").split(", ").filter(Boolean);
                  return (
                    <label key={o} className="arr-check">
                      <input type="checkbox" checked={marked.includes(o)}
                        onChange={(e) => setV({ ...v, [x.name]: (e.target.checked ? [...marked, o] : marked.filter((m) => m !== o)).join(", ") })} />
                      {o}
                    </label>
                  );
                })}
              </fieldset>
            ) : (
            <textarea name={x.name} className="arr-big arr-long" aria-label={x.question} aria-describedby="arr-q"
              placeholder={x.placeholder ?? "Escríbelo como me lo dirías…"} rows={4} maxLength={2000}
              value={v[x.name] ?? ""} onChange={(e) => setV({ ...v, [x.name]: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
            )}
          </div>
        ))}
      </div>
      <div className="arr-row">
        <span className="arr-hint">Pregunta {q + 1} de {questions.length} · <kbd>Enter ↵</kbd> para seguir</span>
        <span className="arr-row-end">
          {q > 0 && <button type="button" className="arr-ghost" onClick={() => setQ(q - 1)}>← Atrás</button>}
          <Seguir last={last} empty={(v[p.name] ?? "").trim().length < 2} finish={finish} pendingLabel={pendingLabel} />
        </span>
      </div>
    </form>
  );
}
