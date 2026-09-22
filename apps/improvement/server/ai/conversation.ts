// El bucle de la burbuja: pregunta → el Director mira → contesta, lleva a un panel, o arma algo
// para que el dueño confirme.
//
// La regla que este archivo hace cumplir, y la razón de que el bucle no sea genérico: las
// herramientas que ESCRIBEN no corren aquí. Se recogen, se resumen y se devuelven como propuesta.
// Es la misma decisión que ya sostiene la fase `sugerencia` del motor —de ahí el ciclo no sale sin
// el dueño— traída a la conversación. Un Director que ejecuta lo que creyó entender es el que hace
// que el dueño deje de hablarle.
import { z } from "zod";
import {
  runConversationTurn,
  type ConversationMessage,
  type ConversationProvider,
} from "./gateway.ts";
import { buildBurbujaSystem, type BurbujaContext } from "./prompts/burbuja.ts";
import { toolByName, toolSpecs, type ToolCtx } from "./tools.ts";

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

/**
 * Cuántas veces puede mirar antes de contestar.
 *
 * Cada vuelta es una llamada pagada. Cuatro alcanzan de sobra para el patrón real —buscar el
 * cliente, leer su contexto, contestar— y cortan el caso en que el modelo se cicle pidiendo lo
 * mismo. Si se acaban, se devuelve lo que haya escrito hasta ahí en vez de un error: media
 * respuesta es mejor que una disculpa.
 */
const MAX_VUELTAS = 4;

/** Una acción lista para ejecutarse en cuanto el dueño toque "Hazlo". */
export interface AccionPropuesta {
  /** El id que le dio el proveedor a la llamada. Solo sirve para que la UI no repita tarjetas. */
  id: string;
  tool: string;
  resumen: string;
  input: unknown;
}

export interface BurbujaRespuesta {
  texto: string;
  /** A qué panel llevarlos, si el Director decidió llevarlos. */
  navegar: { url: string; porque: string } | null;
  acciones: AccionPropuesta[];
}

/**
 * El hilo que la pantalla va guardando y devuelve en cada pregunta.
 *
 * Solo texto: los resultados de herramienta de turnos viejos NO viajan. Se pierde algo de memoria
 * —si preguntas "¿y ese cuánto vale?" el Director vuelve a mirar— y a cambio no hace falta una
 * tabla ni confiar en que el navegador devuelva bloques de herramienta bien armados. Volver a
 * mirar cuesta una llamada; equivocarse de contexto cuesta una decisión.
 */
export const historiaSchema = z
  .array(
    z.object({
      role: z.enum(["user", "assistant"]),
      text: z.string().max(4000),
    }),
  )
  .max(20)
  .default([]);

export type Historia = z.infer<typeof historiaSchema>;

export interface AskCtx extends ToolCtx {
  nombre: string;
  empresa: string;
  panel: string;
  inventario: BurbujaContext["inventario"];
  ownerBrief: string;
  relacion: string;
}

/**
 * Una pregunta a la burbuja, de principio a fin.
 *
 * Las herramientas de mirar y llevar corren aquí mismo y su resultado vuelve al modelo. Las de
 * hacer se acumulan en `acciones` y al modelo se le dice que están esperando confirmación, para
 * que cierre con una frase ("te dejo las dos listas") en vez de creer que ya se ejecutaron.
 */
