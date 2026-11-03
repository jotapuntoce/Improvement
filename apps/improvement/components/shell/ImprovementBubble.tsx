"use client";
// La burbuja de Improvement (H1): en todas las pantallas del negocio, siempre verde. Abre un panel
// encima sin salir de la pantalla para apuntar una tarea o preguntar, por texto o por voz (Web Speech
// API del navegador; si no la tiene, no hay micrófono). Quién contesta lo decide el servidor.
import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";

type Message = { id: string; role: "persona" | "improvement"; body: string };
type Outcome = { ok: true; message?: Message } | { ok: false; error: string };

interface Recognition {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;
const noop = () => () => {};
const recognitionCtor = (): RecognitionCtor | undefined =>
  (window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition;

export function ImprovementBubble({
  orgId,
  who,
  recent,
  jot,
  ask,
}: {
  orgId: string;
  who: string;
  recent: Message[];
  jot: (text: string) => Promise<Outcome>;
  ask: (text: string) => Promise<Outcome>;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [messages, setMessages] = useState(recent);
  const [status, setStatus] = useState<string | null>(null);
  // En el servidor no hay navegador: sin micrófono hasta hidratar.
  const voice = useSyncExternalStore(noop, () => Boolean(recognitionCtor()), () => false);
  const [listening, setListening] = useState(false);
  const [pending, start] = useTransition();
  const rec = useRef<Recognition | null>(null);

  function listen() {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    if (listening) return rec.current?.stop();
    const r = new Ctor();
    r.lang = "es-MX";
    r.interimResults = false;
    r.onresult = (e) => setText((t) => [t, Array.from(e.results).map((x) => x[0]!.transcript).join(" ")].filter(Boolean).join(" "));
    r.onend = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  }

  function send(kind: "apuntar" | "preguntar") {
    const value = text.trim();
    if (!value) return;
    start(async () => {
      setStatus(kind === "apuntar" ? "Apuntando…" : "Improvement está pensando…");
      if (kind === "preguntar") setMessages((m) => [...m, { id: `local-${Date.now()}`, role: "persona", body: value }]);
      const r = await (kind === "apuntar" ? jot(value) : ask(value));
      if (!r.ok) return setStatus(r.error);
      setText("");
      if (r.message) setMessages((m) => [...m, r.message!]);
      setStatus(kind === "apuntar" ? "Listo: quedó en tu bandeja." : null);
    });
  }

  return (
    <div className="bubble">
      {open && (
        <section className="bubble-panel" role="dialog" aria-label={`Conversación con ${who}`}>
          <header className="bubble-head">
            <strong>{who}</strong>
            <Link href={`/${orgId}/conversacion`}>Ver todo</Link>
          </header>
          <ol className="bubble-messages" aria-live="polite">
            {messages.map((m) => (
              <li key={m.id} className={m.role === "persona" ? "bubble-me" : "bubble-them"}>{m.body}</li>
            ))}
          </ol>
          <label className="permiso-field">
            <span>Qué necesitas</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000} className="config-input" />
          </label>
          <div className="task-inline">
            {voice && (
              <button type="button" onClick={listen} className="panel-btn-ghost" aria-pressed={listening}>
                {listening ? "Detener micrófono" : "Hablar"}
              </button>
            )}
            <button type="button" onClick={() => send("apuntar")} disabled={pending} className="panel-btn-ghost">Apuntar</button>
            <button type="button" onClick={() => send("preguntar")} disabled={pending} className="panel-cta">Preguntar</button>
          </div>
          {status && <p className="config-hint" role="status">{status}</p>}
        </section>
      )}
      <button type="button" className="bubble-button" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? "Cerrar" : who}
      </button>
    </div>
  );
}
