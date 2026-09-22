"use client";

// El Director General, encima de cualquier panel.
//
// Vive en apps/ y no en packages/ui porque sabe dos cosas que son de esta app y de ninguna otra:
// la ruta /api/director y el router de Next. Los estilos sí están en packages/ui/src/building.css,
// donde vive el resto del lenguaje visual — el CSS se comparte, el cableado no.
//
// El hilo se guarda en sessionStorage, y eso no es un detalle de comodidad: la burbuja NAVEGA. Si
// te lleva a Clientes, el componente se vuelve a montar, y sin esto habrías perdido la
// conversación justo por haberle hecho caso.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";

interface Turno {
  role: "user" | "assistant";
  text: string;
  /** Un turno que es un fallo, no una respuesta. Se pinta distinto y NO se le manda al modelo. */
  fallo?: boolean;
}

interface Accion {
  id: string;
  tool: string;
  resumen: string;
  input: unknown;
}

/** Lo que el hilo guarda entre pantallas. Las acciones viajan porque una propuesta sobrevive a la
 *  navegación: te lleva a Clientes y ahí mismo confirmas lo que te armó antes de llevarte. */
interface Guardado {
  abierta: boolean;
  turnos: Turno[];
  acciones: Accion[];
}

const VACIO: Guardado = { abierta: false, turnos: [], acciones: [] };

function llave(orgId: string) {
  return `jpc-dg-burbuja:${orgId}`;
}

function leer(orgId: string): Guardado {
  try {
    const raw = sessionStorage.getItem(llave(orgId));
    if (!raw) return VACIO;
    const x = JSON.parse(raw) as Partial<Guardado>;
    return {
      abierta: Boolean(x.abierta),
      turnos: Array.isArray(x.turnos) ? x.turnos : [],
      acciones: Array.isArray(x.acciones) ? x.acciones : [],
    };
  } catch {
    // Pestaña privada, almacenamiento bloqueado, JSON de una versión vieja: se arranca en blanco.
    return VACIO;
  }
}

// ─── sessionStorage como store externo ──────────────────────────────────────────────────────────
//
// useSyncExternalStore y no useState + useEffect: leer el hilo guardado ES suscribirse a un sistema
// de fuera de React, y hacerlo con un efecto que llama setState provoca el render en cascada que la
// regla react-hooks/set-state-in-effect prohíbe. De paso resuelve la hidratación: el servidor
// renderiza VACIO por getServerSnapshot y el cliente lee el suyo sin desajuste.
//
// `cache` existe porque getSnapshot tiene que devolver la MISMA referencia mientras nada cambie —
// parsear el JSON en cada render devolvería un objeto nuevo cada vez y React entraría en bucle.
// Nunca se escribe durante el render del servidor: allá solo corre getServerSnapshot.

let cache: Guardado | null = null;
let cacheKey = "";
const oyentes = new Set<() => void>();

function subscribe(fn: () => void): () => void {
  oyentes.add(fn);
  return () => {
    oyentes.delete(fn);
  };
}

function snapshot(orgId: string): Guardado {
  const k = llave(orgId);
  if (cacheKey !== k || !cache) {
    cacheKey = k;
    cache = leer(orgId);
  }
  return cache;
}

function snapshotServidor(): Guardado {
  return VACIO;
}

/** Única forma de mover el hilo. Lee el estado vivo, no el que capturó un closure — importa
 *  porque las dos mitades de una pregunta (mandarla y recibirla) ocurren con un await en medio. */
function guardar(orgId: string, cambio: (g: Guardado) => Guardado): void {
  cacheKey = llave(orgId);
  cache = cambio(snapshot(orgId));
  try {
    sessionStorage.setItem(cacheKey, JSON.stringify(cache));
  } catch {
    // Sin almacenamiento la burbuja sigue sirviendo; solo se olvida al recargar la página.
  }
  for (const fn of oyentes) fn();
}

/**
 * Un POST a /api/director que nunca miente sobre lo que pasó.
 *
 * Las tres salidas son distintas a propósito: que el servidor no conteste, que conteste algo que
 * no es JSON (un 500 de Next trae HTML), y que conteste un error nuestro. Antes las tres decían
 * "se cayó la conexión", y la primera vez que faltó ANTHROPIC_API_KEY eso mandó a buscar el
 * problema a la red cuando el servidor había contestado perfectamente.
 */