export async function askDirector(
  ctx: AskCtx,
  historia: Historia,
  pregunta: string,
  provider?: ConversationProvider,
): Promise<Result<BurbujaRespuesta>> {
  const system = buildBurbujaSystem({
    nombre: ctx.nombre,
    esDueno: ctx.esDueno,
    panel: ctx.panel,
    empresa: ctx.empresa,
    inventario: ctx.inventario,
    ownerBrief: ctx.ownerBrief,
    relacion: ctx.relacion,
  });
  const specs = toolSpecs(ctx.esDueno);

  const messages: ConversationMessage[] = [
    ...historia.map<ConversationMessage>((h) =>
      h.role === "user"
        ? { role: "user", text: h.text }
        : { role: "assistant", text: h.text, toolCalls: [] },
    ),
    { role: "user", text: pregunta },
  ];

  const acciones: AccionPropuesta[] = [];
  let navegar: BurbujaRespuesta["navegar"] = null;
  let texto = "";

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const turno = await runConversationTurn(ctx.orgId, system, messages, specs, provider);
    if (!turno.ok) {
      // Si ya había escrito algo en una vuelta anterior, eso se entrega: el dueño prefiere una
      // respuesta a medias a un error, y la propuesta pendiente no se pierde.
      if (texto) break;
      return { ok: false, error: { code: turno.error.code, message: turno.error.message } };
    }

    if (turno.data.text) texto = texto ? `${texto}\n\n${turno.data.text}` : turno.data.text;
    messages.push({ role: "assistant", text: turno.data.text, toolCalls: turno.data.toolCalls });

    if (turno.data.toolCalls.length === 0) break;

    const results = [];
    for (const call of turno.data.toolCalls) {
      const herramienta = toolByName(call.name);

      if (!herramienta || (herramienta.soloDueno && !ctx.esDueno)) {
        results.push({ id: call.id, content: "Esa herramienta no existe.", isError: true });
        continue;
      }

      const parsed = herramienta.schema.safeParse(call.input);
      if (!parsed.success) {
        results.push({
          id: call.id,
          content: `Datos inválidos: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
          isError: true,
        });
        continue;
      }

      if (herramienta.kind === "hacer") {
        acciones.push({
          id: call.id,
          tool: herramienta.name,
          resumen: herramienta.resumen?.(parsed.data as never) ?? herramienta.name,
          input: parsed.data,
        });
        results.push({
          id: call.id,
          content: "Preparada y mostrada para que la confirme. Todavía NO se ejecutó.",
        });
        continue;
      }

      try {
        const salida = await herramienta.run(ctx, parsed.data as never);
        if (herramienta.kind === "llevar" && esNavegacion(salida)) navegar = salida;
        results.push({ id: call.id, content: recortar(JSON.stringify(salida ?? null)) });
      } catch (err) {
        // Un loader que lanza (404 de membresía, por ejemplo) no tumba la conversación: el modelo
        // lee el error como resultado y puede corregir o decirlo.
        results.push({
          id: call.id,
          content: err instanceof Error ? err.message : "Falló la consulta.",
          isError: true,
        });
      }
    }

    messages.push({ role: "results", results });
  }

  return {
    ok: true,
    data: {
      texto: texto || "No supe qué contestar a eso. Dímelo de otra forma.",
      navegar,
      acciones,
    },
  };
}

function esNavegacion(x: unknown): x is { url: string; porque: string } {
  return typeof x === "object" && x !== null && typeof (x as { url?: unknown }).url === "string";
}

/** Tope por resultado de herramienta. Una cartera de 300 cuentas no cabe, y meterla entera haría
 *  que el turno siguiente costara más que la respuesta. Se corta y se avisa que se cortó. */
const MAX_RESULTADO = 6000;
function recortar(json: string): string {
  return json.length <= MAX_RESULTADO
    ? json
    : `${json.slice(0, MAX_RESULTADO)}… (cortado: hay más filas de las que caben, mándalos al panel con abrir_panel)`;
}

/**
 * Ejecuta una acción que el dueño confirmó.
 *
 * Revalida el input contra el esquema aunque ya se haya validado al proponerla: lo que llega aquí
 * viene del navegador, y entre proponer y confirmar pasó un viaje de ida y vuelta. La autorización
 * no la pone este archivo — la pone la función de server/** que la herramienta envuelve, igual que
 * cuando la llama una pantalla. Por eso da igual que el cliente mande una acción que el modelo
 * nunca propuso: recibirá el mismo no que recibiría desde la UI.
 */
export async function runAccion(
  ctx: ToolCtx,
  tool: string,
  input: unknown,
): Promise<Result<unknown>> {
  const herramienta = toolByName(tool);
  if (!herramienta || herramienta.kind !== "hacer") {
    return { ok: false, error: { code: "NOT_FOUND", message: "Esa acción no existe." } };
  }

  const parsed = herramienta.schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Datos inválidos." },
    };
  }

  const salida = await herramienta.run(ctx, parsed.data as never);

  // Las funciones de server/** ya contestan { ok, error } — se devuelve tal cual para que el
  // mensaje que ve el dueño sea el que escribió el dueño del módulo, no uno traducido aquí.
  if (esResultado(salida)) return salida as Result<unknown>;
  return { ok: true, data: salida };
}

function esResultado(x: unknown): boolean {
  return typeof x === "object" && x !== null && "ok" in x;
}
