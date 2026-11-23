"use client";
// Paso 1 del arranque como conversación: Improvement pregunta una cosa a la vez (Enter sigue). Las
// cinco respuestas viven en el mismo <form>: solo se ve la pregunta actual, pero todas viajan juntas a
// la Server Action (llega como prop: components/** no importa server/**). La tarjeta Armado lee este
// formulario mientras el dueño escribe. Sin `required` nativo: un campo oculto vacío bloquearía el
// Enter de las preguntas anteriores; cada pregunta se valida con `listo` y el servidor con zod.
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { INDUSTRIES } from "@jotapuntoce/ui/building/industries.ts";
import { Isotipo } from "@/components/brand/Isotipo.tsx";
import { ARRANQUE_FORM } from "./armadoDatos.ts";

type Key = "fullName" | "name" | "industry" | "teamSize" | "city";
type Pregunta = { key: Key; label: string; q: (v: Record<Key, string>) => string; why?: string; options?: readonly (readonly [string, string])[] };

const SIZES = [["solo", "Solo yo"], ["2-5", "2 a 5"], ["6-20", "6 a 20"], ["21+", "Más de 20"]] as const;

const PREGUNTAS: Pregunta[] = [
  { key: "fullName", label: "Tu nombre", q: () => "¡Hola! Soy Improvement. ¿Cómo te llamas?", why: "Voy a dirigir tu negocio contigo; empecemos por conocernos." },
  { key: "name", label: "Nombre del negocio", q: (v) => `Mucho gusto, ${v.fullName.trim().split(/\s+/)[0]}. ¿Cómo se llama tu negocio?`, why: "Mira: ya empecé a armarlo." },
  { key: "industry", label: "Giro", q: (v) => `¿A qué se dedica ${v.name.trim()}?`, why: "Así te propongo las apps que usa un negocio como el tuyo.", options: INDUSTRIES.map((i) => [i.id, i.label] as const) },
  { key: "teamSize", label: "¿Cuántos son?", q: () => "¿Cuántos son en el equipo?", options: SIZES },
  { key: "city", label: "Ciudad", q: () => "¿En qué ciudad están?" },
];

const MAX: Partial<Record<Key, number>> = { fullName: 80, name: 80, city: 60 };

function Seguir({ last, disabled }: { last: boolean; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="arr-primary" disabled={disabled || pending} aria-disabled={disabled || pending}>
      {pending ? "Armando tu Improvement…" : last ? "Crear mi Improvement" : "Seguir"}
    </button>
  );
}

export function Conversacion({ action, error }: { action: (formData: FormData) => Promise<void>; error?: string }) {
  const [q, setQ] = useState(0);
  const [v, setV] = useState<Record<Key, string>>({ fullName: "", name: "", industry: "", teamSize: "", city: "" });
  const area = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  const p = PREGUNTAS[q]!;
  const last = q === PREGUNTAS.length - 1;
  const listo = p.options ? v[p.key] !== "" : v[p.key].trim().length >= 2;

  // Al cambiar de pregunta, el foco va a su respuesta (no en la primera carga: no robarle el foco a nadie).
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    area.current?.querySelector<HTMLInputElement>(`[data-q="${q}"] input:checked, [data-q="${q}"] input`)?.focus();
  }, [q]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!listo) { e.preventDefault(); return; }
    if (!last) { e.preventDefault(); setQ(q + 1); }
  }

  return (
    <form id={ARRANQUE_FORM} action={action} onSubmit={onSubmit} className="arr-ask" aria-label="Tu negocio">
      <div className="arr-bubble">
        <Isotipo />
        <div>
          <h1 className="arr-q" id="arr-q">{p.q(v)}</h1>
          {p.why && <p className="arr-why">{p.why}</p>}
        </div>
      </div>
      {error && <p className="arr-error" role="alert">{error}</p>}
      <div ref={area}>
        {PREGUNTAS.map((x, i) =>
          x.options ? (
            <fieldset key={x.key} data-q={i} hidden={i !== q} className="arr-chips" aria-label={x.label}>
              {x.options.map(([value, label]) => (
                <label key={value} className="arr-chip">
                  <input type="radio" name={x.key} value={value} checked={v[x.key] === value}
    onChange={() => setV({ ...v, [x.key]: value })} />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>
          ) : (
            <div key={x.key} data-q={i} hidden={i !== q}>
              <input name={x.key} className="arr-big" aria-label={x.label} aria-describedby="arr-q" placeholder="Escribe aquí…"
                value={v[x.key]} maxLength={MAX[x.key]} autoComplete={x.key === "fullName" ? "name" : "off"}
                onChange={(e) => setV({ ...v, [x.key]: e.target.value })} />
            </div>
          ),
        )}
      </div>
      <div className="arr-row">
        <span className="arr-hint">Pregunta {q + 1} de {PREGUNTAS.length} · <kbd>Enter ↵</kbd> para seguir</span>
        <span className="arr-row-end">
          {q > 0 && <button type="button" className="arr-ghost" onClick={() => setQ(q - 1)}>← Atrás</button>}
          <Seguir last={last} disabled={!listo} />
        </span>
      </div>
    </form>
  );
}