async function pedir(body: unknown): Promise<{ ok: true; data: any } | { ok: false; message: string }> {
  let res: Response;
  try {
    res = await fetch("/api/director", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, message: "No hay conexión con el servidor." };
  }

  const texto = await res.text().catch(() => "");
  type Sobre = { ok?: boolean; data?: any; error?: { message?: string } };
  let json: Sobre | null;
  try {
    json = JSON.parse(texto) as Sobre;
  } catch {
    // Cuerpo ilegible: casi siempre una excepción sin capturar que Next pintó como HTML. El
    // código de estado es lo único fiable que queda, y decirlo ahorra abrir la consola.
    return {
      ok: false,
      message: `El servidor falló (${res.status}). Mira la consola del servidor: hay un error sin capturar.`,
    };
  }

  if (!json?.ok) return { ok: false, message: json?.error?.message ?? `Error ${res.status}.` };
  return { ok: true, data: json.data };
}

/** Cómo se llama la pantalla donde estamos, para que el Director entienda "esto" y "aquí". */
function nombrePanel(pathname: string): string {
  const ultimo = pathname.split("?")[0]!.split("/").filter(Boolean).pop() ?? "";
  const nombres: Record<string, string> = {
    clientes: "Clientes",
    proyectos: "Proyectos",
    objetivos: "Objetivos",
    equipo: "Equipo",
    tareas: "Mi trabajo",
    control: "Control",
    improvement: "Improvement",
    necesidades: "Necesidades",
    mapa: "Mapa de Construcción",
    powerups: "PowerUps",
    empresas: "Panel del dueño",
    configuracion: "Configuración",
  };
  // El default es la recepción porque /empresas/<orgId> —el edificio— cae aquí: su último segmento
  // es un uuid y nunca va a estar en el mapa.
  return nombres[ultimo] ?? "recepción";
}

export function DirectorBubble({ orgId }: { orgId: string }) {
  const router = useRouter();
  const pathname = usePathname();

  const { abierta, turnos, acciones } = useSyncExternalStore(
    subscribe,
    () => snapshot(orgId),
    snapshotServidor,
  );

  // Lo único que NO sobrevive a la navegación, a propósito: un "Pensando…" que viajara a la
  // pantalla siguiente sería mentira en cuanto llegara, y un borrador a medio escribir es de esta
  // pantalla. Todo lo demás —incluidos los fallos— vive en el hilo.
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);

  const finRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (abierta) finRef.current?.scrollIntoView({ block: "end" });
  }, [abierta, turnos, acciones, pensando]);

  const preguntar = useCallback(
    async (pregunta: string) => {
      const limpia = pregunta.trim();
      if (!limpia || pensando) return;

      // El hilo que viaja es el de ANTES de esta pregunta: el backend le agrega la nueva. Mandarla
      // dos veces haría que el Director se contestara a sí mismo.
      // Los fallos no viajan al modelo: "falta ANTHROPIC_API_KEY" no es algo que el Director dijo,
      // y mandárselo como si lo hubiera dicho le enseñaría a hablar de nuestra configuración.
      const historia = turnos.filter((t) => !t.fallo).slice(-12);
      guardar(orgId, (g) => ({ ...g, turnos: [...g.turnos, { role: "user", text: limpia }] }));
      setTexto("");
      setPensando(true);

      try {
        const r = await pedir({
          action: "preguntar",
          orgId,
          panel: nombrePanel(pathname),
          pregunta: limpia,
          historia,
        });

        if (!r.ok) {
          // El fallo entra AL HILO, no a un estado aparte. Si viviera aparte, la pregunta
          // sobreviviría a la navegación y su error no, y el dueño se encontraría preguntas
          // colgadas sin saber que fallaron — que es peor que ver el error.
          guardar(orgId, (g) => ({
            ...g,
            turnos: [...g.turnos, { role: "assistant", text: r.message, fallo: true }],
          }));
          return;
        }

        guardar(orgId, (g) => ({
          ...g,
          turnos: [...g.turnos, { role: "assistant", text: r.data.texto }],
          acciones:
            Array.isArray(r.data.acciones) && r.data.acciones.length > 0 ? r.data.acciones : g.acciones,
        }));
        // Llevarte al panel es la mitad del producto: contestas corto y lo demás se ve donde vive.
        // La burbuja NO se cierra al navegar — la conversación sigue encima de la pantalla nueva.
        if (r.data.navegar?.url) router.push(r.data.navegar.url);
      } finally {
        setPensando(false);
      }
    },
    [orgId, pathname, pensando, router, turnos],
  );

  async function ejecutar(a: Accion) {
    setPensando(true);
    try {
      const r = await pedir({ action: "ejecutar", orgId, tool: a.tool, input: a.input });

      if (!r.ok) {
        // La acción NO se quita de la lista: falló, sigue pendiente y se puede reintentar.
        guardar(orgId, (g) => ({
          ...g,
          turnos: [...g.turnos, { role: "assistant", text: `No se pudo: ${r.message}`, fallo: true }],
        }));
        return;
      }
      guardar(orgId, (g) => ({
        ...g,
        acciones: g.acciones.filter((x) => x.id !== a.id),
        turnos: [...g.turnos, { role: "assistant", text: `Hecho: ${a.resumen}.` }],
      }));
      // La pantalla de abajo acaba de quedar desactualizada — es Server Component, así que se
      // recarga sola con esto en vez de pedirle al dueño que refresque.
      router.refresh();
    } finally {
      setPensando(false);
    }
  }

  if (!abierta) {
    return (
      <button
        type="button"
        className="jpc-burbuja-fab"
        aria-label="Hablar con tu Director General"
        onClick={() => {
          guardar(orgId, (g) => ({ ...g, abierta: true }));
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
      >
        <span aria-hidden="true">IM</span>
        {acciones.length > 0 && <span className="jpc-burbuja-pin">{acciones.length}</span>}
      </button>
    );
  }

  return (
    <aside className="jpc-burbuja" aria-label="Tu Director General">
      <header className="jpc-burbuja-head">
        <div>
          <strong>Improvement</strong>
          <span className="jpc-burbuja-donde">{nombrePanel(pathname)}</span>
        </div>
        <div className="jpc-burbuja-head-btns">
          {turnos.length > 0 && (
            <button
              type="button"
              className="jpc-burbuja-icono"
              onClick={() => {
                guardar(orgId, (g) => ({ ...g, turnos: [], acciones: [] }));
                        }}
            >
              Limpiar
            </button>
          )}
          <button
            type="button"
            className="jpc-burbuja-icono"
            aria-label="Cerrar"
            onClick={() => guardar(orgId, (g) => ({ ...g, abierta: false }))}
          >
            ✕
          </button>
        </div>
      </header>

      <div className="jpc-burbuja-hilo">
        {turnos.length === 0 && !pensando && (
          <div className="jpc-burbuja-intro">
            <p>Pregúntame lo que quieras de tu empresa. Yo busco y te llevo a donde está.</p>
            <ul>
              {[
                "¿Qué cuentas están frías?",
                "¿Por qué van tarde las entregas?",
                "¿Qué me falta por cargar?",
              ].map((s) => (
                <li key={s}>
                  <button type="button" onClick={() => void preguntar(s)}>
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {turnos.map((t, i) => (
          <p
            key={i}
            className={
              t.fallo
                ? "jpc-burbuja-error"
                : t.role === "user"
                  ? "jpc-burbuja-yo"
                  : "jpc-burbuja-el"
            }
          >
            {t.text}
          </p>
        ))}

        {pensando && <p className="jpc-burbuja-el jpc-burbuja-pensando">Pensando…</p>}

        {acciones.length > 0 && (
          <div className="jpc-burbuja-acciones">
            <p className="jpc-burbuja-acciones-titulo">
              {acciones.length === 1 ? "Te lo dejo listo:" : `Te dejo ${acciones.length} listas:`}
            </p>
            {acciones.map((a) => (
              <div key={a.id} className="jpc-burbuja-accion">
                <span>{a.resumen}</span>
                <div>
                  <button
                    type="button"
                    className="jpc-burbuja-hazlo"
                    disabled={pensando}
                    onClick={() => void ejecutar(a)}
                  >
                    Hazlo
                  </button>
                  <button
                    type="button"
                    className="jpc-burbuja-icono"
                    disabled={pensando}
                    onClick={() =>
                      guardar(orgId, (g) => ({
                        ...g,
                        acciones: g.acciones.filter((x) => x.id !== a.id),
                      }))
                    }
                  >
                    Ahora no
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div ref={finRef} />
      </div>

      <form
        className="jpc-burbuja-pie"
        onSubmit={(e) => {
          e.preventDefault();
          void preguntar(texto);
        }}
      >
        <textarea
          ref={inputRef}
          rows={1}
          value={texto}
          placeholder="Pregúntame o pídeme algo"
          disabled={pensando}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            // Enter manda, Shift+Enter hace párrafo: es un chat, no un formulario.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void preguntar(texto);
            }
          }}
        />
        <button type="submit" className="jpc-burbuja-enviar" disabled={pensando || !texto.trim()}>
          Enviar
        </button>
      </form>
    </aside>
  );
}
